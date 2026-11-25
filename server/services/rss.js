const FEEDS = [
  {
    id: 'withubb',
    name: 'Withubb',
    url: 'https://www.withubb.com/feed.xml',
    siteUrl: 'https://www.withubb.com/',
    description: 'Web development, IT, programming and business articles from Withubb.'
  }
];

const decodeXml = value => String(value || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
    const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  })
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'");

function tag(xml, name) {
  const match = xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '\\s*>', 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function cleanText(value, max = 500) {
  return decodeXml(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseFeed(xml, source) {
  if (typeof xml !== 'string' || !/<(?:rss|feed)\b/i.test(xml)) throw new Error('The source did not return a valid RSS or Atom feed.');
  const channel = (xml.match(/<channel\b[^>]*>([\s\S]*?)<\/channel>/i) || [null, xml])[1];
  const blocks = [...channel.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
  const atomBlocks = blocks.length ? blocks : [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(m => m[1]);
  return atomBlocks.map((item, index) => {
    const title = cleanText(tag(item, 'title'), 180);
    const rawLink = tag(item, 'link') || ((item.match(/<link\b[^>]*href=["']([^"']+)["']/i) || [])[1] || '');
    let link = rawLink;
    try { const parsed = new URL(link, source.siteUrl); link = parsed.protocol === 'https:' ? parsed.href : ''; } catch { link = ''; }
    const description = cleanText(tag(item, 'description') || tag(item, 'summary') || tag(item, 'content'), 420);
    const rawDate = tag(item, 'pubDate') || tag(item, 'published') || tag(item, 'updated');
    const timestamp = rawDate ? Date.parse(rawDate) : NaN;
    const category = cleanText(tag(item, 'category'), 60);
    const enclosure = (item.match(/<enclosure\b[^>]*url=["']([^"']+)["']/i) || [])[1] || '';
    let image = '';
    try { const u = new URL(enclosure, source.siteUrl); if (u.protocol === 'https:') image = u.href; } catch {}
    return { id: source.id + '-' + index + '-' + Buffer.from(link || title).toString('base64url').slice(0, 18), title, link, description, published_at: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null, category, image, source: source.name, source_url: source.siteUrl };
  }).filter(item => item.title && item.link).slice(0, 30);
}

export function rssAggregator({ fetchImpl = fetch } = {}) {
  let cache = { expires: 0, data: null };
  return {
    async list() {
      if (cache.data && cache.expires > Date.now()) return cache.data;
      const results = await Promise.all(FEEDS.map(async source => {
        try {
          const response = await fetchImpl(source.url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(8000), redirect: 'error' });
          if (!response.ok) throw new Error('Feed returned HTTP ' + response.status);
          const xml = await response.text();
          if (xml.length > 1_000_000) throw new Error('Feed is larger than the 1 MB limit.');
          return { id: source.id, name: source.name, url: source.url, status: 'ok', items: parseFeed(xml, source) };
        } catch (error) {
          return { id: source.id, name: source.name, url: source.url, status: 'unavailable', error: 'This source is temporarily unavailable.', items: [] };
        }
      }));
      const data = { sources: results.map(({ items, ...source }) => source), items: results.flatMap(source => source.items).sort((a, b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0)).slice(0, 30), updated_at: new Date().toISOString() };
      cache = { data, expires: Date.now() + 5 * 60 * 1000 };
      return data;
    }
  };
}
