import test from 'node:test';
import assert from 'node:assert/strict';
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.AUTH_SECRET = 'security-policy-test-secret-which-is-long-enough-123456';
process.env.SITE_URL = 'http://localhost';
process.env.TRUST_PROXY = 'false';
const { buildApp } = await import('../server/index.js');
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
