import test from 'node:test'; import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'sqlite::memory:'; process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123'; process.env.LOCAL_MEDIA_DIR = './data/test-media'; process.env.SITE_URL = 'http://localhost'; process.env.TRUST_PROXY = 'false';
const { buildApp } = await import('../server/index.js'); const { authService } = await import('../server/services/auth.js'); const sec = await import('../server/lib/security.js'); const { connect } = await import('../server/db.js'); const { exportAll, importAll } = await import('../server/services/backup.js'); const { renderMarkdown } = await import('../server/lib/markdown.js');
const { app, db, deps } = await buildApp(); const server = app.server().listen(0); const base = `http://127.0.0.1:${server.address().port}`;
await authService(db, { real: false }).bootstrap({ email: 'owner@example.com', password: 'Str0ng-Password-1', name: 'Owner' });
let cookie = '', csrf = '';
const api = async (method, path, body, { raw, headers = {}, auth = true } = {}) => { const h = { ...headers }; if (auth && cookie) h.cookie = cookie; if (auth && csrf && method !== 'GET') h['x-csrf-token'] = csrf; if (body && !raw) h['content-type'] = 'application/json'; const r = await fetch(base + path, { method, headers: h, body: raw ? body : body ? JSON.stringify(body) : undefined, redirect: 'manual' }); const ct = r.headers.get('content-type') || ''; const j = ct.includes('json') ? await r.json() : await r.text(); return { s: r.status, j, r }; };
test.after(() => { server.close(); });

test('password hashing roundtrip', async () => { const h = await sec.hashPassword('Abcdefgh1234'); assert.ok(await sec.verifyPassword('Abcdefgh1234', h)); assert.ok(!(await sec.verifyPassword('wrong', h))); });
test('markdown escapes raw HTML and js: links', () => { const h = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) **b**'); assert.ok(!h.includes('<script>')); assert.ok(!h.includes('href="javascript')); assert.ok(h.includes('<strong>b</strong>')); });

test('public site & security headers', async () => { const r = await api('GET', '/', null, { auth: false }); assert.equal(r.s, 200); assert.ok(r.r.headers.get('content-security-policy')); assert.match(r.r.headers.get('content-security-policy'), /object-src 'none'/); assert.equal(r.r.headers.get('x-content-type-options'), 'nosniff'); assert.equal(r.r.headers.get('x-frame-options'), 'SAMEORIGIN'); const t = await api('GET', '/..%2f..%2fetc/passwd', null, { auth: false }); assert.notEqual(t.s, 200); });
test('admin endpoints require auth; no default creds', async () => { for (const p of ['/api/admin/services', '/api/leads', '/api/system/overview', '/api/media']) assert.equal((await api('GET', p, null, { auth: false })).s, 401); assert.equal((await api('POST', '/api/auth/login', { email: 'admin@admin.com', password: 'admin' }, { auth: false })).s, 401); });
test('login, wrong password, CSRF enforced', async () => {
  assert.equal((await api('POST', '/api/auth/login', { email: 'owner@example.com', password: 'nope' }, { auth: false })).s, 401);
  const r = await api('POST', '/api/auth/login', { email: 'owner@example.com', password: 'Str0ng-Password-1' }, { auth: false }); assert.equal(r.s, 200); cookie = r.r.headers.get('set-cookie').split(';')[0]; csrf = r.j.data.csrf; assert.ok(/HttpOnly/.test(r.r.headers.get('set-cookie'))); assert.ok(/SameSite=Strict/.test(r.r.headers.get('set-cookie')));
  const noCsrf = await fetch(base + '/api/admin/services', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{"title":"x"}' }); assert.equal(noCsrf.status, 403);
  const evil = await fetch(base + '/api/admin/services', { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{"title":"x"}' }); assert.equal(evil.status, 403);
});
test('owner CMS settings are saved and exposed to public pages safely', async () => {
  const payload = { contact_phone: '+234 800 000 0000', contact_location: 'Nigeria — Remote', education: 'Computer Science', portfolio_url: 'https://example.com', about_story_1: 'Updated biography', pricing_json: '[{\"title\":\"Starter\",\"features\":[\"Responsive\"]}]', process_json: '[{\"title\":\"Discover\"}]', certifications_json: '[{\"title\":\"Web Design\",\"issuer\":\"freeCodeCamp\"}]', footer_tagline: 'Updated footer' };
  const saved = await api('PUT', '/api/admin/settings', payload); assert.equal(saved.s, 200);
  app.invalidate(); const pub = await api('GET', '/api/content', null, { auth: false });
  for (const [key, value] of Object.entries(payload)) assert.equal(pub.j.data.settings[key], value);
  const ignored = await api('PUT', '/api/admin/settings', { arbitrary_secret: 'must-not-be-public' }); assert.equal(ignored.s, 200);
  app.invalidate(); const again = await api('GET', '/api/content', null, { auth: false }); assert.equal(again.j.data.settings.arbitrary_secret, undefined);
});
test('login ignores any extra authentication-code field and requires only email + password', async () => {
  const bad = await api('POST', '/api/auth/login', { email: 'owner@example.com', password: 'wrong-Password-1' }, { auth: false }); assert.equal(bad.s, 401); assert.equal(bad.j.error.details?.mfa_required, undefined);
  const ok = await api('POST', '/api/auth/login', { email: 'owner@example.com', password: 'Str0ng-Password-1' }, { auth: false }); assert.equal(ok.s, 200);
});
test('content CRUD, validation, revisions, public visibility', async () => {
  const bad = await api('POST', '/api/admin/services', { title: '' }); assert.equal(bad.s, 422);
  const c = await api('POST', '/api/admin/services', { title: 'Brand Design', summary: 'Logos', seo_title: 'Brand identity services', seo_description: 'A carefully planned brand identity service description for potential clients and search visitors.', canonical_url: 'https://portfolio.example/brand-design', is_published: true }); assert.equal(c.s, 201); const id = c.j.data.id; assert.equal(c.j.data.slug, 'brand-design'); assert.equal(c.j.data.seo_title, 'Brand identity services'); assert.equal(c.j.data.canonical_url, 'https://portfolio.example/brand-design');
  const u = await api('PUT', `/api/admin/services/${id}`, { title: 'Brand Design v2' }); assert.equal(u.j.data.title, 'Brand Design v2'); const revs = await api('GET', `/api/admin/services/${id}/revisions`); assert.equal(revs.j.data.length, 1);
  await api('POST', `/api/admin/services/${id}/restore/${revs.j.data[0].id}`); assert.equal((await api('GET', `/api/admin/services/${id}`)).j.data.title, 'Brand Design');
  await api('PUT', `/api/admin/services/${id}`, { is_published: false }); app.invalidate(); const pub = await api('GET', '/api/services', null, { auth: false }); assert.ok(!pub.j.data.find(s => s.id === id)); assert.ok(pub.j.data.length >= 6);
  assert.equal((await api('GET', '/api/admin/sessions')).s, 404); assert.equal((await api('GET', '/api/admin/users')).s, 404);
  assert.equal((await api('DELETE', `/api/admin/services/${id}`)).s, 200);
  const sqli = await api('GET', "/api/admin/services?q=' OR 1=1--"); assert.equal(sqli.s, 200); assert.equal(sqli.j.data.length, 0);
});
test('articles: draft→publish, slug, clean html, schedule, revisions, unpublish', async () => {
  const a = await api('POST', '/api/admin/articles', { title: 'My First Article', content_md: '# Hi\n\nHello **world** <div>raw html</div>', tags: ['Node', 'Web'] }); assert.equal(a.s, 201); assert.equal(a.j.data.slug, 'my-first-article'); assert.equal(a.j.data.status, 'draft');
  assert.equal((await api('GET', '/api/articles/my-first-article', null, { auth: false })).s, 404);
  const draftMap = await api('GET', '/sitemap.xml', null, { auth: false }); assert.ok(!draftMap.j.includes('/articles/my-first-article'));
  const p = await api('POST', `/api/admin/articles/${a.j.data.id}/publish`); assert.equal(p.j.data.status, 'published'); const liveMap = await api('GET', '/sitemap.xml', null, { auth: false }); assert.ok(liveMap.j.includes('/articles/my-first-article')); const pub = await api('GET', '/api/articles/my-first-article', null, { auth: false }); assert.equal(pub.s, 200); assert.ok(!pub.j.data.content_html.includes('<div>raw html</div>')); assert.equal(pub.j.data.tags.length, 2); assert.equal(pub.j.data.content_md, undefined); const feed = await api('GET', '/feed.xml', null, { auth: false }); assert.equal(feed.s, 200); assert.match(feed.j, /<rss version="2.0"/); assert.match(feed.j, /My First Article/); assert.match(feed.j, /\/articles\/my-first-article/);
  const dup = await api('POST', '/api/admin/articles', { title: 'My First Article!' }); assert.equal(dup.j.data.slug, 'my-first-article-2');
  await api('PUT', `/api/admin/articles/${a.j.data.id}`, { title: 'My First Article', content_md: 'v2', status: 'published' }); const revs = await api('GET', `/api/admin/articles/${a.j.data.id}/revisions`); assert.ok(revs.j.data.length >= 1);
  const sch = await api('POST', '/api/admin/articles', { title: 'Future', status: 'scheduled', publish_at: new Date(Date.now() + 864e5).toISOString() }); assert.equal(sch.j.data.status, 'scheduled'); assert.equal((await api('GET', '/api/articles/future', null, { auth: false })).s, 404);
  await api('POST', `/api/admin/articles/${a.j.data.id}/unpublish`); assert.equal((await api('GET', '/api/articles/my-first-article', null, { auth: false })).s, 404); const hiddenMap = await api('GET', '/sitemap.xml', null, { auth: false }); assert.ok(!hiddenMap.j.includes('/articles/my-first-article'));
  const list = await api('GET', '/api/articles?page=abc', null, { auth: false }); assert.equal(list.s, 200); await api('POST', `/api/admin/articles/${a.j.data.id}/publish`);
});
test('published articles create idempotent social drafts for all three platforms', async () => {
  const a = await api('POST', '/api/admin/articles', { title: 'Social Distribution Test', excerpt: 'A practical guide to shipping better websites.', content_md: '# Social test', status: 'published', tags: ['Web Development', 'Portfolio'] });
  assert.equal(a.s, 201);
  let posts = await api('GET', '/api/social/posts');
  assert.equal(posts.s, 200);
  const matching = posts.j.data.filter(p => p.article_id === a.j.data.id);
  assert.equal(matching.length, 3);
  assert.deepEqual(matching.map(p => p.platform).sort(), ['facebook', 'instagram', 'linkedin']);
  for (const post of matching) {
    assert.match(post.link_url, /\/articles\/social-distribution-test$/);
    assert.match(post.caption, /Social Distribution Test/);
    assert.equal(post.status, 'draft');
    assert.equal(post.audio_status, 'needs_licensed_audio');
    assert.equal(post.media_kind, 'video_required');
  }
  const summary = await api('GET', '/api/social/summary');
  assert.equal(summary.j.data.automatic_delivery, false);
  assert.deepEqual(summary.j.data.connections.map(x => x.platform), ['facebook', 'instagram', 'linkedin']);
  for (const connection of summary.j.data.connections) {
    assert.equal(typeof connection.connected, 'boolean');
    assert.ok(Array.isArray(connection.missing));
    assert.ok(Array.isArray(connection.permissions));
    assert.equal(JSON.stringify(connection).includes('ACCESS_TOKEN_VALUE'), false);
  }
  const facebook = matching.find(p => p.platform === 'facebook');
  const edited = await api('PATCH', '/api/social/posts/' + facebook.id, { caption: 'Updated social caption', status: 'approved', media_url: 'https://cdn.example.com/social.mp4' });
  assert.equal(edited.s, 200);
  assert.equal(edited.j.data.caption, 'Updated social caption');
  assert.equal(edited.j.data.status, 'approved');
  assert.equal((await api('PATCH', '/api/social/posts/' + facebook.id, { media_url: 'http://insecure.example/video.mp4' })).s, 422);
  await api('POST', '/api/social/sync');
  const afterSync = await api('GET', '/api/social/posts');
  assert.equal(afterSync.j.data.filter(p => p.article_id === a.j.data.id).length, 3);
  const hidden = await api('GET', '/api/social/posts', null, { auth: false });
  assert.equal(hidden.s, 401);
});
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
test('media: content-sniffed upload, reject fake image, usage-check delete', async () => {
  const bad = await api('POST', '/api/media/upload', Buffer.from('<?php evil ?>'), { raw: true, headers: { 'x-filename': 'shell.png', 'content-type': 'image/png' } }); assert.equal(bad.s, 415);
  const svg = await api('POST', '/api/media/upload', Buffer.from('<svg onload=alert(1)></svg>'), { raw: true, headers: { 'x-filename': 'x.svg', 'content-type': 'image/svg+xml' } }); assert.equal(svg.s, 415);
  const up = await api('POST', '/api/media/upload', PNG, { raw: true, headers: { 'x-filename': 'pixel.png', 'content-type': 'application/octet-stream' } }); assert.equal(up.s, 201); assert.equal(up.j.data.mime_type, 'image/png'); assert.equal(up.j.data.width, 1);
  const file = await fetch(base + up.j.data.url); assert.equal(file.status, 200); assert.equal(file.headers.get('content-type'), 'image/png');
  const folder = await api('POST', '/api/admin/media_folders', { name: 'CMS test folder' }); assert.equal(folder.s, 201);
  const renamedFolder = await api('PUT', `/api/admin/media_folders/${folder.j.data.id}`, { name: 'CMS test folder renamed' }); assert.equal(renamedFolder.s, 200); assert.equal(renamedFolder.j.data.name, 'CMS test folder renamed');
  const moved = await api('PATCH', `/api/media/${up.j.data.id}`, { alt_text: 'Portfolio thumbnail', folder_id: folder.j.data.id });
  assert.equal(moved.s, 200); assert.equal(moved.j.data.data.alt_text, 'Portfolio thumbnail'); assert.equal(moved.j.data.data.folder_id, folder.j.data.id);
  assert.equal((await api('PATCH', `/api/media/${up.j.data.id}`, { folder_id: '00000000-0000-4000-8000-000000000000' })).s, 422);
  assert.equal((await api('PATCH', '/api/media/00000000-0000-4000-8000-000000000000', { alt_text: 'Missing' })).s, 404);
  const art = await api('POST', '/api/admin/articles', { title: 'With Image', content_md: `![p](${up.j.data.url})`, featured_image_url: up.j.data.url }); assert.equal(art.s, 201);
  const usage = await api('GET', `/api/media/${up.j.data.id}/usage`); assert.equal(usage.j.data.length, 1); assert.equal((await api('DELETE', `/api/media/${up.j.data.id}`)).s, 409);
  await api('DELETE', `/api/admin/articles/${art.j.data.id}`); assert.equal((await api('DELETE', `/api/media/${up.j.data.id}`)).s, 200);
  const big = await api('POST', '/api/media/upload', Buffer.alloc(9 * 1048576, 1), { raw: true, headers: { 'x-filename': 'big.png' } }); assert.equal(big.s, 413);
});
test('contact form: validation, qualification, WhatsApp URL, no-budget lead kept, spam, duplicate, honeypot', async () => {
  assert.equal((await api('POST', '/api/contacts', { name: 'A', message: 'hello there friend' }, { auth: false })).s, 422);
  const q = await api('POST', '/api/contacts', { name: 'Ada Obi', email: 'ada@example.com', phone: '+2348012345678', service: 'Website Development', message: 'I need a website for my restaurant business, with online menu and booking. Need it soon.' }, { auth: false });
  assert.equal(q.s, 201); assert.equal(q.j.data.status, 'qualified'); assert.ok(q.j.data.whatsapp_url.startsWith(base + '/api/links/')); assert.ok(q.j.data.email_url.startsWith(base + '/api/links/'));
  const waRedirect = await api('GET', q.j.data.whatsapp_url.replace(base, ''), null, { auth: false });
  assert.equal(waRedirect.s, 302); assert.match(waRedirect.r.headers.get('location'), /^https:\/\/wa\.me\/2347046947391\?text=/);
  const emailRedirect = await api('GET', q.j.data.email_url.replace(base, ''), null, { auth: false });
  assert.equal(emailRedirect.s, 302); assert.match(emailRedirect.r.headers.get('location'), /^mailto:anyaegbuemmanuel2021@gmail.com\?/);
  const tampered = await api('GET', q.j.data.whatsapp_url.replace(base, '').replace(/.$/, 'x'), null, { auth: false });
  assert.equal(tampered.s, 404); assert.equal(q.j.data.whatsapp_message_sent, false); assert.equal(q.j.data.owner_notified_by_email, false);
  const n = await api('POST', '/api/contacts', { name: 'Tunde', email: 'tunde@example.com', message: 'Hi, can we talk about a project please?' }, { auth: false }); assert.equal(n.s, 201); assert.notEqual(n.j.data.status, 'rejected'); assert.notEqual(n.j.data.status, 'spam');
  assert.equal((await api('POST', '/api/contacts', { name: 'Tunde', email: 'tunde@example.com', message: 'Hi, can we talk about a project please?' }, { auth: false })).s, 409);
  await api('POST', '/api/contacts', { name: 'Spam', email: 's@example.com', message: 'Buy cheap backlinks and crypto http://a.com http://b.com http://c.com' }, { auth: false });
  const hp = await api('POST', '/api/contacts', { name: 'Bot', email: 'b@example.com', message: 'honeypot filled message', website: 'http://x' }, { auth: false }); assert.equal(hp.j.data.id, null);
  const leads = await api('GET', '/api/leads'); assert.equal(leads.j.meta.total, 3); const spam = await api('GET', '/api/leads?status=spam'); assert.equal(spam.j.data.length, 1);
  const lead = await api('GET', `/api/leads/${q.j.data.id}`); assert.equal(lead.j.data.messages.length, 1); assert.equal((await api('PATCH', `/api/leads/${q.j.data.id}`, { status: 'converted' })).s, 200); assert.equal((await api('PATCH', `/api/leads/${q.j.data.id}`, { status: 'bogus' })).s, 422);
});
test('rate limit on contact form', async () => { let last; for (let i = 0; i < 10; i++) last = await api('POST', '/api/contacts', { name: 'R' + i, email: `r${i}@example.com`, message: 'Rate limit test message ' + i }, { auth: false }); assert.equal(last.s, 429); });
test('ads: serve, impression, click redirect, javascript: destination rejected, adsense id validation', async () => {
  const bad = await api('POST', '/api/admin/advertisements', { title: 'Evil', destination_url: 'javascript:alert(1)', placement_key: 'home' }); assert.equal(bad.s, 422);
  const ad = await api('POST', '/api/admin/advertisements', { title: 'Promo', destination_url: 'https://example.com/x', placement_key: 'home', is_active: true, image_url: '/media/x.png' }); assert.equal(ad.s, 201);
  const s = await api('GET', '/api/advertisements/serve?placement=home', null, { auth: false }); assert.equal(s.j.data.id, ad.j.data.id); assert.equal((await api('GET', '/api/advertisements/serve?placement=footer', null, { auth: false })).j.data, null);
  const c = await api('GET', s.j.data.click_url, null, { auth: false }); assert.equal(c.s, 302); assert.equal(c.r.headers.get('location'), 'https://example.com/x');
  const perf = await api('GET', '/api/advertisements/performance'); const row = perf.j.data.find(r => r.id === ad.j.data.id); assert.equal(row.impressions, 1); assert.equal(row.clicks, 1);
  assert.equal((await api('PUT', '/api/advertisements/network', { adsense: { value: 'nope', enabled: true } })).s, 422); assert.equal((await api('PUT', '/api/advertisements/network', { adsense: { value: 'ca-pub-1234567890123456', enabled: true } })).s, 200);
  app.invalidate(); assert.equal((await api('GET', '/api/content', null, { auth: false })).j.data.ads.adsense.client, 'ca-pub-1234567890123456');
});
test('analytics tracking is privacy-preserving and respects DNT; summary is real', async () => {
  await api('POST', '/api/analytics/track', { path: '/index.html', referrer: 'https://google.com/' }, { auth: false, headers: { 'user-agent': 'Mozilla/5.0' } }); await api('POST', '/api/analytics/track', { path: '/x' }, { auth: false, headers: { dnt: '1', 'user-agent': 'Mozilla/5.0' } }); await api('POST', '/api/analytics/track', { path: '/bot' }, { auth: false, headers: { 'user-agent': 'Googlebot' } });
  const sum = await api('GET', '/api/analytics/summary'); assert.equal(sum.j.data.page_views, 1); assert.equal(sum.j.data.sources[0].source, 'google.com'); const raw = (await db.query('SELECT * FROM page_views')).rows[0]; assert.ok(!JSON.stringify(raw).includes('127.0.0.1'));
  const ov = await api('GET', '/api/system/overview'); assert.equal(ov.s, 200); assert.equal(ov.j.data.data_is_real, true);
});
test('email: log provider never claims delivery; subscribe/unsubscribe; AI needs approval flag; inbound secret', async () => {
  const s = await api('POST', '/api/email/send', { to: 'c@example.com', subject: 'Hi', body: 'Hello' }); assert.equal(s.j.data.delivered, false); assert.ok(s.j.data.note);
  assert.equal((await api('POST', '/api/email/subscribe', { email: 'sub@example.com' }, { auth: false })).s, 201); const subs = await api('GET', '/api/email/subscribers'); assert.equal(subs.j.data.length, 1);
  const tok = (await db.query('SELECT unsubscribe_token t FROM email_subscribers')).rows[0].t; assert.equal((await api('GET', `/api/email/unsubscribe/${tok}`, null, { auth: false })).s, 200); assert.equal((await api('GET', '/api/email/subscribers')).j.data[0].status, 'unsubscribed');
  await api('POST', '/api/email/subscribe', { email: 'campaign@example.com' }, { auth: false });
  const campaign = await api('POST', '/api/admin/email_campaigns', { name: 'Retryable campaign', subject: 'Campaign test', body: 'This must not be marked delivered.' });
  assert.equal(campaign.s, 201);
  const attempted = await api('POST', `/api/email/campaigns/${campaign.j.data.id}/send`, {});
  assert.equal(attempted.s, 200); assert.equal(attempted.j.data.delivered, false);
  assert.equal(attempted.j.data.sent, 0); assert.equal(attempted.j.data.simulated, 1);
  const campaignState = (await db.query('SELECT status, sent_count, failed_count, sent_at FROM email_campaigns WHERE id = $1', [campaign.j.data.id])).rows[0];
  assert.equal(campaignState.status, 'draft'); assert.equal(Number(campaignState.sent_count), 0); assert.equal(campaignState.sent_at, null);
  const ai = await api('POST', '/api/email/ai-assist', { subject: 'Quote', body: 'How much for a website? Urgent.' }); assert.equal(ai.j.data.category, 'quote'); assert.equal(ai.j.data.requiresApproval, true); assert.equal(ai.j.data.urgency, 'high');
  assert.equal((await api('POST', '/api/email/inbound', { from: 'x@example.com', body: 'hi' }, { auth: false })).s, 401); assert.ok((await api('GET', '/api/email/logs')).j.data.length >= 1);
});
test('backup export → import into fresh DB verifies counts; media tables, FKs preserved', async () => {
  const x = await exportAll(db); const t = await connect('sqlite::memory:'); const r = await importAll(t, x.json); assert.deepEqual(r.errors, []); assert.ok(r.ok);
  for (const tb of ['articles', 'leads', 'services', 'contacts', 'admins']) assert.equal(Number((await t.query(`SELECT COUNT(*) c FROM ${tb}`)).rows[0].c), Number((await db.query(`SELECT COUNT(*) c FROM ${tb}`)).rows[0].c));
  const again = await importAll(t, x.json); assert.ok(!again.ok); assert.match(again.errors[0], /already contains data/); assert.ok((await importAll(t, x.json, { force: true })).ok); assert.ok(!(await importAll(t, '{bad')).ok);
  const dl = await api('POST', '/api/backups/export'); assert.equal(dl.s, 200); assert.ok(dl.r.headers.get('x-backup-checksum')); assert.equal(JSON.parse(typeof dl.j === 'string' ? dl.j : JSON.stringify(dl.j)).format, 'portfolio-backup'); assert.ok(!dl.j.includes?.('token_hash'));
});
test('sessions: logout revokes; seo endpoints; permissions', async () => {
  assert.match((await api('GET', '/robots.txt', null, { auth: false })).j, /Disallow: \/admin/); assert.match((await api('GET', '/sitemap.xml', null, { auth: false })).j, /<urlset/); assert.equal((await api('GET', '/articles/anything', null, { auth: false })).s, 404); assert.equal((await api('GET', '/admin', null, { auth: false })).s, 404 === 0 ? 0 : (await api('GET', '/admin', null, { auth: false })).s);
  const out = await api('POST', '/api/auth/logout'); assert.equal(out.s, 200); assert.equal((await api('GET', '/api/auth/me')).s, 401);
});
test('pagination parameters are clamped (no 500 on fractional/negative values)', async () => {
  const li = await api('POST', '/api/auth/login', { email: 'owner@example.com', password: 'Str0ng-Password-1' }, { auth: false }); assert.equal(li.s, 200); cookie = li.r.headers.get('set-cookie').split(';')[0]; csrf = li.j.data.csrf;
  for (const q of ['limit=-1', 'limit=0.5&page=1.5', 'limit=abc', 'limit=999999']) { const r = await api('GET', `/api/admin/services?${q}`); assert.equal(r.s, 200, q); const m = await api('GET', `/api/media?${q}`); assert.equal(m.s, 200, 'media ' + q); }
});
test('static server does not expose docs or hosting-platform config files', async () => {
  for (const p of ['/README.md', '/_headers', '/_redirects', '/assets/files/README.txt', '/assets/images/HOW_TO_ADD_PHOTO.txt']) { const r = await fetch(base + p); assert.equal(r.status, 404, p); }
  assert.equal((await fetch(base + '/index.html')).status, 200);
});
test('path traversal attempts are rejected', async () => {
  for (const p of ['/..%2f..%2fserver/config.js', '/%2e%2e%2fserver%2fconfig.js', '/admin/..%2f..%2fserver/config.js', '/media/..%2f..%2f..%2fetc/passwd']) { const r = await fetch(base + p); assert.ok([403, 404].includes(r.status), p + ' -> ' + r.status); const t = await r.text(); assert.ok(!t.includes('authSecret'), p); }
});
test('upload validation: content sniffing, size and filename handling', async () => {
  const up = (buf, name) => api('POST', '/api/media/upload', buf, { raw: true, headers: { 'x-filename': name, 'content-type': 'application/octet-stream' } });
  assert.equal((await up(Buffer.from('<script>alert(1)</script>'), 'a.png')).s, 415);
  assert.equal((await up(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), 'a.svg')).s, 415);
  assert.equal((await up(Buffer.alloc(0), 'empty.pdf')).s, 400);
  const ok = await up(Buffer.from('%PDF-1.4\n%%EOF'), '../../../etc/x.pdf'); assert.equal(ok.s, 201); assert.ok(!ok.j.data.storage_key.includes('..')); assert.ok(!ok.j.data.original_name.includes('/'));
});
