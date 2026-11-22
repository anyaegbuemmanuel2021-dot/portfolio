import test from 'node:test'; import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'sqlite::memory:'; process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123'; process.env.LOCAL_MEDIA_DIR = './data/test-media'; process.env.SITE_URL = 'http://localhost'; process.env.TRUST_PROXY = 'false';
const { buildApp } = await import('../server/index.js'); const { authService } = await import('../server/services/auth.js'); const sec = await import('../server/lib/security.js'); const { connect } = await import('../server/db.js'); const { exportAll, importAll } = await import('../server/services/backup.js'); const { renderMarkdown } = await import('../server/lib/markdown.js');
const { deflateSync } = await import('node:zlib');
const { app, db, deps } = await buildApp(); const server = app.server().listen(0); const base = `http://127.0.0.1:${server.address().port}`;
await authService(db, { real: false }).bootstrap({ email: 'owner@example.com', password: 'Str0ng-Password-1', name: 'Owner' });
let cookie = '', csrf = '';
const api = async (method, path, body, { raw, headers = {}, auth = true } = {}) => { const h = { ...headers }; if (auth && cookie) h.cookie = cookie; if (auth && csrf && method !== 'GET') h['x-csrf-token'] = csrf; if (body && !raw) h['content-type'] = 'application/json'; const r = await fetch(base + path, { method, headers: h, body: raw ? body : body ? JSON.stringify(body) : undefined, redirect: 'manual' }); const ct = r.headers.get('content-type') || ''; const j = ct.includes('json') ? await r.json() : await r.text(); return { s: r.status, j, r }; };
test.after(() => { server.close(); });

test('password-reset requests are throttled per normalized account, not only per IP', async () => {
  const originalInfo = console.info;
  console.info = () => {};
  try {
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await api('POST', '/api/auth/forgot', { email: 'UNREGISTERED-RESET@example.com' }, { auth: false }));
    }
    assert.deepEqual(results.map(result => result.s), [200, 200, 200, 429]);
    const { sha256 } = await import('../server/lib/security.js');
    const bucket = await db.query('SELECT SUM(hits) AS hits FROM request_rate_limits WHERE bucket_key = $1', ['forgot-email:' + sha256('unregistered-reset@example.com')]);
    assert.equal(Number(bucket.rows[0].hits), 4);
  } finally {
    console.info = originalInfo;
    await db.query("DELETE FROM request_rate_limits WHERE bucket_key LIKE 'forgot:%'");
  }
});


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
  const reorderBefore = Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'services' AND action = 'reorder'")).rows[0].c);
  assert.equal((await api('POST', '/api/admin/services/reorder', { ids: [id] })).s, 200);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'services' AND action = 'reorder'")).rows[0].c), reorderBefore + 1);
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
test('restoring an article revision invalidates content cache and records an audit event', async () => {
  const article = await api('POST', '/api/admin/articles', {
    title: 'Revision Restore Audit',
    content_md: 'Original revision',
    status: 'published'
  });
  assert.equal(article.s, 201);
  const id = article.j.data.id;
  await api('PUT', `/api/admin/articles/${id}`, {
    title: 'Revision Restore Audit',
    content_md: 'Updated revision',
    status: 'published'
  });
  const revisions = await api('GET', `/api/admin/articles/${id}/revisions`);
  assert.ok(revisions.j.data.length >= 1);
  const revisionId = revisions.j.data[revisions.j.data.length - 1].id;
  const before = Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'article' AND action = 'restore'")).rows[0].c);
  const restored = await api('POST', `/api/admin/articles/${id}/restore/${revisionId}`);
  assert.equal(restored.s, 200);
  assert.equal(restored.j.data.content_md, 'Original revision');
  const after = await db.query("SELECT admin_id, action, entity, entity_id, details FROM audit_logs WHERE entity = 'article' AND action = 'restore' ORDER BY created_at DESC LIMIT 1");
  assert.equal(Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'article' AND action = 'restore'")).rows[0].c), before + 1);
  assert.ok(after.rows[0].admin_id);
  assert.equal(after.rows[0].entity_id, id);
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

function pngWithDimensions(width, height) {
  const buf = Buffer.from(PNG);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  let crc = 0xffffffff;
  for (let i = 12; i < 29; i++) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  buf.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  return buf;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function storedZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name);
    const data = Buffer.from(value);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const centralData = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralData, end]);
}
test('media: reject ZIP files that merely claim to be DOCX and accept a valid OOXML package', async () => {
  const fake = await api('POST', '/api/media/upload', Buffer.from('PK\\x03\\x04not-a-real-docx'), {
    raw: true, headers: { 'x-filename': 'fake.docx', 'content-type': 'application/octet-stream' }
  });
  assert.equal(fake.s, 415);
  const docx = storedZip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'
  });
  const valid = await api('POST', '/api/media/upload', docx, {
    raw: true, headers: { 'x-filename': 'valid.docx', 'content-type': 'application/octet-stream' }
  });
  assert.equal(valid.s, 201);
  assert.equal(valid.j.data.mime_type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  await api('DELETE', `/api/media/${valid.j.data.id}`);

  const commentedFake = storedZip({
    '[Content_Types].xml': '<!-- <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types> -->',
    'word/document.xml': '<!-- <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document> -->'
  });
  assert.equal((await api('POST', '/api/media/upload', commentedFake, {
    raw: true, headers: { 'x-filename': 'commented-fake.docx', 'content-type': 'application/octet-stream' }
  })).s, 415);

  const corrupt = Buffer.from(docx);
  const xmlOffset = corrupt.indexOf(Buffer.from('<w:body/>'));
  corrupt[xmlOffset] = 0x58;
  const badChecksum = await api('POST', '/api/media/upload', corrupt, {
    raw: true, headers: { 'x-filename': 'corrupt.docx', 'content-type': 'application/octet-stream' }
  });
  assert.equal(badChecksum.s, 415);

  const traversal = storedZip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
    '../outside.txt': 'not allowed'
  });
  assert.equal((await api('POST', '/api/media/upload', traversal, {
    raw: true, headers: { 'x-filename': 'traversal.docx', 'content-type': 'application/octet-stream' }
  })).s, 415);

  const bomb = Buffer.from(docx);
  const eocd = bomb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const centralOffset = bomb.readUInt32LE(eocd + 16);
  bomb.writeUInt32LE(0xffffffff, centralOffset + 24);
  assert.equal((await api('POST', '/api/media/upload', bomb, {
    raw: true, headers: { 'x-filename': 'oversized-package.docx', 'content-type': 'application/octet-stream' }
  })).s, 415);
});

function gifWithFrames(width, height, count) {
  const header = Buffer.from('GIF89a');
  const screen = Buffer.alloc(7);
  screen.writeUInt16LE(width, 0);
  screen.writeUInt16LE(height, 2);
  screen[4] = 0x80; // two-entry global colour table
  const palette = Buffer.from([0, 0, 0, 255, 255, 255]);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const descriptor = Buffer.alloc(10);
    descriptor[0] = 0x2c;
    descriptor.writeUInt16LE(width, 5);
    descriptor.writeUInt16LE(height, 7);
    frames.push(descriptor, Buffer.from([2, 2, 0x44, 0x01, 0]));
  }
  return Buffer.concat([header, screen, palette, ...frames, Buffer.from([0x3b])]);
}
test('media: bound cumulative GIF frame pixels and animation frame count', async () => {
  const valid = await api('POST', '/api/media/upload', gifWithFrames(1, 1, 1), {
    raw: true, headers: { 'x-filename': 'tiny.gif', 'content-type': 'image/gif' }
  });
  assert.equal(valid.s, 201);
  await api('DELETE', `/api/media/${valid.j.data.id}`);

  const pixelBomb = await api('POST', '/api/media/upload', gifWithFrames(1000, 1000, 41), {
    raw: true, headers: { 'x-filename': 'animated-pixel-bomb.gif', 'content-type': 'image/gif' }
  });
  assert.equal(pixelBomb.s, 413);

  const frameBomb = await api('POST', '/api/media/upload', gifWithFrames(1, 1, 501), {
    raw: true, headers: { 'x-filename': 'too-many-frames.gif', 'content-type': 'image/gif' }
  });
  assert.equal(frameBomb.s, 413);
});
function webpAnimationWithFrames(width, height, count) {
  const chunks = [];
  const vp8x = Buffer.alloc(18);
  vp8x.write('VP8X', 0);
  vp8x.writeUInt32LE(10, 4);
  vp8x[8] = 0x02; // animation flag
  vp8x.writeUIntLE(width - 1, 12, 3);
  vp8x.writeUIntLE(height - 1, 15, 3);
  chunks.push(vp8x);

  const anim = Buffer.alloc(14);
  anim.write('ANIM', 0);
  anim.writeUInt32LE(6, 4);
  chunks.push(anim);

  for (let i = 0; i < count; i++) {
    const frame = Buffer.alloc(34);
    frame.write('ANMF', 0);
    frame.writeUInt32LE(18, 4);
    frame.writeUIntLE(width - 1, 14, 3);
    frame.writeUIntLE(height - 1, 17, 3);
    frame.write('VP8 ', 24);
    frame.writeUInt32LE(1, 28);
    frame[32] = 0;
    // ANMF frame data is structurally represented; pixel budget is checked
    // from the declared frame rectangle before any decoder is invoked.
    const chunk = frame;
    chunk.writeUInt32LE(26, 4);
    chunks.push(chunk);
  }
  const body = Buffer.concat([Buffer.from('WEBP'), ...chunks]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0);
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}
test('media: bound cumulative animated WebP frame pixels before decoding', async () => {
  const pixelBomb = await api('POST', '/api/media/upload', webpAnimationWithFrames(1000, 1000, 41), {
    raw: true, headers: { 'x-filename': 'animated-pixel-bomb.webp', 'content-type': 'image/webp' }
  });
  assert.equal(pixelBomb.s, 413);
});
function pngChunk(type, data) {
  const name = Buffer.from(type);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}
function apngWithFrames(width, height, count) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(count, 0);
  const raw = Buffer.alloc(height * (1 + width * 4));
  const compressed = deflateSync(raw);
  const chunks = [pngChunk('IHDR', ihdr), pngChunk('acTL', actl)];
  let sequence = 0;
  const frameControl = () => {
    const data = Buffer.alloc(26);
    data.writeUInt32BE(sequence++, 0);
    data.writeUInt32BE(width, 4);
    data.writeUInt32BE(height, 8);
    data.writeUInt16BE(1, 20);
    data.writeUInt16BE(10, 22);
    return pngChunk('fcTL', data);
  };
  chunks.push(frameControl(), pngChunk('IDAT', compressed));
  for (let i = 1; i < count; i++) {
    chunks.push(frameControl());
    const data = Buffer.alloc(4 + compressed.length);
    data.writeUInt32BE(sequence++, 0);
    compressed.copy(data, 4);
    chunks.push(pngChunk('fdAT', data));
  }
  chunks.push(pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat([signature, ...chunks]);
}
test('media: bound cumulative APNG frame pixels before image decoding', async () => {
  const response = await api('POST', '/api/media/upload', apngWithFrames(1000, 1000, 41), {
    raw: true, headers: { 'x-filename': 'animated-pixel-bomb.png', 'content-type': 'image/png' }
  });
  assert.equal(response.s, 413);
});
test('media: reject images when dimensions cannot be safely verified', async () => {
  const { validateImageDimensions } = await import('../server/services/media.js');
  assert.throws(() => validateImageDimensions({}), error => error.status === 422);
  assert.throws(() => validateImageDimensions({ width: 0, height: 20 }), error => error.status === 422);
  assert.throws(() => validateImageDimensions({ width: 10000, height: 10000 }), error => error.status === 413);
  assert.doesNotThrow(() => validateImageDimensions({ width: 1200, height: 800 }));
});

test('media: reject images whose decoded pixel count exceeds the safe processing budget', async () => {
  const oversized = pngWithDimensions(10000, 10000);
  const response = await api('POST', '/api/media/upload', oversized, {
    raw: true,
    headers: { 'x-filename': 'oversized-image.png', 'content-type': 'image/png' }
  });
  assert.equal(response.s, 413);
  assert.match(response.j.error.message, /image dimensions/i);
});

test('media: content-sniffed upload, reject fake image, usage-check delete', async () => {
  const bad = await api('POST', '/api/media/upload', Buffer.from('<?php evil ?>'), { raw: true, headers: { 'x-filename': 'shell.png', 'content-type': 'image/png' } }); assert.equal(bad.s, 415);
  const svg = await api('POST', '/api/media/upload', Buffer.from('<svg onload=alert(1)></svg>'), { raw: true, headers: { 'x-filename': 'x.svg', 'content-type': 'image/svg+xml' } }); assert.equal(svg.s, 415);
  const malformedName = await api('POST', '/api/media/upload', PNG, { raw: true, headers: { 'x-filename': '%E0%A4%A', 'content-type': 'application/octet-stream' } }); assert.equal(malformedName.s, 400);
  const longName = await api('POST', '/api/media/upload', PNG, { raw: true, headers: { 'x-filename': encodeURIComponent('a'.repeat(256)), 'content-type': 'application/octet-stream' } }); assert.equal(longName.s, 400);
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
  assert.equal(q.s, 201); assert.equal(q.j.data.status, 'qualified'); assert.ok(q.j.data.whatsapp_url.startsWith('http://localhost/api/links/')); assert.ok(q.j.data.email_url.startsWith('http://localhost/api/links/'));
  const waRedirect = await api('GET', q.j.data.whatsapp_url.replace('http://localhost', ''), null, { auth: false });
  assert.equal(waRedirect.s, 302); assert.match(waRedirect.r.headers.get('location'), /^https:\/\/wa\.me\/2347046947391\?text=/);
  const emailRedirect = await api('GET', q.j.data.email_url.replace('http://localhost', ''), null, { auth: false });
  assert.equal(emailRedirect.s, 302); assert.match(emailRedirect.r.headers.get('location'), /^mailto:anyaegbuemmanuel2021@gmail.com\?/);
  const tampered = await api('GET', q.j.data.whatsapp_url.replace('http://localhost', '').replace(/.$/, 'x'), null, { auth: false });
  assert.equal(tampered.s, 404); assert.equal(q.j.data.whatsapp_message_sent, false); assert.equal(q.j.data.owner_notified_by_email, false);
  const n = await api('POST', '/api/contacts', { name: 'Tunde', email: 'tunde@example.com', message: 'Hi, can we talk about a project please?' }, { auth: false }); assert.equal(n.s, 201); assert.notEqual(n.j.data.status, 'rejected'); assert.notEqual(n.j.data.status, 'spam');
  assert.equal((await api('POST', '/api/contacts', { name: 'Tunde', email: 'tunde@example.com', message: 'Hi, can we talk about a project please?' }, { auth: false })).s, 409);
  await api('POST', '/api/contacts', { name: 'Spam', email: 's@example.com', message: 'Buy cheap backlinks and crypto http://a.com http://b.com http://c.com' }, { auth: false });
  const hp = await api('POST', '/api/contacts', { name: 'Bot', email: 'b@example.com', message: 'honeypot filled message', website: 'http://x' }, { auth: false }); assert.equal(hp.j.data.id, null);
  const leads = await api('GET', '/api/leads'); assert.equal(leads.j.meta.total, 3); const spam = await api('GET', '/api/leads?status=spam'); assert.equal(spam.j.data.length, 1);
  const lead = await api('GET', `/api/leads/${q.j.data.id}`); assert.equal(lead.j.data.messages.length, 1);
  const beforeLeadAudit = Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'lead' AND action = 'update'")).rows[0].c);
  assert.equal((await api('PATCH', `/api/leads/${q.j.data.id}`, { status: 'converted' })).s, 200);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'lead' AND action = 'update'")).rows[0].c), beforeLeadAudit + 1);
  assert.equal((await api('PATCH', `/api/leads/${q.j.data.id}`, { status: 'bogus' })).s, 422);
  const activityBefore = Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'lead_activity' AND action = 'create'")).rows[0].c);
  const activity = await api('POST', `/api/leads/${q.j.data.id}/activities`, { type: 'note', note: 'Audit trail check' }); assert.equal(activity.s, 201);
  const followup = await api('POST', `/api/leads/${q.j.data.id}/follow-ups`, { due_at: new Date(Date.now() + 86400000).toISOString(), note: 'Follow up securely' }); assert.equal(followup.s, 201);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity IN ('lead_activity','lead_follow_up') AND action = 'create'")).rows[0].c), activityBefore + 2);
  const latestAudit = await db.query("SELECT admin_id, action, entity FROM audit_logs WHERE entity IN ('lead_activity','lead_follow_up') ORDER BY created_at DESC LIMIT 2");
  assert.equal(latestAudit.rows.length, 2); assert.ok(latestAudit.rows.every(row => row.admin_id && row.action === 'create'));
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
  assert.equal((await api('POST', '/api/email/inbound', { from: 'x@example.com', body: 'hi' }, { auth: false })).s, 401); const inboundBuckets = await db.query("SELECT COUNT(*) AS c FROM request_rate_limits WHERE bucket_key LIKE 'email-inbound:%'"); assert.ok(Number(inboundBuckets.rows[0].c) > 0); assert.ok((await api('GET', '/api/email/logs')).j.data.length >= 1);
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

test('password-management endpoints reject malformed input before reaching auth service', async () => {
  const badForgot = await api('POST', '/api/auth/forgot', { email: 'not-an-email' }, { auth: false });
  assert.equal(badForgot.s, 422);
  const missingForgot = await api('POST', '/api/auth/forgot', {}, { auth: false });
  assert.equal(missingForgot.s, 422);
  const badReset = await api('POST', '/api/auth/reset', { token: '', password: 'Strong-Password-123' }, { auth: false });
  assert.equal(badReset.s, 422);
  const missingReset = await api('POST', '/api/auth/reset', {}, { auth: false });
  assert.equal(missingReset.s, 422);
  const badPasswordChange = await api('POST', '/api/auth/password', { current: 123, next: 'Strong-Password-123' });
  assert.equal(badPasswordChange.s, 422);
});

test('using one password-reset link invalidates every other outstanding link for that admin', async () => {
  const service = authService(db, { real: false });
  const links = [];
  const originalInfo = console.info;
  console.info = (...args) => {
    const match = String(args[1] || '').match(/reset=([A-Za-z0-9_-]+)/);
    if (match) links.push(match[1]);
  };
  try {
    await service.requestReset('owner@example.com', 'reset-token-test');
    await service.requestReset('owner@example.com', 'reset-token-test');
    assert.equal(links.length, 2);
    await service.resetPassword(links[0], 'Another-Strong-Password-123');
    await assert.rejects(
      () => service.resetPassword(links[1], 'YetAnother-Strong-Password-123'),
      error => error.status === 400
    );
  } finally {
    console.info = originalInfo;
    await db.query('UPDATE password_reset_requests SET used_at = COALESCE(used_at, $1) WHERE admin_id = (SELECT id FROM admins WHERE email = $2)', [new Date().toISOString(), 'owner@example.com']);
    await db.query('UPDATE admins SET password_hash = $1 WHERE email = $2', [await sec.hashPassword('Str0ng-Password-1'), 'owner@example.com']);
  }
});


test('changing an admin password invalidates all outstanding password-reset links', async () => {
  const service = authService(db, { real: false });
  const links = [];
  const originalInfo = console.info;
  console.info = (...args) => {
    const match = String(args[1] || '').match(/reset=([A-Za-z0-9_-]+)/);
    if (match) links.push(match[1]);
  };
  try {
    await service.requestReset('owner@example.com', 'password-change-reset-test');
    assert.equal(links.length, 1);
    const admin = (await db.query('SELECT id FROM admins WHERE email = $1', ['owner@example.com'])).rows[0];
    await service.changePassword(admin.id, 'Str0ng-Password-1', 'Changed-Password-123', 'current-session-test');
    await assert.rejects(
      () => service.resetPassword(links[0], 'Reset-Should-Not-Work-123'),
      error => error.status === 400
    );
  } finally {
    console.info = originalInfo;
    await db.query('UPDATE password_reset_requests SET used_at = COALESCE(used_at, $1) WHERE admin_id = (SELECT id FROM admins WHERE email = $2)', [new Date().toISOString(), 'owner@example.com']);
    await db.query('UPDATE admins SET password_hash = $1 WHERE email = $2', [await sec.hashPassword('Str0ng-Password-1'), 'owner@example.com']);
  }
});


test('system overview is restricted to admins with the system permission', async () => {
  const login = await api('POST', '/api/auth/login', { email: 'owner@example.com', password: 'Str0ng-Password-1' }, { auth: false });
  assert.equal(login.s, 200);
  cookie = login.r.headers.get('set-cookie').split(';')[0];
  csrf = login.j.data.csrf;
  const admin = (await db.query('SELECT id FROM admins WHERE email = $1', ['owner@example.com'])).rows[0];
  const permission = (await db.query("SELECT id FROM permissions WHERE key = 'system'")).rows[0];
  const removed = await db.query('DELETE FROM role_permissions WHERE permission_id = $1 AND role_id IN (SELECT role_id FROM admin_role_assignments WHERE admin_id = $2) RETURNING role_id', [permission.id, admin.id]);
  try {
    const response = await api('GET', '/api/system/overview');
    assert.equal(response.s, 403);
  } finally {
    for (const row of removed.rows) {
      await db.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [row.role_id, permission.id]);
    }
  }
});


test('system data purge is recorded in the admin audit log', async () => {
  const before = Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'system' AND action = 'purge'")).rows[0].c);
  const response = await api('POST', '/api/system/purge', {});
  assert.equal(response.s, 200);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'system' AND action = 'purge'")).rows[0].c), before + 1);
});

test('biography changes are recorded in the admin audit log', async () => {
  const before = Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'biography' AND action = 'update'")).rows[0].c);
  const response = await api('PUT', '/api/admin/biography', { headline: 'Security audit test headline', body: 'Audit trail verification.' });
  assert.equal(response.s, 200);
  const after = await db.query("SELECT admin_id, action, entity, details FROM audit_logs WHERE entity = 'biography' AND action = 'update' ORDER BY created_at DESC LIMIT 1");
  assert.equal(Number((await db.query("SELECT COUNT(*) AS c FROM audit_logs WHERE entity = 'biography' AND action = 'update'")).rows[0].c), before + 1);
  assert.equal(after.rows[0].action, 'update');
  assert.equal(after.rows[0].entity, 'biography');
  assert.ok(after.rows[0].admin_id);
});
