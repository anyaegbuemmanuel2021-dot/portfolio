import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.AUTH_SECRET = 'security-policy-test-secret-which-is-long-enough-123456';
process.env.SITE_URL = 'http://localhost';
process.env.TRUST_PROXY = 'false';
const { buildApp } = await import('../server/index.js');
const { clientIp, parseCookies, isPathInsideRoot, rateLimit } = await import('../server/lib/http.js');
const { isSafeBackupColumn } = await import('../server/services/backup.js');
const { authService } = await import('../server/services/auth.js');
const { app, db } = await buildApp();
const server = app.server().listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
let cookie = '', csrf = '';
const call = async (method, path, body) => {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET') { headers['content-type'] = 'application/json'; if (csrf) headers['x-csrf-token'] = csrf; }
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await response.json().catch(() => ({}));
  const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0];
  return { status: response.status, json };
};
test.after(async () => { server.close(); await db.close(); });

test('admin signs in with email and password only; no 2FA gate or enrollment endpoints exist', async () => {
  await authService(db, { real: false }).bootstrap({ email: 'secure-owner@example.com', password: 'Strong-Password-123', name: 'Secure Owner' });
  const login = await call('POST', '/api/auth/login', { email: 'secure-owner@example.com', password: 'Strong-Password-123' });
  assert.equal(login.status, 200);
  const loginBuckets = await db.query("SELECT COUNT(*) AS c FROM request_rate_limits WHERE bucket_key LIKE 'login:%'");
  assert.ok(Number(loginBuckets.rows[0].c) > 0, 'route-specific login throttle must persist in the shared database');
  csrf = login.json.data.csrf;
  assert.equal(login.json.data.admin.requires_2fa_setup, undefined);
  assert.equal(login.json.data.admin.totp_enabled, undefined);
  assert.equal((await call('GET', '/api/system/overview')).status, 200);
  assert.equal((await call('GET', '/api/auth/me')).status, 200);
  for (const p of ['begin', 'confirm', 'disable']) assert.notEqual((await call('POST', '/api/auth/totp/' + p, {})).status, 200);
});

test('legacy 2FA policy flag no longer exists in config', async () => {
  const { config } = await import('../server/config.js');
  assert.equal('requireAdmin2fa' in config, false);
});


test('public and API responses do not disclose framework or server version headers', async () => {
  const response = await fetch(base + '/');
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.equal(response.headers.get('server'), null);
  const api = await fetch(base + '/api/health');
  assert.equal(api.headers.get('x-powered-by'), null);
  assert.equal(api.headers.get('server'), null);
});

test('trusted proxy client IP uses Cloudflare visitor identity and ignores spoofable forwarding chains', () => {
  process.env.TRUST_PROXY = 'true';
  const req = {
    headers: {
      'x-forwarded-for': '198.51.100.77, 203.0.113.24',
      'cf-connecting-ip': '192.0.2.99',
      'true-client-ip': '192.0.2.98'
    },
    socket: { remoteAddress: '10.0.0.8' }
  };
  assert.equal(clientIp(req), '192.0.2.99');
  delete req.headers['cf-connecting-ip'];
  assert.equal(clientIp(req), '10.0.0.8');
  process.env.TRUST_PROXY = 'false';
  req.headers['cf-connecting-ip'] = '192.0.2.99';
  assert.equal(clientIp(req), '10.0.0.8');
});


test('malformed cookie encoding cannot throw before request error handling', () => {
  assert.deepEqual(parseCookies('sid=%E0%A4%A; theme=dark'), { sid: '', theme: 'dark' });
});

test('static path containment rejects sibling-prefix traversal and accepts in-root paths', () => {
  assert.equal(isPathInsideRoot('/srv/app/public', '/srv/app/public/assets/app.js'), true);
  assert.equal(isPathInsideRoot('/srv/app/public', '/srv/app/publicity/secret.txt'), false);
  assert.equal(isPathInsideRoot('/srv/app/public', '/srv/app/admin/index.html'), false);
});


test('write endpoints reject malformed and untrusted Origin values', async () => {
  const malformed = await fetch(base + '/api/contacts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'not a valid origin' },
    body: JSON.stringify({ name: 'Test', message: 'Hello there, this is a test.' })
  });
  assert.equal(malformed.status, 403);
  const foreign = await fetch(base + '/api/contacts', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://attacker.example' },
    body: JSON.stringify({ name: 'Test', message: 'Hello there, this is a test.' })
  });
  assert.equal(foreign.status, 403);
});


test('backup import accepts only simple SQL identifier column names', () => {
  assert.equal(isSafeBackupColumn('featured_image_url'), true);
  assert.equal(isSafeBackupColumn('updated_at'), true);
  assert.equal(isSafeBackupColumn('id) VALUES (1); DROP TABLE admins; --'), false);
  assert.equal(isSafeBackupColumn('column name'), false);
  assert.equal(isSafeBackupColumn(''), false);
});


test('public media delivery requires a registered media-library object key', async () => {
  const { randomUUID } = await import('node:crypto');
  const key = 'uploads/2026/11/security-test.png';
  await (await import('../server/providers/storage.js')).localStorageProvider().put(key, Buffer.from('approved-image'));
  const unknown = await fetch(base + '/api/media/file?key=' + encodeURIComponent('uploads/2026/11/not-in-library.png'));
  assert.equal(unknown.status, 404);
  await db.query('INSERT INTO media_files (id,storage_provider,storage_key,url,original_name,mime_type,size_bytes,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), 'local', key, '/api/media/file?key=' + encodeURIComponent(key), 'security-test.png', 'image/png', 14, new Date().toISOString()]);
  const allowed = await fetch(base + '/api/media/file?key=' + encodeURIComponent(key));
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), 'approved-image');
});

test('proxy identity is ignored unless explicitly enabled by deployment configuration', () => {
  const req = { headers: { 'cf-connecting-ip': '192.0.2.99', 'x-forwarded-for': '198.51.100.77' }, socket: { remoteAddress: '10.0.0.8' } };
  delete process.env.TRUST_PROXY;
  assert.equal(clientIp(req), '10.0.0.8');
  process.env.TRUST_PROXY = 'true';
  assert.equal(clientIp(req), '192.0.2.99');
  process.env.TRUST_PROXY = 'false';
});

test('web database restore remains disabled in production even if legacy override is set', async () => {
  const { config } = await import('../server/config.js');
  const oldProd = config.isProd, oldOverride = process.env.ALLOW_WEB_IMPORT;
  config.isProd = true;
  process.env.ALLOW_WEB_IMPORT = 'true';
  try {
    const response = await call('POST', '/api/backups/import', { target_url: 'http://127.0.0.1:1', backup: {} });
    assert.equal(response.status, 403);
  } finally {
    config.isProd = oldProd;
    if (oldOverride === undefined) delete process.env.ALLOW_WEB_IMPORT; else process.env.ALLOW_WEB_IMPORT = oldOverride;
  }
});


test('request rate limits are shared through atomic database counters', async () => {
  const key = 'security-test-shared-bucket';
  await rateLimit(key, 2, 60e3, db);
  await rateLimit(key, 2, 60e3, db);
  await assert.rejects(() => rateLimit(key, 2, 60e3, db), error => error.status === 429);
});


test('password-reset route throttle persists in the shared database', async () => {
  await call('POST', '/api/auth/forgot', { email: 'secure-owner@example.com' });
  const buckets = await db.query("SELECT COUNT(*) AS c FROM request_rate_limits WHERE bucket_key LIKE 'forgot:%'");
  assert.ok(Number(buckets.rows[0].c) > 0, 'password-reset throttle must persist in the shared database');
});


test('public analytics throttles persist in the shared database', async () => {
  const response = await call('POST', '/api/analytics/track', { path: '/security-throttle-check', type: 'page' });
  assert.equal(response.status, 202);
  const buckets = await db.query("SELECT COUNT(*) AS c FROM request_rate_limits WHERE bucket_key LIKE 'track:%'");
  assert.ok(Number(buckets.rows[0].c) > 0, 'analytics throttle must persist in the shared database');
});
