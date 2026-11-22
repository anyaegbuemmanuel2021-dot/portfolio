import { HttpError, validate } from '../lib/validate.js';
import { kv, tableRepo, fixRow } from '../repositories/base.js';
import { randomUUID } from 'node:crypto';
import { exportAll, importAll, recordBackup } from '../services/backup.js';
import { migrationStatus } from '../migrate.js';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { safeEq } from '../lib/security.js';
const now = () => new Date().toISOString();
export function adminRoutes(app, { db, auth, articles, media, leads, email, ads, analytics, storage, mailer, social }) {
  const settings = kv(db, 'site_settings'); const sys = kv(db, 'system_settings');
  // ---- articles ----
  const A = { title: { required: true, max: 200 }, slug: { max: 100 }, excerpt: { max: 500 }, content_md: { max: 200000 }, featured_image_url: { type: 'url' }, category_id: { max: 40 }, seo_title: { max: 120 }, seo_description: { max: 300 }, canonical_url: { type: 'url', relative: false }, status: { enum: ['draft', 'published', 'scheduled'] }, publish_at: { type: 'date' } };
  const g = p => ({ auth: p });
  const artIn = ctx => { const d = validate(A, ctx.body); d.tags = Array.isArray(ctx.body.tags) ? ctx.body.tags.map(String).slice(0, 15) : []; return d; };
  app.get('/api/admin/articles', g('articles'), async ctx => { const r = await articles.listAdmin(ctx.query); return { data: r.rows, meta: { total: r.total, page: r.page, limit: r.limit } }; });
  app.post('/api/admin/articles', g('articles'), async ctx => { const a = await articles.save(null, artIn(ctx), ctx.admin.id); if (a.status === 'published') await social.enqueueArticle(a.id); app.invalidate(); await auth.audit(ctx, 'create', 'article', a.id); return { status: 201, data: a }; });
  app.get('/api/admin/articles/:id', g('articles'), ctx => articles.getAdmin(ctx.params.id));
  app.put('/api/admin/articles/:id', g('articles'), async ctx => { const a = await articles.save(ctx.params.id, artIn(ctx), ctx.admin.id); if (a.status === 'published') await social.enqueueArticle(a.id); app.invalidate(); await auth.audit(ctx, 'update', 'article', a.id); return a; });
  app.post('/api/admin/articles/:id/publish', g('articles'), async ctx => { const a = await articles.setStatus(ctx.params.id, 'published', ctx.admin.id); await social.enqueueArticle(a.id); app.invalidate(); await auth.audit(ctx, 'publish', 'article', ctx.params.id); return a; });
  app.post('/api/admin/articles/:id/unpublish', g('articles'), async ctx => { const a = await articles.setStatus(ctx.params.id, 'draft', ctx.admin.id); app.invalidate(); await auth.audit(ctx, 'unpublish', 'article', ctx.params.id); return a; });
  app.delete('/api/admin/articles/:id', g('articles'), async ctx => { if (!(await articles.remove(ctx.params.id))) throw new HttpError(404, 'Article not found'); app.invalidate(); await auth.audit(ctx, 'delete', 'article', ctx.params.id); return { deleted: true }; });
  app.get('/api/admin/articles/:id/revisions', g('articles'), ctx => articles.revisions(ctx.params.id));
  app.post('/api/admin/articles/:id/restore/:rev', g('articles'), ctx => articles.restore(ctx.params.id, ctx.params.rev, ctx.admin.id));
  app.post('/api/admin/markdown-preview', { auth: 'articles' }, async ctx => { const { renderMarkdown } = await import('../lib/markdown.js'); return { html: renderMarkdown(String(ctx.body.md || '').slice(0, 200000)) }; });
  // ---- social publishing outbox ----
  app.get('/api/social/posts', g('articles'), async ctx => ({ data: await social.list({ status: ctx.query.status, platform: ctx.query.platform, limit: ctx.query.limit }) }));
  app.get('/api/social/summary', g('articles'), () => social.summary());
  app.patch('/api/social/posts/:id', g('articles'), async ctx => { const post = await social.update(ctx.params.id, ctx.body || {}); await auth.audit(ctx, 'update', 'social_post', post.id, { platform: post.platform, status: post.status }); return post; });
  app.post('/api/social/sync', g('articles'), async ctx => { const created = await social.syncPublishedArticles(); await auth.audit(ctx, 'sync', 'social_outbox', null, { created }); return { created }; });
  // ---- settings & biography ----
  app.get('/api/admin/settings', g('content'), async () => ({ ...(await settings.all()) }));
  app.put('/api/admin/settings', g('content'), async ctx => { const ok = ['site_title', 'site_tagline', 'contact_email', 'contact_phone', 'contact_location', 'education', 'portfolio_url', 'whatsapp_number', 'footer_tagline', 'footer_text', 'contact_intro', 'service_cta_title', 'service_cta_body', 'about_story_1', 'about_story_2', 'about_story_3', 'about_story_4', 'certifications_json', 'pricing_json', 'process_json', 'seo_default_title', 'seo_default_description', 'canonical_base', 'page_home_visible', 'page_about_visible', 'page_projects_visible', 'page_services_visible', 'page_articles_visible', 'page_contact_visible']; for (const [k, v] of Object.entries(ctx.body || {})) if (ok.includes(k)) await settings.set(k, String(v).slice(0, 12000)); app.invalidate(); await auth.audit(ctx, 'update', 'settings'); return settings.all(); });
  app.get('/api/admin/biography', g('content'), async () => fixRow((await db.query('SELECT * FROM biography LIMIT 1')).rows[0]) || {});
  app.put('/api/admin/biography', g('content'), async ctx => { const d = validate({ headline: { max: 200 }, body: { max: 10000 }, photo_url: { type: 'url' }, cv_url: { type: 'url' } }, ctx.body); const ex = (await db.query('SELECT id FROM biography LIMIT 1')).rows[0]; if (ex) { const k = Object.keys(d); if (k.length) await db.query(`UPDATE biography SET ${k.map((c, i) => `${c} = $${i + 1}`).join(',')}, updated_at = $${k.length + 1} WHERE id = $${k.length + 2}`, [...k.map(c => d[c]), now(), ex.id]); } else await db.query('INSERT INTO biography (id,headline,body,photo_url,cv_url,updated_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), d.headline || null, d.body || null, d.photo_url || null, d.cv_url || null, now()]); app.invalidate(); return fixRow((await db.query('SELECT * FROM biography LIMIT 1')).rows[0]); });
  // ---- media ----
  app.post('/api/media/upload', { auth: 'media', raw: true, maxBody: config.maxUploadBytes + 1024 }, async ctx => { const name = decodeURIComponent(ctx.req.headers['x-filename'] || 'upload'); const m = await media.upload(ctx.body, { filename: name, folderId: ctx.query.folder || null, alt: ctx.query.alt || null, adminId: ctx.admin.id }); await auth.audit(ctx, 'upload', 'media', m.id); return { status: 201, data: m }; });
  app.get('/api/media', g('media'), async ctx => { const r = await media.list({ q: ctx.query.q, type: ctx.query.type, folderId: ctx.query.folder, page: ctx.query.page, limit: ctx.query.limit }); return { data: r.rows, meta: { total: r.total, page: r.page, limit: r.limit } }; });
  app.get('/api/media/:id/usage', g('media'), ctx => media.usage(ctx.params.id));
  app.patch('/api/media/:id', g('media'), async ctx => {
    const d = validate({ alt_text: { max: 200 }, folder_id: { max: 40 } }, ctx.body, { partial: true });
    const current = (await db.query('SELECT id FROM media_files WHERE id = $1', [ctx.params.id])).rows[0];
    if (!current) throw new HttpError(404, 'Media file not found');
    if (d.folder_id) {
      const folder = (await db.query('SELECT id FROM media_folders WHERE id = $1', [d.folder_id])).rows[0];
      if (!folder) throw new HttpError(422, 'Media folder not found', { field: 'folder_id' });
    }
    const keys = Object.keys(d);
    if (keys.length) { const mark = String.fromCharCode(36); const assignments = keys.map((key, index) => key + ' = ' + mark + (index + 1)).join(','); await db.query('UPDATE media_files SET ' + assignments + ' WHERE id = ' + mark + (keys.length + 1), [...keys.map(key => d[key]), ctx.params.id]); }
    await auth.audit(ctx, 'update', 'media', ctx.params.id, { fields: keys });
    return { updated: true, data: (await db.query('SELECT * FROM media_files WHERE id = $1', [ctx.params.id])).rows[0] };
  });
  app.delete('/api/media/:id', g('media'), async ctx => { await media.remove(ctx.params.id, { force: ctx.query.force === '1' }); await auth.audit(ctx, 'delete', 'media', ctx.params.id); return { deleted: true }; });
  // ---- leads / CRM ----
  app.get('/api/leads', g('leads'), async ctx => { const w = [], p = []; if (ctx.query.status) { p.push(ctx.query.status); w.push(`l.status = $${p.length}`); } if (ctx.query.q) { p.push('%' + ctx.query.q + '%'); w.push(`(c.name ILIKE $${p.length} OR c.email ILIKE $${p.length} OR l.message ILIKE $${p.length})`); } const cl = w.length ? ' WHERE ' + w.join(' AND ') : ''; const limit = Math.min(+ctx.query.limit || 20, 100), page = Math.max(+ctx.query.page || 1, 1);
    const total = Number((await db.query(`SELECT COUNT(*) AS c FROM leads l JOIN contacts c ON c.id = l.contact_id${cl}`, p)).rows[0].c); const rows = (await db.query(`SELECT l.id,l.status,l.score,l.service,l.budget,SUBSTR(l.message,1,160) AS preview,l.created_at,c.name,c.email,c.phone FROM leads l JOIN contacts c ON c.id = l.contact_id${cl} ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`, p)).rows; return { data: rows, meta: { total, page, limit } }; });
  app.get('/api/leads/:id', g('leads'), async ctx => { const l = (await db.query('SELECT l.*, c.name, c.email, c.phone FROM leads l JOIN contacts c ON c.id = l.contact_id WHERE l.id = $1', [ctx.params.id])).rows[0]; if (!l) throw new HttpError(404, 'Not found'); return { ...l, activities: (await db.query('SELECT * FROM lead_activities WHERE lead_id = $1 ORDER BY created_at DESC', [l.id])).rows, messages: (await db.query('SELECT id, direction, body, created_at FROM contact_messages WHERE lead_id = $1 ORDER BY created_at', [l.id])).rows, follow_ups: (await db.query('SELECT * FROM follow_up_records WHERE lead_id = $1 ORDER BY due_at', [l.id])).rows }; });
  app.patch('/api/leads/:id', g('leads'), async ctx => { const d = validate({ status: { enum: ['new', 'qualified', 'contacted', 'negotiating', 'converted', 'rejected', 'spam'] }, notes: { max: 4000 } }, ctx.body, { partial: true }); const old = (await db.query('SELECT status FROM leads WHERE id = $1', [ctx.params.id])).rows[0]; if (!old) throw new HttpError(404, 'Not found');
    await db.query('UPDATE leads SET status = COALESCE($1,status), notes = COALESCE($2,notes), updated_at = $3, converted_at = CASE WHEN $1 = \'converted\' THEN $3 ELSE converted_at END WHERE id = $4', [d.status ?? null, d.notes ?? null, now(), ctx.params.id]);
    if (d.status && d.status !== old.status) { await db.query('INSERT INTO lead_activities (id,lead_id,type,note,admin_id,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), ctx.params.id, 'status', `${old.status} → ${d.status}`, ctx.admin.id, now()]); if (d.status === 'converted') await db.query("INSERT INTO conversion_events (id,type,ref_id,day,created_at) VALUES ($1,'converted_lead',$2,$3,$4)", [randomUUID(), ctx.params.id, now().slice(0, 10), now()]); } return { updated: true }; });
  app.post('/api/leads/:id/activities', g('leads'), async ctx => { const d = validate({ type: { enum: ['note', 'call', 'email', 'whatsapp', 'meeting'], required: true }, note: { max: 2000, required: true } }, ctx.body); await db.query('INSERT INTO lead_activities (id,lead_id,type,note,admin_id,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), ctx.params.id, d.type, d.note, ctx.admin.id, now()]); return { status: 201, data: { added: true } }; });
  app.post('/api/leads/:id/follow-ups', g('leads'), async ctx => { const d = validate({ due_at: { type: 'date', required: true }, note: { max: 500 } }, ctx.body); await db.query('INSERT INTO follow_up_records (id,lead_id,due_at,note,created_at) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), ctx.params.id, d.due_at, d.note || null, now()]); return { status: 201, data: { added: true } }; });
  app.delete('/api/leads/:id', g('leads'), async ctx => { await db.query('DELETE FROM leads WHERE id = $1', [ctx.params.id]); await auth.audit(ctx, 'delete', 'lead', ctx.params.id); return { deleted: true }; });
  // ---- email ----
  app.post('/api/email/send', g('email'), async ctx => { const d = validate({ to: { type: 'email', required: true }, subject: { required: true, max: 200 }, body: { required: true, max: 20000 }, conversationId: { max: 40 } }, ctx.body); const r = await email.send(d, ctx.admin.id); await auth.audit(ctx, 'send', 'email', null, { to: d.to }); return { status: 201, data: r }; });
  app.post('/api/email/test', g('email'), async ctx => email.send({ to: ctx.admin.email, subject: 'Test email from your portfolio admin', body: 'If you received this, email delivery works.' }, ctx.admin.id));
  app.get('/api/email/logs', g('email'), async ctx => { const p = []; let w = ''; if (ctx.query.status) { p.push(ctx.query.status); w = ' WHERE status = $1'; } return (await db.query(`SELECT * FROM email_delivery_logs${w} ORDER BY created_at DESC LIMIT 100`, p)).rows; });
  app.get('/api/email/conversations', g('email'), async () => (await db.query('SELECT * FROM email_conversations ORDER BY last_message_at DESC LIMIT 100')).rows);
  app.get('/api/email/conversations/:id', g('email'), async ctx => (await db.query('SELECT * FROM email_messages WHERE conversation_id = $1 ORDER BY created_at', [ctx.params.id])).rows);
  app.get('/api/email/search', g('email'), ctx => email.searchMessages(String(ctx.query.q || '')));
  app.get('/api/email/subscribers', g('email'), async () => (await db.query('SELECT id,email,name,status,subscribed_at FROM email_subscribers ORDER BY subscribed_at DESC LIMIT 500')).rows);
  app.post('/api/email/campaigns/:id/send', g('email'), async ctx => { const r = await email.sendCampaign(ctx.params.id); await auth.audit(ctx, 'send', 'campaign', ctx.params.id, r); return r; });
  app.post('/api/email/inbound', async ctx => { await rateLimit('email-inbound:' + ctx.ipHash, 20, 60e3, db); const s = config.email.inboundSecret; if (!s || !safeEq(ctx.req.headers['x-inbound-secret'] || '', s)) throw new HttpError(401, 'Unauthorized'); const d = validate({ from: { type: 'email', required: true }, subject: { max: 200 }, body: { required: true, max: 20000 }, name: { max: 100 } }, ctx.body); return { status: 201, data: await email.receive(d) }; });
  app.post('/api/email/ai-assist', g('email'), async ctx => { const { aiAssist } = await import('../providers/ai.js'); const d = validate({ subject: { max: 200 }, body: { required: true, max: 8000 }, senderName: { max: 100 } }, ctx.body); return aiAssist(d); });
  // ---- ads ----
  app.get('/api/advertisements/performance', g('ads'), ctx => ads.performance(ctx.query));
  app.get('/api/advertisements/network', g('ads'), () => ads.network());
  app.put('/api/advertisements/network', g('ads'), async ctx => { for (const [k, v] of Object.entries(ctx.body || {})) { if (!['adsense', 'adsense_ads_txt', 'self_managed'].includes(k)) continue; const val = k === 'adsense' ? String(v.value || '').trim() : String(v.value ?? ''); if (k === 'adsense' && val && !/^ca-pub-\d{8,20}$/.test(val)) throw new HttpError(422, 'AdSense publisher ID must look like ca-pub-1234567890123456'); await db.query('INSERT INTO ad_network_settings (key,value,enabled,updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (key) DO UPDATE SET value = $2, enabled = $3, updated_at = $4', [k, val, !!v.enabled, now()]); } app.invalidate(); await auth.audit(ctx, 'update', 'ad_network'); return ads.network(); });
  // ---- analytics / system ----
  app.get('/api/analytics/summary', g('analytics'), ctx => analytics.summary(ctx.query));
  app.get('/api/system/overview', g(true), async ctx => {
    const c = async s => Number((await db.query(s)).rows[0].c); const a = await analytics.summary({}); const m = await media.stats(); const lastB = (await db.query('SELECT created_at, status, verified_at FROM backup_history ORDER BY created_at DESC LIMIT 1')).rows[0];
    let dbBytes = null; if (db.dialect === 'postgres') dbBytes = Number((await db.query('SELECT pg_database_size(current_database()) AS s')).rows[0].s);
    const recent = (await db.query('SELECT l.id, l.status, l.created_at, c.name FROM leads l JOIN contacts c ON c.id = l.contact_id ORDER BY l.created_at DESC LIMIT 5')).rows; const ms = await migrationStatus(db);
    return { visitors: a.visitors, page_views: a.page_views, series: a.series, leads: a.leads, contact_submissions: a.contact_submissions, ads: a.ads, articles: { published: await c("SELECT COUNT(*) AS c FROM articles WHERE status = 'published'"), draft: await c("SELECT COUNT(*) AS c FROM articles WHERE status = 'draft'"), scheduled: await c("SELECT COUNT(*) AS c FROM articles WHERE status = 'scheduled'"), views: await c('SELECT COALESCE(SUM(count),0) AS c FROM article_views') }, project_views: await c('SELECT COALESCE(SUM(count),0) AS c FROM project_views'),
      email: { sent: await c("SELECT COUNT(*) AS c FROM email_delivery_logs WHERE status = 'sent'"), failed: await c("SELECT COUNT(*) AS c FROM email_delivery_logs WHERE status = 'failed'"), provider: mailer.name, real_delivery: mailer.real }, storage: { db_bytes: dbBytes, media_bytes: m.bytes, media_files: m.files, provider: storage.name }, backup: lastB || null,
      health: { database: db.dialect, migrations_pending: ms.pending.length, email_provider: mailer.name, storage_provider: storage.name, ai: config.ai.provider, https_cookie_secure: config.isProd }, recent_leads: recent, data_is_real: true };
  });
  app.get('/api/system/audit', g('system'), async () => (await db.query('SELECT a.*, d.email FROM audit_logs a LEFT JOIN admins d ON d.id = a.admin_id ORDER BY a.created_at DESC LIMIT 100')).rows);
  app.get('/api/system/security-events', g('system'), async () => (await db.query('SELECT type, email, created_at FROM security_events ORDER BY created_at DESC LIMIT 100')).rows);
  app.get('/api/system/logs', g('system'), async () => (await db.query('SELECT level, message, created_at FROM application_logs ORDER BY created_at DESC LIMIT 100')).rows);
  app.post('/api/system/purge', g('system'), async ctx => ({ purged_rows: await analytics.purge(config.retentionDays) }));
  app.get('/api/migrations', g('system'), async () => { const s = await migrationStatus(db); return { applied: s.applied, pending: s.pending.map(p => p.name), drift: s.drift }; });
  // ---- backups ----
  app.get('/api/backups', g('system'), async () => (await db.query('SELECT * FROM backup_history ORDER BY created_at DESC LIMIT 50')).rows);
  app.post('/api/backups/export', g('system'), async ctx => { const x = await exportAll(db); await recordBackup(db, { kind: 'manual-json', status: 'ok', size: x.size, checksum: x.checksum, verified: true, notes: 'Downloaded by admin', adminId: ctx.admin.id }); await auth.audit(ctx, 'backup_export', 'system', null, { size: x.size });
    return { __raw: true, headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="portfolio-backup-${now().slice(0, 10)}.json"`, 'X-Backup-Checksum': x.checksum, 'Cache-Control': 'no-store' }, body: x.json }; });
  app.post('/api/backups/import', { auth: 'system', maxBody: 200 * 1024 * 1024 }, async ctx => { // Restore INTO ANOTHER database: body {target_url, backup, force}
    // A caller-supplied database URL is an SSRF primitive. Web restore is
    // intentionally unavailable in production, even with legacy env overrides.
    if (config.isProd) throw new HttpError(403, 'Web import is disabled in production. Use the offline CLI restore procedure (see docs/MIGRATION.md).');
    if (process.env.ALLOW_WEB_IMPORT !== 'true') throw new HttpError(403, 'Web import is disabled. Set ALLOW_WEB_IMPORT=true only in an isolated local environment.');
    const t = await (await import('../db.js')).connect(String(ctx.body.target_url || ''));
    try { return await importAll(t, ctx.body.backup, { force: !!ctx.body.force }); } finally { await t.close(); } });
}
