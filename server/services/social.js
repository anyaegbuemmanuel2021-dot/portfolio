import { randomUUID } from 'node:crypto';
import { HttpError } from '../lib/validate.js';
import { config } from '../config.js';

const now = () => new Date().toISOString();
const platforms = ['facebook', 'instagram', 'linkedin'];
const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const tags = value => (Array.isArray(value) ? value : []).map(t => String(t.name || t).replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean).slice(0, 5).map(t => '#' + t).join(' ');

function captionFor(platform, article, url) {
  const title = clean(article.title);
  const excerpt = clean(article.excerpt || article.content_html || '').slice(0, 420);
  const hashtags = tags(article.tags);
  if (platform === 'linkedin') return [title, excerpt, 'Read the full article:', url, hashtags].filter(Boolean).join('\n\n');
  if (platform === 'instagram') return [title, excerpt, 'Read the full article through the link in bio or story:', url, hashtags || '#WebDevelopment #ProfessionalGrowth'].filter(Boolean).join('\n\n');
  return [title, excerpt, 'Read the full article:', url, hashtags].filter(Boolean).join('\n\n');
}

export function socialService(db) {
  async function enqueueArticle(articleId) {
    const article = (await db.query("SELECT id,title,slug,excerpt,content_html,featured_image_url,canonical_url,status FROM articles WHERE id = $1", [articleId])).rows[0];
    if (!article || article.status !== 'published') return [];
    const url = article.canonical_url || config.siteUrl + '/articles/' + article.slug;
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

  function connections() {
    const checks = [
      { platform: 'facebook', required: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'], permissions: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'], note: 'Connect a Facebook Page; a personal profile alone cannot be used for Page publishing.' },
      { platform: 'instagram', required: ['INSTAGRAM_BUSINESS_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'], permissions: ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'], note: 'Use an Instagram Professional account linked to a Facebook Page. Reels publishing needs a publicly reachable video URL.' },
      { platform: 'linkedin', required: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_AUTHOR_URN'], permissions: ['w_member_social'], note: 'For an organisation page, use its author URN and the required organisation posting permission.' }
    ];
    return checks.map(item => {
      const missing = item.required.filter(key => !process.env[key]);
      return { platform: item.platform, connected: missing.length === 0, missing, permissions: item.permissions, note: item.note };
    });
  }

  return {
    connections,
    async enqueueArticle(articleId) { return enqueueArticle(articleId); },
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
      return { platforms, rows, connections: connections(), automatic_delivery: false, note: 'Posts are generated into this outbox. Platform publishing and licensed video-audio rendering require connected platform credentials and an approved media asset.' };
    }
  };
}
