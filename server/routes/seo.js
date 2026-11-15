// Dynamic sitemap.xml / robots.txt / ads.txt (db handle injected from index.js)
import { config } from '../config.js';
let _db; export const setSeoDb = d => { _db = d; };
const xml = value => String(value).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
export async function dynamicText(p) {
  if (!_db) return null; const base = ((await _db.query("SELECT value FROM site_settings WHERE key = 'canonical_base'")).rows[0]?.value || config.siteUrl).replace(/\/$/, '');
  if (p === '/robots.txt') return `User-agent: *
Disallow: /admin
Disallow: /api/
Sitemap: ${base}/sitemap.xml
`;
  if (p === '/ads.txt') { const r = (await _db.query("SELECT value FROM ad_network_settings WHERE key = 'adsense_ads_txt' AND enabled = TRUE")).rows[0]; return r?.value ? r.value + '\n' : null; }
  const arts = (await _db.query("SELECT slug, published_at FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT 1000")).rows;
  const pages = ['/', '/about', '/projects', '/services', '/contact', '/articles', '/projects/restaurant/', '/projects/agency/', '/projects/blog/', '/projects/shop/', '/projects/event/', '/projects/calculator/'].map(x => `<url><loc>${xml(base + x)}</loc></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.join('')}${arts.map(a => `<url><loc>${xml(base + '/articles/' + a.slug)}</loc><lastmod>${String(a.published_at).slice(0, 10)}</lastmod></url>`).join('')}</urlset>`;
}
