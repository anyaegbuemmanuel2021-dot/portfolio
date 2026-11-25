const FEEDS = [
  { id: 'withubb', name: 'Withubb', category: 'Web development', url: 'https://www.withubb.com/feed.xml', siteUrl: 'https://www.withubb.com/', description: 'Web development, IT, programming and business articles from Withubb.' },
  { id: 'openai', name: 'OpenAI', category: 'AI', url: 'https://openai.com/news/rss.xml', siteUrl: 'https://openai.com/', description: 'Official OpenAI product, research and company updates.' },
  { id: 'google-ai', name: 'Google AI', category: 'AI research', url: 'https://blog.google/technology/ai/rss/', siteUrl: 'https://blog.google/technology/ai/', description: 'Google AI product and research updates.' },
  { id: 'deepmind', name: 'Google DeepMind', category: 'AI research', url: 'https://deepmind.google/blog/rss.xml', siteUrl: 'https://deepmind.google/', description: 'Research and announcements from Google DeepMind.' },
  { id: 'hugging-face', name: 'Hugging Face', category: 'Open-source AI', url: 'https://huggingface.co/blog/feed.xml', siteUrl: 'https://huggingface.co/blog', description: 'Open-source AI models, datasets and developer tooling.' },
  { id: 'techcrunch-ai', name: 'TechCrunch AI', category: 'Technology news', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', siteUrl: 'https://techcrunch.com/', description: 'Independent reporting on AI companies, products and the technology industry.' },
  { id: 'freecodecamp', name: 'freeCodeCamp', category: 'Programming tutorials', url: 'https://www.freecodecamp.org/news/rss/', siteUrl: 'https://www.freecodecamp.org/news/', description: 'Programming, web development and software engineering tutorials.' },
  { id: 'github-blog', name: 'GitHub Blog', category: 'Developer ecosystem', url: 'https://github.blog/feed/', siteUrl: 'https://github.blog/', description: 'Developer tools, software engineering and open-source ecosystem updates.' }
];

const MAX_FEED_BYTES = 1_000_000;
const CACHE_MS = 5 * 60 * 1000;

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, '$1')
    .replace(/&#(x[0-9a-f]+|\\d+);/gi, (_, code) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      if (!Number.isInteger(n) || n < 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '';
      try { return String.fromCodePoint(n); } catch { return ''; }
    })
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function tag(xml, name) {
  const match = xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '\\s*>', 'i'));
  return match ? decodeXml(match[1]).trim() : '';
}

function cleanText(value, max = 500) {
  return String(value || '').replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style\\b[^>]*>[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/[\\u0000-\\u001f\\u007f]/g, ' ')
    .replace(/\\s+/g, ' ').trim().slice(0, max);
}

function safeHttpsUrl(value, base) {
  try {
    const parsed = new URL(value, base);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch { return ''; }
}

export function parseFeed(xml, source = {}) {
  if (typeof xml !== 'string') throw new Error('The source did not return a valid RSS or Atom feed.');
  if (Buffer.byteLength(xml, 'utf8') > MAX_FEED_BYTES) throw new Error('Feed is larger than the 1 MB limit.');
  if (/<!\\s*(?:DOCTYPE|ENTITY)\\b/i.test(xml)) throw new Error('DTD and entity declarations are not supported.');
  if (!/<(?:rss|feed)\\b/i.test(xml)) throw new Error('The source did not return a valid RSS or Atom feed.');

  const channel = (xml.match(/<channel\\b[^>]*>([\\s\\S]*?)<\\/channel>/i) || [null, xml])[1];
  const blocks = [...channel.matchAll(/<item\\b[^>]*>([\\s\\S]*?)<\\/item>/gi)].map(m => m[1]);
  const entries = blocks.length ? blocks : [...xml.matchAll(/<entry\\b[^>]*>([\\s\\S]*?)<\\/entry>/gi)].map(m => m[1]);

  return entries.map((item, index) => {
    const title = cleanText(tag(item, 'title'), 180);
    const atomHref = (item.match(/<link\\b[^>]*href=["']([^"']+)["']/i) || [])[1] || '';
    const link = safeHttpsUrl(tag(item, 'link') || decodeXml(atomHref), source.siteUrl);
    const description = cleanText(tag(item, 'description') || tag(item, 'summary') || tag(item, 'content'), 420);
    const rawDate = tag(item, 'pubDate') || tag(item, 'published') || tag(item, 'updated');
    const timestamp = rawDate ? Date.parse(rawDate) : NaN;
    const category = cleanText(tag(item, 'category'), 60) || cleanText(source.category, 60);
    const enclosure = (item.match(/<enclosure\\b[^>]*url=["']([^"']+)["']/i) || [])[1] || '';
    const image = safeHttpsUrl(decodeXml(enclosure), source.siteUrl);
    const identity = link || title;
    return {
      id: String(source.id || 'feed') + '-' + index + '-' + Buffer.from(identity).toString('base64url').slice(0, 18),
      title, link, description,
      published_at: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
      category, image, source: cleanText(source.name, 80), source_url: safeHttpsUrl(source.siteUrl)
    };
  }).filter(item => item.title && item.link).slice(0, 30);
}

async function readLimitedBody(response) {
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
    throw new Error('Feed is larger than the 1 MB limit.');
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_FEED_BYTES) throw new Error('Feed is larger than the 1 MB limit.');
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_FEED_BYTES) {
        await reader.cancel().catch(() => {});
        throw new Error('Feed is larger than the 1 MB limit.');
      }
      output += decoder.decode(value, { stream: true });
    }
    return output + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function rssAggregator({ fetchImpl = fetch } = {}) {
  let cache = { expires: 0, data: null };
  return {
    async list() {
      if (cache.data && cache.expires > Date.now()) return cache.data;
      const results = await Promise.all(FEEDS.map(async source => {
        try {
          const response = await fetchImpl(source.url, {
            headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
            signal: AbortSignal.timeout(8000),
            redirect: 'error'
          });
          if (!response.ok) throw new Error('Feed returned HTTP ' + response.status);
          const xml = await readLimitedBody(response);
          return { id: source.id, name: source.name, url: source.url, status: 'ok', items: parseFeed(xml, source) };
        } catch {
          return { id: source.id, name: source.name, url: source.url, status: 'unavailable', error: 'This source is temporarily unavailable.', items: [] };
        }
      }));
      const data = {
        sources: results.map(({ items, ...source }) => source),
        items: results.flatMap(source => source.items)
          .sort((a, b) => Date.parse(b.published_at || 0) - Date.parse(a.published_at || 0)).slice(0, 30),
        updated_at: new Date().toISOString()
      };
      cache = { data, expires: Date.now() + CACHE_MS };
      return data;
    }
  };
}
