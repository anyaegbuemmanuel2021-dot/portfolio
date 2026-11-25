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
  assert.equal(calls, 1);
  assert.equal(first.items[0].title, 'Atom story');
  assert.equal(second.items.length, 1);
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
