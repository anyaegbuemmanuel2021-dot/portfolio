import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.AUTH_SECRET = 'security-policy-test-secret-which-is-long-enough-123456';
process.env.SITE_URL = 'http://localhost';
process.env.TRUST_PROXY = 'false';
const { buildApp } = await import('../server/index.js');
const { clientIp, parseCookies, isPathInsideRoot } = await import('../server/lib/http.js');
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
