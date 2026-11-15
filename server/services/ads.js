import { safeUrl } from '../lib/validate.js';
const now = () => new Date().toISOString(); const today = () => now().slice(0, 10);
export function adService(db) {
  const bump = (t, id) => db.query(`INSERT INTO ${t} (ad_id, day, count) VALUES ($1,$2,1) ON CONFLICT (ad_id, day) DO UPDATE SET count = ${t}.count + 1`, [id, today()]);
  return {
    async network() { return (await db.query('SELECT key, value, enabled FROM ad_network_settings')).rows.reduce((o, r) => ({ ...o, [r.key]: { value: r.value, enabled: !!r.enabled } }), {}); },
    async serve(placement, { ua }) {
      const t = now(); const rows = (await db.query('SELECT a.id,a.title,a.image_url,a.alt,a.weight FROM advertisements a JOIN ad_placements p ON p.key = a.placement_key WHERE a.placement_key = $1 AND a.is_active = TRUE AND p.is_active = TRUE AND (a.start_at IS NULL OR a.start_at <= $2) AND (a.end_at IS NULL OR a.end_at >= $2)', [placement, t])).rows; if (!rows.length) return null;
      let r = Math.random() * rows.reduce((s, a) => s + Math.max(1, a.weight), 0), pick = rows[0]; for (const a of rows) { r -= Math.max(1, a.weight); if (r <= 0) { pick = a; break; } }
      if (!/bot|crawl|spider/i.test(ua || '')) await bump('ad_impressions', pick.id); return { id: pick.id, title: pick.title, image_url: pick.image_url, alt: pick.alt || pick.title, click_url: `/api/advertisements/${pick.id}/click` };
    },
    async click(id, { ua }) { const a = (await db.query('SELECT destination_url FROM advertisements WHERE id = $1 AND is_active = TRUE', [id])).rows[0]; if (!a || !/^https?:\/\//.test(a.destination_url) || !safeUrl(a.destination_url, { relative: false })) return null; if (!/bot|crawl|spider/i.test(ua || '')) await bump('ad_clicks', id); return a.destination_url; },
    async performance({ from, to }) { const f = from || '0000-00-00', t = to || '9999-99-99'; return (await db.query('SELECT a.id, a.title, a.placement_key, a.is_active, COALESCE((SELECT SUM(count) FROM ad_impressions i WHERE i.ad_id = a.id AND i.day >= $1 AND i.day <= $2),0) AS impressions, COALESCE((SELECT SUM(count) FROM ad_clicks c WHERE c.ad_id = a.id AND c.day >= $1 AND c.day <= $2),0) AS clicks FROM advertisements a ORDER BY a.created_at DESC', [f, t])).rows.map(r => ({ ...r, is_active: !!r.is_active, impressions: Number(r.impressions), clicks: Number(r.clicks), ctr: Number(r.impressions) ? Math.round(Number(r.clicks) / Number(r.impressions) * 1000) / 10 : 0 })); },
  };
}
