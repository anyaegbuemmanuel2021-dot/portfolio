import { randomUUID } from 'node:crypto';
import { renderMarkdown } from '../lib/markdown.js';
import { HttpError, slugify } from '../lib/validate.js';
import { fixRow } from '../repositories/base.js';
const now = () => new Date().toISOString();
const imgsIn = md => [...String(md || '').matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map(m => m[1]);
export function articleService(db, { syncUsage }) {
  const withTags = async rows => { for (const a of rows) a.tags = (await db.query('SELECT t.id, t.name, t.slug FROM article_tags t JOIN article_tag_assignments x ON x.tag_id = t.id WHERE x.article_id = $1 ORDER BY t.name', [a.id])).rows; return rows; };
  async function uniqueSlug(base, ignoreId) { let s = slugify(base), i = 1; const exists = async slug => (await db.query(ignoreId ? 'SELECT id FROM articles WHERE slug = $1 AND id <> $2' : 'SELECT id FROM articles WHERE slug = $1', ignoreId ? [slug, ignoreId] : [slug])).rows.length > 0; while (await exists(s)) s = `${slugify(base)}-${++i}`; return s; }
  async function setTags(id, names, tx = db) { await tx.query('DELETE FROM article_tag_assignments WHERE article_id = $1', [id]); for (const name of [...new Set((names || []).map(s => String(s).trim()).filter(Boolean))].slice(0, 15)) { const slug = slugify(name); let t = (await tx.query('SELECT id FROM article_tags WHERE slug = $1', [slug])).rows[0]; if (!t) { t = { id: randomUUID() }; await tx.query('INSERT INTO article_tags (id,name,slug,created_at,updated_at) VALUES ($1,$2,$3,$4,$4)', [t.id, name.slice(0, 40), slug, now()]); } await tx.query('INSERT INTO article_tag_assignments (article_id, tag_id) VALUES ($1,$2)', [id, t.id]); } }
  const svc = {
    async publishDue() { const t = now(); await db.query("UPDATE articles SET status = 'published', published_at = publish_at WHERE status = 'scheduled' AND publish_at <= $1", [t]); },
    async listPublic({ page = 1, limit = 10, category, tag, q }) {
      await svc.publishDue(); const w = ["a.status = 'published'"], p = []; if (category) { p.push(category); w.push(`c.slug = $${p.length}`); } if (q) { p.push('%' + q + '%'); w.push(`(a.title ILIKE $${p.length} OR a.excerpt ILIKE $${p.length})`); } if (tag) { p.push(tag); w.push(`EXISTS (SELECT 1 FROM article_tag_assignments x JOIN article_tags t ON t.id = x.tag_id WHERE x.article_id = a.id AND t.slug = $${p.length})`); }
      const from = `FROM articles a LEFT JOIN article_categories c ON c.id = a.category_id WHERE ${w.join(' AND ')}`; const total = Number((await db.query(`SELECT COUNT(*) AS c ${from}`, p)).rows[0].c); limit = Math.min(+limit || 10, 50);
      const rows = (await db.query(`SELECT a.id, a.title, a.slug, a.excerpt, a.featured_image_url, a.published_at, c.name AS category_name, c.slug AS category_slug ${from} ORDER BY a.published_at DESC LIMIT ${limit} OFFSET ${(Math.max(parseInt(page) || 1, 1) - 1) * limit}`, p)).rows;
      return { rows: await withTags(rows), total, page: +page, limit };
    },
    async getPublic(slug) {
      await svc.publishDue();
      const requested = String(slug || '').toLowerCase();
      const base = requested.replace(/-[0-9]+[a-z]?$/, '');
      const a = (await db.query(`SELECT a.*, c.name AS category_name, c.slug AS category_slug FROM articles a LEFT JOIN article_categories c ON c.id = a.category_id WHERE a.status = 'published' AND (lower(a.slug) = $1 OR lower(a.slug) = $2) ORDER BY CASE WHEN lower(a.slug) = $1 THEN 0 ELSE 1 END, a.published_at DESC LIMIT 1`, [requested, base])).rows[0];
      if (!a) throw new HttpError(404, 'Article not found');
      delete a.content_md; delete a.author_id;
      return (await withTags([a]))[0];
    },
    async listAdmin({ status, q, page = 1, limit = 20 }) { const w = [], p = []; if (status) { p.push(status); w.push(`status = $${p.length}`); } if (q) { p.push('%' + q + '%'); w.push(`title ILIKE $${p.length}`); } const cl = w.length ? ' WHERE ' + w.join(' AND ') : ''; limit = Math.min(+limit || 20, 100); const total = Number((await db.query(`SELECT COUNT(*) AS c FROM articles${cl}`, p)).rows[0].c); const rows = (await db.query(`SELECT id,title,slug,status,excerpt,featured_image_url,published_at,publish_at,updated_at FROM articles${cl} ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${(Math.max(parseInt(page) || 1, 1) - 1) * limit}`, p)).rows; return { rows, total, page: +page, limit }; },
    async getAdmin(id) { const a = (await db.query('SELECT * FROM articles WHERE id = $1', [id])).rows[0]; if (!a) throw new HttpError(404, 'Article not found'); return (await withTags([a]))[0]; },
    async save(id, d, adminId) {
      const html = renderMarkdown(d.content_md || ''); const t = now(); let status = d.status || 'draft';
      if (status === 'scheduled' && (!d.publish_at || new Date(d.publish_at) <= new Date())) status = d.publish_at ? 'published' : 'draft';
      const existing = id ? await svc.getAdmin(id) : null;
      // A title is a record name: never create a second article with the same name.
      if (db.dialect === 'postgres') await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['article-title:' + String(d.title || '').trim().toLowerCase()]);
      const duplicate = (await db.query(id
        ? 'SELECT id FROM articles WHERE lower(trim(title)) = lower(trim($1)) AND id <> $2 LIMIT 1'
        : 'SELECT id FROM articles WHERE lower(trim(title)) = lower(trim($1)) LIMIT 1',
        id ? [d.title, id] : [d.title])).rows[0];
      if (duplicate) throw new HttpError(409, 'Name already exists', { field: 'title' });
      const slug = await uniqueSlug(d.slug || d.title, id);
      const publishedAt = status === 'published' ? (existing?.published_at || (d.publish_at && new Date(d.publish_at) < new Date() ? d.publish_at : t)) : status === 'scheduled' ? d.publish_at : null;
      const f = { title: d.title, slug, excerpt: d.excerpt || null, content_md: d.content_md || '', content_html: html, featured_image_url: d.featured_image_url || null, category_id: d.category_id || null, seo_title: d.seo_title || null, seo_description: d.seo_description || null, canonical_url: d.canonical_url || null, status, publish_at: status === 'scheduled' ? d.publish_at : null, published_at: publishedAt };
      const aid = id || randomUUID();
      await db.tx(async tx => {
        if (existing) { await tx.query('INSERT INTO article_revisions (id,article_id,title,content_md,saved_by,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), id, existing.title, existing.content_md, adminId, t]);
          const keys = Object.keys(f); await tx.query(`UPDATE articles SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = $${keys.length + 1} WHERE id = $${keys.length + 2}`, [...keys.map(k => f[k]), t, id]); }
        else { const keys = Object.keys(f); await tx.query(`INSERT INTO articles (id, author_id, created_at, updated_at, ${keys.join(',')}) VALUES ($1,$2,$3,$3,${keys.map((_, i) => '$' + (i + 4)).join(',')})`, [aid, adminId, t, ...keys.map(k => f[k])]); }
        await tx.query('DELETE FROM article_images WHERE article_id = $1', [aid]); let i = 0; for (const u of imgsIn(d.content_md)) await tx.query('INSERT INTO article_images (id,article_id,url,alt,sort_order) VALUES ($1,$2,$3,NULL,$4)', [randomUUID(), aid, u, i++]);
        await setTags(aid, d.tags, tx);
        await tx.query('DELETE FROM article_revisions WHERE article_id = $1 AND id NOT IN (SELECT id FROM article_revisions WHERE article_id = $1 ORDER BY created_at DESC LIMIT 30)', [aid]);
      });
      await syncUsage('article', aid, [f.featured_image_url, ...imgsIn(d.content_md)]); return svc.getAdmin(aid);
    },
    async setStatus(id, status, adminId) {
      if (!['draft', 'published'].includes(status)) throw new HttpError(422, 'Invalid article status');
      const current = await svc.getAdmin(id);
      const publishedAt = status === 'published' ? (current.published_at || now()) : null;
      await db.query(
        'UPDATE articles SET status = $1, published_at = $2, publish_at = NULL, updated_at = $3 WHERE id = $4',
        [status, publishedAt, now(), id]
      );
      return svc.getAdmin(id);
    },
    revisions: async id => (await db.query('SELECT id, title, created_at FROM article_revisions WHERE article_id = $1 ORDER BY created_at DESC', [id])).rows,
    async restore(id, revId, adminId) { const r = (await db.query('SELECT * FROM article_revisions WHERE id = $1 AND article_id = $2', [revId, id])).rows[0]; if (!r) throw new HttpError(404, 'Revision not found'); const a = await svc.getAdmin(id); return svc.save(id, { ...a, tags: a.tags.map(t => t.name), title: r.title, content_md: r.content_md }, adminId); },
    async remove(id) { await db.query("DELETE FROM media_usage_references WHERE entity = 'article' AND entity_id = $1", [id]); return (await db.query('DELETE FROM articles WHERE id = $1', [id])).rowCount > 0; },
    async countView(slug, day) { const a = (await db.query("SELECT id FROM articles WHERE slug = $1 AND status = 'published'", [slug])).rows[0]; if (a) await db.query('INSERT INTO article_views (article_id, day, count) VALUES ($1,$2,1) ON CONFLICT (article_id, day) DO UPDATE SET count = article_views.count + 1', [a.id, day]); },
  };
  return svc;
}
