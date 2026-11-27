import { randomUUID } from 'node:crypto';
import { HttpError } from '../lib/validate.js';
import { config } from '../config.js';

const now = () => new Date().toISOString();
const platforms = ['facebook', 'instagram', 'linkedin'];
const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const firstImage = html => { const match = String(html || '').match(/<img\b[^>]*?src=["']([^"']+)["']/i); return match ? match[1] : null; };
const tags = value => (Array.isArray(value) ? value : []).map(t => String(t.name || t).replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean).slice(0, 5).map(t => '#' + t).join(' ');

function captionFor(platform, article, url) {
  const title = clean(article.title);
  const excerpt = clean(article.excerpt || article.content_html || '').slice(0, 420);
  const hashtags = tags(article.tags);
  if (platform === 'linkedin') return [title, excerpt, 'Read the full article: ' + url, hashtags].filter(Boolean).join('\n\n');
  if (platform === 'instagram') return [title, excerpt, 'Read the full article through the link in bio or story:', url, hashtags || '#WebDevelopment #ProfessionalGrowth'].filter(Boolean).join('\n\n');
  return [title, excerpt, 'Read the full article:', url, hashtags].filter(Boolean).join('\n\n');
}

export function socialService(db, { linkedin } = {}) {
  async function enqueueArticle(articleId) {
    const article = (await db.query("SELECT id,title,slug,excerpt,content_html,featured_image_url,canonical_url,status FROM articles WHERE id = $1", [articleId])).rows[0];
    if (!article || article.status !== 'published') return [];
    const url = config.siteUrl.replace(/\/+$/, '') + '/articles/' + encodeURIComponent(article.slug);
    const tagRows = (await db.query('SELECT t.name FROM article_tags t JOIN article_tag_assignments x ON x.tag_id=t.id WHERE x.article_id=$1 ORDER BY t.name', [articleId])).rows;
    article.tags = tagRows;
    const created = [];
    for (const platform of platforms) {
      const id = randomUUID(), t = now();
      const result = await db.query(
        'INSERT INTO social_posts (id,article_id,platform,caption,link_url,media_url,media_kind,audio_status,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9,$9) ON CONFLICT (article_id,platform) DO NOTHING',
        [id, articleId, platform, captionFor(platform, article, url), url, 'video_required', 'needs_licensed_audio', 'draft', t]
      );
      if (result.rowCount) created.push({ id, platform });
    }
    return created;
  }

  async function connections() {
    const checks = [
      { platform: 'facebook', required: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'], permissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'], note: 'Connect a Facebook Page; a personal profile alone cannot be used for Page publishing.' },
      { platform: 'instagram', required: ['INSTAGRAM_BUSINESS_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'], permissions: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'], note: 'Use an Instagram Professional account linked to a Facebook Page. Reels publishing needs a publicly reachable video URL.' },
    ];
    const rows = checks.map(item => {
      const missing = item.required.filter(key => !process.env[key]);
      return { platform: item.platform, connected: missing.length === 0, missing, permissions: item.permissions, note: item.note };
    });
    const li = linkedin ? await linkedin.status() : { connected: false, configured: false };
    rows.push({
      platform: 'linkedin', connected: li.connected, missing: li.configured ? [] : ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
      permissions: ['w_member_social', 'openid', 'profile'],
      note: 'Personal LinkedIn profile publishing. Connect securely with LinkedIn OAuth; no company-page permission is used.',
    });
    return rows;
  }

  async function publishLinkedinArticle(articleId, { force = false } = {}) {
    if (!linkedin) return { skipped: true, reason: 'LinkedIn integration unavailable' };
    const connection = await linkedin.status();
    if (!connection.connected || (!force && !connection.auto_post_enabled)) return { skipped: true, reason: 'LinkedIn automatic posting is disabled or the account is disconnected' };
    const post = (await db.query("SELECT s.id,s.caption,s.status,s.link_url,a.title AS article_title,a.excerpt AS article_excerpt,a.content_html AS article_content_html,COALESCE(a.featured_image_url,(SELECT ai.url FROM article_images ai WHERE ai.article_id=a.id ORDER BY ai.sort_order ASC LIMIT 1)) AS article_image FROM social_posts s JOIN articles a ON a.id=s.article_id WHERE s.article_id=$1 AND s.platform='linkedin'", [articleId])).rows[0];
    if (!post || ['published', 'publishing'].includes(post.status)) return { skipped: true, reason: 'No eligible LinkedIn outbox item' };
    const claim = await db.query("UPDATE social_posts SET status='publishing',last_error=NULL,updated_at=$1 WHERE id=$2 AND status IN ('draft','approved','failed') RETURNING id", [now(), post.id]);
    if (!claim.rowCount) return { skipped: true, reason: 'LinkedIn post is already being processed' };
    try {
      const result = await linkedin.publishPost(post.caption, { source: post.link_url, title: post.article_title, description: post.article_excerpt || post.article_title, image: post.article_image || firstImage(post.article_content_html) });
      await db.query("UPDATE social_posts SET status='published',published_url=$1,last_error=NULL,published_at=$2,updated_at=$2 WHERE id=$3", [result.published_url, now(), post.id]);
      return { status: 'published', published_url: result.published_url, post_urn: result.post_urn };
    } catch (error) {
      await db.query("UPDATE social_posts SET status='failed',last_error=$1,updated_at=$2 WHERE id=$3", [String(error.message || 'LinkedIn publishing failed').slice(0, 1000), now(), post.id]);
      return { status: 'failed', error: String(error.message || 'LinkedIn publishing failed').slice(0, 1000) };
    }
  }

  return {
    connections,
    async enqueueArticle(articleId) { return enqueueArticle(articleId); },
    async publishLinkedinArticle(articleId) { return publishLinkedinArticle(articleId); },
    async retryLinkedin(id) {
      const post = (await db.query('SELECT id,article_id,platform,status FROM social_posts WHERE id=$1', [id])).rows[0];
      if (!post || post.platform !== 'linkedin') throw new HttpError(404, 'LinkedIn post not found');
      if (post.status === 'published') return { status: 'published', skipped: true };
      return publishLinkedinArticle(post.article_id, { force: true });
    },
    async syncPublishedArticles() {
      const rows = (await db.query("SELECT a.id FROM articles a WHERE a.status='published' ORDER BY a.published_at DESC LIMIT 100")).rows;
      let count = 0;
      for (const row of rows) count += (await enqueueArticle(row.id)).length;
      return count;
    },
    async list({ status, platform, limit = 50 } = {}) {
      const where = [], params = [];
      if (status) { params.push(status); where.push('s.status=$' + params.length); }
      if (platform) { if (!platforms.includes(platform)) throw new HttpError(422, 'Unsupported social platform'); params.push(platform); where.push('s.platform=$' + params.length); }
      params.push(Math.min(Math.max(Number(limit) || 50, 1), 100));
      return (await db.query(`SELECT s.*,a.title AS article_title,a.slug AS article_slug,a.featured_image_url FROM social_posts s JOIN articles a ON a.id=s.article_id ${where.length ? 'WHERE '+where.join(' AND ') : ''} ORDER BY s.created_at DESC LIMIT $${params.length}`, params)).rows;
    },
    async update(id, input) {
      const allowed = {};
      if (input.caption !== undefined) {
        const caption = String(input.caption).trim();
        if (!caption || caption.length > 5000) throw new HttpError(422, 'Caption must be between 1 and 5000 characters');
        allowed.caption = caption;
      }
      if (input.media_url !== undefined) {
        const media = String(input.media_url || '').trim();
        if (media && !/^https:\/\//i.test(media)) throw new HttpError(422, 'Social video URL must use HTTPS');
        allowed.media_url = media || null;
      }
      if (input.status !== undefined) {
        if (!['draft','approved','paused'].includes(input.status)) throw new HttpError(422, 'Status can only be draft, approved or paused');
        allowed.status = input.status;
      }
      const keys = Object.keys(allowed);
      if (!keys.length) throw new HttpError(422, 'No supported fields supplied');
      const result = await db.query(`UPDATE social_posts SET ${keys.map((k,i)=>k+'=$'+(i+1)).join(',')},updated_at=$${keys.length+1} WHERE id=$${keys.length+2} RETURNING id`, [...keys.map(k=>allowed[k]),now(),id]);
      if (!result.rowCount) throw new HttpError(404, 'Social post not found');
      return (await db.query('SELECT * FROM social_posts WHERE id=$1',[id])).rows[0];
    },
    async summary() {
      const rows = (await db.query('SELECT platform,status,COUNT(*) AS count FROM social_posts GROUP BY platform,status ORDER BY platform,status')).rows;
      const connectionRows = await connections();
      const li = linkedin ? await linkedin.status() : { connected: false, auto_post_enabled: false };
      return { platforms, rows, connections: connectionRows, linkedin: li, automatic_delivery: Boolean(li.connected && li.auto_post_enabled), note: 'LinkedIn publishes article text, its link and the article featured image (when present) after an article is made public. Other social platforms remain in the review outbox.' };
    }
  };
}
