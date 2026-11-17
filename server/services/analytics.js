import { randomUUID } from 'node:crypto';
import { hmac } from '../lib/security.js';
const now = () => new Date().toISOString(); const today = () => now().slice(0, 10);
const refHost = (r, self) => { try { const h = new URL(r).hostname.replace(/^www\./, '').toLowerCase(); return h === self.replace(/^www\./, '').toLowerCase() ? null : h; } catch { return null; } };
const clean = (v, max = 120) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) || null : null;
const validPath = p => typeof p === 'string' && /^\/[\w\-./%?=&]{0,300}$/.test(p);
export function analyticsService(db, { siteHost }) {
  const KEY = { project_views: 'slug', traffic_sources: 'source', article_views: 'article_id' };
  const bump = (table, a, b) => db.query(`INSERT INTO ${table} (${KEY[table]}, day, count) VALUES ($1,$2,1) ON CONFLICT (${KEY[table]}, day) DO UPDATE SET count = ${table}.count + 1`, [a, b]);
  const attribution = a => ({
    utm_source: clean(a?.utm_source, 100), utm_medium: clean(a?.utm_medium, 100),
    utm_campaign: clean(a?.utm_campaign, 120), utm_content: clean(a?.utm_content, 120),
    utm_term: clean(a?.utm_term, 120)
  });
  const svc = {
    async track({ path, referrer, type, slug, attribution: rawAttribution }, { ip, ua, dnt }) {
      if (dnt || /bot|crawl|spider|headless|preview/i.test(ua || '') || !validPath(path)) return;
      const day = today(), vh = hmac(`${day}|${ip}|${ua}`, 'visitor:' + day).slice(0, 20);
      const host = refHost(referrer || '', siteHost), a = attribution(rawAttribution || {});
      const source = a.utm_source || host || 'direct';
      await db.query('INSERT INTO page_views (id,path,visitor_hash,referrer_host,day,is_test,created_at,utm_source,utm_medium,utm_campaign,utm_content,utm_term) VALUES ($1,$2,$3,$4,$5,FALSE,$6,$7,$8,$9,$10,$11)',
        [randomUUID(), path, vh, host, day, now(), a.utm_source, a.utm_medium, a.utm_campaign, a.utm_content, a.utm_term]);
      await bump('traffic_sources', source, day);
      if (type === 'project' && slug) await bump('project_views', String(slug).slice(0, 80), day);
    },
    async activity({ path, event, category, label, ref_id, attribution: rawAttribution }, { ip, ua, dnt }) {
      if (dnt || /bot|crawl|spider|headless|preview/i.test(ua || '') || !validPath(path)) return;
      const allowed = new Set(['contact_click', 'outbound_click', 'download_click', 'cta_click', 'copy_link', 'share_click']);
      if (!allowed.has(event)) return;
      const day = today(), vh = hmac(`${day}|${ip}|${ua}`, 'visitor:' + day).slice(0, 20), a = attribution(rawAttribution || {});
      await db.query('INSERT INTO analytics_events (id,type,path,ref_id,day,created_at,visitor_hash,category,label,utm_source,utm_medium,utm_campaign) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
        [randomUUID(), event, path, clean(ref_id, 160), day, now(), vh, clean(category, 60), clean(label, 100), a.utm_source, a.utm_medium, a.utm_campaign]);
    },
    async summary({ from, to }) {
      const f = from || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10), t = to || today(); const p = [f, t];
      const cnt = async (sql, pp = p) => Number((await db.query(sql, pp)).rows[0].c);
      const series = (await db.query('SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS visitors FROM page_views WHERE day >= $1 AND day <= $2 AND is_test = FALSE GROUP BY day ORDER BY day', p)).rows.map(r => ({ day: r.day, views: Number(r.views), visitors: Number(r.visitors) }));
      const leads = async s => cnt(`SELECT COUNT(*) AS c FROM leads WHERE ${s ? `status = '${s}' AND ` : ''}created_at >= $1 AND created_at < $2`, [f, new Date(new Date(t).getTime() + 864e5).toISOString().slice(0, 10)]);
      const visitors = await cnt('SELECT COUNT(DISTINCT visitor_hash) AS c FROM page_views WHERE day >= $1 AND day <= $2 AND is_test = FALSE');
      const subs = await cnt("SELECT COUNT(*) AS c FROM conversion_events WHERE type = 'contact_submission' AND day >= $1 AND day <= $2");
      return {
        range: { from: f, to: t }, visitors, page_views: series.reduce((a, s) => a + s.views, 0), series,
        top_pages: (await db.query('SELECT path, COUNT(*) AS views FROM page_views WHERE day >= $1 AND day <= $2 AND is_test = FALSE GROUP BY path ORDER BY views DESC LIMIT 10', p)).rows.map(r => ({ path: r.path, views: Number(r.views) })),
        top_articles: (await db.query('SELECT a.title, a.slug, SUM(v.count) AS views FROM article_views v JOIN articles a ON a.id = v.article_id WHERE v.day >= $1 AND v.day <= $2 GROUP BY a.id, a.title, a.slug ORDER BY views DESC LIMIT 10', p)).rows.map(r => ({ ...r, views: Number(r.views) })),
        top_projects: (await db.query('SELECT slug, SUM(count) AS views FROM project_views WHERE day >= $1 AND day <= $2 GROUP BY slug ORDER BY views DESC LIMIT 10', p)).rows.map(r => ({ ...r, views: Number(r.views) })),
        sources: (await db.query('SELECT source, SUM(count) AS views FROM traffic_sources WHERE day >= $1 AND day <= $2 GROUP BY source ORDER BY views DESC LIMIT 10', p)).rows.map(r => ({ ...r, views: Number(r.views) })),
        campaigns: (await db.query("SELECT utm_source AS source, utm_medium AS medium, utm_campaign AS campaign, COUNT(*) AS views FROM page_views WHERE day >= $1 AND day <= $2 AND utm_source IS NOT NULL GROUP BY utm_source, utm_medium, utm_campaign ORDER BY views DESC LIMIT 15", p)).rows.map(r => ({ ...r, views: Number(r.views) })),
        activities: (await db.query('SELECT type, category, label, path, ref_id, created_at FROM analytics_events WHERE day >= $1 AND day <= $2 ORDER BY created_at DESC LIMIT 30', p)).rows,
        contact_submissions: subs, leads: { new: await leads('new'), qualified: await leads('qualified'), converted: await leads('converted'), total: await leads() },
        conversion_rate: visitors ? Math.round((subs / visitors) * 1000) / 10 : 0,
        ads: { impressions: await cnt('SELECT COALESCE(SUM(count),0) AS c FROM ad_impressions WHERE day >= $1 AND day <= $2'), clicks: await cnt('SELECT COALESCE(SUM(count),0) AS c FROM ad_clicks WHERE day >= $1 AND day <= $2') },
      };
    },
    async purge(days) { const cut = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10); let n = 0; for (const t of ['page_views', 'analytics_events', 'conversion_events', 'project_views', 'article_views', 'traffic_sources', 'ad_impressions', 'ad_clicks']) n += (await db.query(`DELETE FROM ${t} WHERE day < $1`, [cut])).rowCount; await db.query('DELETE FROM application_logs WHERE created_at < $1', [new Date(Date.now() - 30 * 864e5).toISOString()]); return n; },
  };
  return svc;
}
