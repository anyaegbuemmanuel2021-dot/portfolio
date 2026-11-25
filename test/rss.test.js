import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed, rssAggregator } from '../server/services/rss.js';

const source = { id: 'demo', name: 'Demo', siteUrl: 'https://publisher.example/' };

test('parses RSS titles, CDATA descriptions, dates, categories and image enclosures', () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Web &amp; AI</title><link>https://publisher.example/story</link><description><![CDATA[<p>Useful <strong>technology</strong> news.</p>]]></description><category><![CDATA[Technology]]></category><pubDate>Wed, 25 Nov 2026 10:15:00 +0000</pubDate><enclosure url="https://publisher.example/story.jpg" type="image/jpeg" /></item></channel></rss>`;
  const [item] = parseFeed(xml, source);
  assert.equal(item.title, 'Web & AI');
  assert.equal(item.description, 'Useful technology news.');
  assert.equal(item.category, 'Technology');
  assert.equal(item.link, 'https://publisher.example/story');
  assert.equal(item.image, 'https://publisher.example/story.jpg');
  assert.equal(item.published_at, '2026-11-25T10:15:00.000Z');
});

test('rejects non-HTTPS article destinations and malformed feed documents', () => {
  const xml = '<rss><channel><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>';
  assert.deepEqual(parseFeed(xml, source), []);
  assert.throws(() => parseFeed('<html>not a feed</html>', source), /valid RSS or Atom/);
});

test('supports Atom entries and caches successful feed responses', async () => {
  let calls = 0;
  const aggregator = rssAggregator({ fetchImpl: async () => {
    calls++;
    return { ok: true, text: async () => '<feed><entry><title>Atom story</title><link href="https://publisher.example/atom-story" /><summary>Summary</summary><updated>2026-11-25T10:00:00Z</updated></entry></feed>' };
  } });
  const first = await aggregator.list();
  const second = await aggregator.list();
  assert.equal(calls, 7, 'the first refresh requests each of the seven independent publications');
  assert.equal(first.items[0].title, 'Atom story');
  assert.equal(second.items.length, 7, 'the cached response contains one item from each configured source');
  assert.equal(calls, 8, 'the second read is served from cache without additional requests');
  assert.equal(first.sources[0].status, 'ok');
});


test('rejects XML DTD and entity declarations before parsing', () => {
  const xml = '<!DOCTYPE rss [<!ENTITY x "expanded">]><rss><channel><item><title>&x;</title><link>https://publisher.example/story</link></item></channel></rss>';
  assert.throws(() => parseFeed(xml, source), /DTD and entity declarations are not supported/);
});

test('rejects feeds exceeding the byte limit before parsing', () => {
  const oversized = '<rss><channel></channel></rss>' + ' '.repeat(1_000_001);
  assert.throws(() => parseFeed(oversized, source), /1 MB limit/);
});

test('does not buffer an oversized streamed feed response', async () => {
  let cancelled = false;
  const bytes = new TextEncoder().encode('<rss>' + 'x'.repeat(1_000_010) + '</rss>');
  const aggregator = rssAggregator({ fetchImpl: async () => ({
    ok: true,
    headers: { get: () => null },
    body: new ReadableStream({
      start(controller) { controller.enqueue(bytes); },
      cancel() { cancelled = true; }
    })
  }) });
  const result = await aggregator.list();
  assert.equal(result.sources[0].status, 'unavailable');
  assert.equal(result.sources[0].error, 'This source is temporarily unavailable.');
  assert.equal(cancelled, true);
});


test('prefers the Atom alternate article URL over the self URL and reads media thumbnails', () => {
  const xml = '<feed><entry><title>Atom article</title><link rel="self" href="https://publisher.example/feed.xml" /><link rel="alternate" type="text/html" href="https://publisher.example/story" /><media:thumbnail xmlns:media="http://search.yahoo.com/mrss/" url="https://publisher.example/thumb.jpg" /><summary>Readable summary</summary></entry></feed>';
  const [item] = parseFeed(xml, source);
  assert.equal(item.link, 'https://publisher.example/story');
  assert.equal(item.image, 'https://publisher.example/thumb.jpg');
});

test('keeps the last successful external feed snapshot when every source is temporarily unavailable', async () => {
  const originalNow = Date.now;
  let now = 1_800_000_000_000;
  let fail = false;
  Date.now = () => now;
  try {
    const aggregator = rssAggregator({ fetchImpl: async () => {
      if (fail) throw new Error('upstream unavailable');
      return { ok: true, text: async () => '<rss><channel><item><title>Previously available</title><link>https://publisher.example/story</link></item></channel></rss>' };
    } });
    const first = await aggregator.list();
    assert.equal(first.items.length, 7);
    now += 5 * 60 * 1000 + 1;
    fail = true;
    const stale = await aggregator.list();
    assert.equal(stale.items.length, 7);
    assert.equal(stale.stale, true);
    assert.match(stale.warning, /last available articles/i);
  } finally {
    Date.now = originalNow;
  }
});
