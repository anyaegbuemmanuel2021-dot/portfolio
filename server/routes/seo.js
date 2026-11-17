// Dynamic sitemap.xml / robots.txt / ads.txt (db handle injected from index.js)
import { config } from '../config.js';
let _db; export const setSeoDb = d => { _db = d; };
const xml = value => String(value).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
export async function dynamicText(p) {
  if (!_db) return null; const base = ((await _db.query("SELECT value FROM site_settings WHERE key = 'canonical_base'")).rows[0]?.value || config.siteUrl).replace(/\/$/, '');
  if (p === '/feed.xml') {
    const settings = Object.fromEntries((await _db.query("SELECT key, value FROM site_settings WHERE key IN ('site_title','site_tagline')")).rows.map(r => [r.key, r.value]));
    const arts = (await _db.query("SELECT title, slug, excerpt, content_html, featured_image_url, published_at FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT 100")).rows;
    const items = arts.map(a => {
      const url = base + '/articles/' + a.slug;
      const date = new Date(a.published_at).toUTCString();
      const image = a.featured_image_url ? `<media:content url="${xml(a.featured_image_url)}" medium="image" />` : '';
      return `<item><title>${xml(a.title)}</title><link>${xml(url)}</link><guid isPermaLink="true">${xml(url)}</guid><pubDate>${xml(date)}</pubDate><description>${xml(a.excerpt || a.title)}</description><content:encoded>${xml(a.content_html || a.excerpt || '')}</content:encoded>${image}</item>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>${xml(settings.site_title || 'Portfolio')}</title><link>${xml(base)}</link><description>${xml(settings.site_tagline || 'Latest articles')}</description><language>en-ng</language><atom:link href="${xml(base)}/feed.xml" rel="self" type="application/rss+xml" />${items}</channel></rss>`;
  }
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
