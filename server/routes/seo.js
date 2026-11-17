// Dynamic SEO metadata, entity landing pages, XML sitemap, robots.txt and RSS feed.
import { config } from '../config.js';
let _db;
export const setSeoDb = d => { _db = d; };

const esc = value => String(value ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
const cleanText = value => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const validUrl = value => {
  try { const u = new URL(String(value)); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; }
};
async function siteBase() {
  if (!_db) return config.siteUrl;
  const value = (await _db.query("SELECT value FROM site_settings WHERE key = 'canonical_base'")).rows[0]?.value;
  const u = validUrl(value || config.siteUrl);
  if (!u) return config.siteUrl;
  const parsed = new URL(u);
  return (parsed.origin + parsed.pathname).replace(/\/+$/, '');
}
const canonicalPath = pathname => {
  let p = String(pathname || '/').split('?')[0].split('#')[0];
  if (p === '/index.html') return '/';
  p = p.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p || '/';
};
const canonicalUrl = (base, path) => base.replace(/\/+$/, '') + canonicalPath(path);
const dateOnly = value => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const imageUrl = (value, base) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('/')) return base.replace(/\/+$/, '') + raw;
  return validUrl(raw);
};
const slugMatch = (path, type) => {
  const m = canonicalPath(path).match(new RegExp('^/' + type + '/([^/]+)$'));
  return m ? decodeURIComponent(m[1]) : null;
};
const metaTags = ({ canonical, title, description, image, type = 'website', jsonLd }) => {
  const tags = [
    '<link rel="canonical" href="' + esc(canonical) + '">',
    '<meta property="og:type" content="' + esc(type) + '">',
    '<meta property="og:url" content="' + esc(canonical) + '">',
    '<meta property="og:title" content="' + esc(title) + '">',
    '<meta property="og:description" content="' + esc(description) + '">',
    '<meta name="twitter:card" content="' + (image ? 'summary_large_image' : 'summary') + '">',
    '<meta name="twitter:title" content="' + esc(title) + '">',
    '<meta name="twitter:description" content="' + esc(description) + '">'
  ];
  if (image) {
    tags.push('<meta property="og:image" content="' + esc(image) + '">');
    tags.push('<meta name="twitter:image" content="' + esc(image) + '">');
  }
  if (jsonLd) tags.push('<script type="application/ld+json">' + JSON.stringify(jsonLd).replace(/</g, '\\u003c') + '</script>');
  return tags.join('\n  ');
};
async function entityFor(path) {
  const articleSlug = slugMatch(path, 'articles');
  if (articleSlug) {
    const row = (await _db.query("SELECT a.title, a.slug, a.excerpt, a.content_html, a.seo_title, a.seo_description, a.canonical_url, a.featured_image_url, a.published_at, a.updated_at, c.name AS category_name FROM articles a LEFT JOIN article_categories c ON c.id = a.category_id WHERE a.status = 'published' AND lower(a.slug) = lower($1) LIMIT 1", [articleSlug])).rows[0];
    if (row) return { kind: 'article', row };
  }
  const projectSlug = slugMatch(path, 'projects');
  if (projectSlug) {
    const row = (await _db.query('SELECT * FROM projects WHERE is_published = TRUE AND lower(slug) = lower($1) LIMIT 1', [projectSlug])).rows[0];
    if (row) return { kind: 'project', row };
  }
  const serviceSlug = slugMatch(path, 'services');
  if (serviceSlug) {
    const row = (await _db.query('SELECT * FROM services WHERE is_published = TRUE AND lower(slug) = lower($1) LIMIT 1', [serviceSlug])).rows[0];
    if (row) return { kind: 'service', row };
  }
  return null;
}
const safeLink = value => {
  const raw = String(value || '').trim();
  if (raw.startsWith('/')) return raw;
  const u = validUrl(raw);
  return u || null;
};
function pageHtml(kind, row, base) {
  const title = cleanText(row.seo_title || row.title);
  const description = cleanText(row.seo_description || row.summary || row.excerpt || row.description || row.title).slice(0, 300);
  const path = '/' + (kind === 'project' ? 'projects' : 'services') + '/' + encodeURIComponent(row.slug);
  const canonical = canonicalUrl(base, path);
  const image = imageUrl(kind === 'project' ? row.cover_url : row.image_url, base);
  const paragraphs = String(row.description || row.summary || '').split(/\r?\n{2,}/).map(s => s.trim()).filter(Boolean).map(s => '<p>' + esc(s).replace(/\r?\n/g, '<br>') + '</p>').join('\n');
  const links = [];
  if (kind === 'project' && safeLink(row.url)) links.push('<a class="button" href="' + esc(safeLink(row.url)) + '" rel="nofollow noopener" target="_blank">View project</a>');
  if (kind === 'project' && safeLink(row.repo_url)) links.push('<a class="button secondary" href="' + esc(safeLink(row.repo_url)) + '" rel="nofollow noopener" target="_blank">Source code</a>');
  const schema = kind === 'project'
    ? { '@context': 'https://schema.org', '@type': 'CreativeWork', name: title, description, url: canonical, image: image || undefined, creator: { '@type': 'Person', name: 'Anyaegbu Emmanuel Ikenna' } }
    : { '@context': 'https://schema.org', '@type': 'Service', name: title, description, url: canonical, provider: { '@type': 'Person', name: 'Anyaegbu Emmanuel Ikenna' }, areaServed: { '@type': 'Country', name: 'Nigeria' } };
  const head = metaTags({ canonical, title: title + ' — Anyaegbu Emmanuel', description, image, type: kind === 'project' ? 'article' : 'website', jsonLd: schema });
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title + ' — Anyaegbu Emmanuel') + '</title><meta name="description" content="' + esc(description) + '">\n' + head + '\n<link rel="stylesheet" href="/assets/css/global.css"><link rel="stylesheet" href="/assets/css/platform.css"><style>body{min-height:100vh}.seo-detail{width:min(900px,calc(100% - 36px));margin:8rem auto 4rem}.seo-detail img{width:100%;max-height:520px;object-fit:cover;border-radius:18px}.seo-detail h1{font-size:clamp(2.2rem,6vw,4.5rem);line-height:1.08}.seo-detail p{font-size:1.08rem;line-height:1.8}.seo-actions{display:flex;gap:12px;flex-wrap:wrap;margin:2rem 0}.button{display:inline-block;padding:12px 18px;border-radius:8px;background:#c8a96e;color:#111;text-decoration:none}.button.secondary{background:transparent;border:1px solid currentColor;color:inherit}.back{display:inline-block;margin-bottom:2rem}</style></head><body><main class="seo-detail"><a class="back" href="/' + (kind === 'project' ? 'projects' : 'services') + '">← Back to ' + (kind === 'project' ? 'projects' : 'services') + '</a><article><h1>' + esc(title) + '</h1>' + (image ? '<img src="' + esc(image) + '" alt="' + esc(row.title || title) + '" loading="eager">' : '') + (row.category ? '<p><strong>' + esc(row.category) + '</strong></p>' : '') + (row.price_note ? '<p><strong>' + esc(row.price_note) + '</strong></p>' : '') + '<p>' + esc(row.summary || '').replace(/\r?\n/g, '<br>') + '</p>' + paragraphs + '<div class="seo-actions">' + links.join('') + '<a class="button secondary" href="/contact">Discuss a project</a></div></article></main><script src="/assets/js/config.js"></script><script src="/assets/js/main.js"></script><script src="/assets/js/site.js"></script></body></html>';
}
export async function dynamicHtml(pathname) {
  if (!_db) return null;
  const found = await entityFor(pathname);
  if (!found || found.kind === 'article') return null;
  const base = await siteBase();
  return pageHtml(found.kind, found.row, base);
}
export async function decorateHtml(html, pathname) {
  if (!_db || !/<head[\s>]/i.test(html)) return html;
  const base = await siteBase();
  const path = canonicalPath(pathname);
  const found = await entityFor(pathname);
  let title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [null, 'Anyaegbu Emmanuel']).at(1).replace(/<[^>]*>/g, '').trim();
  let description = ((html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i) || [null, '']).at(1));
  let image = null, canonical = canonicalUrl(base, path), type = 'website', jsonLd = null;
  if (found?.kind === 'article') {
    const a = found.row;
    title = cleanText(a.seo_title || a.title) + ' — Anyaegbu Emmanuel';
    description = cleanText(a.seo_description || a.excerpt || a.title).slice(0, 300);
    canonical = validUrl(a.canonical_url) || canonical;
    image = imageUrl(a.featured_image_url, base);
    type = 'article';
    jsonLd = { '@context': 'https://schema.org', '@type': 'Article', headline: cleanText(a.title), description, articleBody: cleanText(a.content_html).slice(0, 5000) || undefined, mainEntityOfPage: canonical, datePublished: a.published_at || undefined, dateModified: a.updated_at || a.published_at || undefined, image: image ? [image] : undefined, author: { '@type': 'Person', name: 'Anyaegbu Emmanuel Ikenna' }, publisher: { '@type': 'Person', name: 'Anyaegbu Emmanuel Ikenna' } };
    const hero = image ? '<img class="article__hero" src="' + esc(image) + '" alt="' + esc(a.title) + '" loading="eager">' : '';
    const articleBody = '<h1 class="article__title">' + esc(a.title) + '</h1><div class="article__meta">' + esc([dateOnly(a.published_at), a.category_name].filter(Boolean).join(' · ')) + '</div>' + hero + (a.excerpt ? '<p class="article__excerpt">' + esc(a.excerpt) + '</p>' : '') + '<div class="article__body">' + (a.content_html || '') + '</div>';
    out = out.replace(/(<article\s+id=["']articleView["'][^>]*>)[\s\S]*?(<\/article>)/i, '$1' + articleBody + '$2');
  } else if (found?.kind === 'project' || found?.kind === 'service') {
    const r = found.row; title = cleanText(r.seo_title || r.title) + ' — Anyaegbu Emmanuel';
    description = cleanText(r.seo_description || r.summary || r.description || r.title).slice(0, 300);
    image = imageUrl(r.cover_url || r.image_url, base);
  }
  const tags = metaTags({ canonical, title, description, image, type, jsonLd });
  let out = html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, '<title>' + esc(title) + '</title>');
  if (/<meta\s+name=["']description["']/i.test(out)) out = out.replace(/<meta\s+name=["']description["'][^>]*>/i, '<meta name="description" content="' + esc(description) + '">');
  else out = out.replace(/<\/head>/i, '<meta name="description" content="' + esc(description) + '">\n</head>');
  out = out.replace(/<link\s+rel=["']canonical["'][^>]*>\s*/ig, '').replace(/<meta\s+property=["']og:[^"']+["'][^>]*>\s*/ig, '').replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/ig, '').replace(/<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/ig, '');
  return out.replace(/<\/head>/i, tags + '\n</head>');
}
export async function dynamicText(path) {
  if (!_db) return null;
  const base = await siteBase();
  if (path === '/robots.txt') return 'User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ' + base + '/sitemap.xml\n';
  if (path === '/ads.txt') {
    const r = (await _db.query("SELECT value FROM ad_network_settings WHERE key = 'adsense_ads_txt' AND enabled = TRUE")).rows[0];
    return r?.value ? r.value + '\n' : null;
  }
  if (path === '/feed.xml') {
    const settings = Object.fromEntries((await _db.query("SELECT key, value FROM site_settings WHERE key IN ('site_title','site_tagline')")).rows.map(r => [r.key, r.value]));
    const arts = (await _db.query("SELECT title, slug, excerpt, content_html, published_at FROM articles WHERE status = 'published' ORDER BY published_at DESC LIMIT 100")).rows;
    const items = arts.map(a => {
      const url = canonicalUrl(base, '/articles/' + encodeURIComponent(a.slug));
      const date = a.published_at ? new Date(a.published_at).toUTCString() : new Date().toUTCString();
      return '<item><title>' + esc(a.title) + '</title><link>' + esc(url) + '</link><guid isPermaLink="true">' + esc(url) + '</guid><pubDate>' + esc(date) + '</pubDate><description>' + esc(a.excerpt || a.title) + '</description><content:encoded>' + esc(a.content_html || a.excerpt || '') + '</content:encoded></item>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>' + esc(settings.site_title || 'Portfolio') + '</title><link>' + esc(base) + '</link><description>' + esc(settings.site_tagline || 'Latest published articles') + '</description><lastBuildDate>' + esc(new Date().toUTCString()) + '</lastBuildDate>' + items + '</channel></rss>';
  }
  if (path !== '/sitemap.xml') return null;
  const [arts, projects, services, articleImages] = await Promise.all([
    _db.query("SELECT title, slug, excerpt, canonical_url, featured_image_url, published_at, updated_at FROM articles WHERE status = 'published' ORDER BY published_at DESC"),
    _db.query('SELECT title, slug, summary, cover_url, updated_at FROM projects WHERE is_published = TRUE ORDER BY sort_order ASC, updated_at DESC'),
    _db.query('SELECT title, slug, summary, updated_at FROM services WHERE is_published = TRUE ORDER BY sort_order ASC, updated_at DESC'),
    _db.query("SELECT ai.article_id, ai.url, ai.alt FROM article_images ai JOIN articles a ON a.id = ai.article_id WHERE a.status = 'published' ORDER BY ai.sort_order ASC")
  ]);
  const entries = new Map();
  const add = (pathName, lastmod, images = [], canonicalOverride = null) => {
    const loc = validUrl(canonicalOverride) || canonicalUrl(base, pathName);
    const cleanImages = [...new Map(images.filter(i => i && i.loc).map(i => [i.loc, i])).values()];
    entries.set(loc, { loc, lastmod: dateOnly(lastmod), images: cleanImages });
  };
  ['/','/about','/projects','/services','/contact','/articles','/resume','/projects/restaurant/','/projects/agency/','/projects/blog/','/projects/shop/','/projects/event/','/projects/calculator/'].forEach(p => add(p));
  const byArticle = new Map();
  for (const i of articleImages.rows) {
    if (!byArticle.has(i.article_id)) byArticle.set(i.article_id, []);
    const loc = imageUrl(i.url, base);
    if (loc) byArticle.get(i.article_id).push({ loc, title: i.alt || '' });
  }
  for (const a of arts.rows) {
    const images = byArticle.get(a.id) || [];
    const featured = imageUrl(a.featured_image_url, base);
    if (featured) images.unshift({ loc: featured, title: a.title });
    add('/articles/' + encodeURIComponent(a.slug), a.updated_at || a.published_at, images, a.canonical_url);
  }
  for (const p of projects.rows) {
    const img = imageUrl(p.cover_url, base);
    add('/projects/' + encodeURIComponent(p.slug), p.updated_at, img ? [{ loc: img, title: p.title }] : []);
  }
  for (const s of services.rows) add('/services/' + encodeURIComponent(s.slug), s.updated_at);
  const urls = [...entries.values()].map(e => '<url><loc>' + esc(e.loc) + '</loc>' + (e.lastmod ? '<lastmod>' + e.lastmod + '</lastmod>' : '') + e.images.map(i => '<image:image><image:loc>' + esc(i.loc) + '</image:loc>' + (i.title ? '<image:title>' + esc(i.title) + '</image:title>' : '') + '</image:image>').join('') + '</url>').join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' + urls + '</urlset>';
}
