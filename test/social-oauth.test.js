import test from 'node:test';
import assert from 'node:assert/strict';
import { socialOAuthService } from '../server/services/social-oauth.js';

function memoryDb() {
  const rows = new Map();
  return { rows, async query(sql, params = []) {
    if (sql.startsWith('INSERT INTO site_settings')) { rows.set(params[0], params[1]); return { rowCount: 1, rows: [] }; }
    if (sql.startsWith('SELECT value FROM site_settings')) return { rowCount: rows.has(params[0]) ? 1 : 0, rows: rows.has(params[0]) ? [{ value: rows.get(params[0]) }] : [] };
    if (sql.startsWith('DELETE FROM site_settings')) { let count=0; for (const k of rows.keys()) if (k.startsWith(params[0].replace('%',''))) { rows.delete(k); count++; } return { rowCount: count, rows: [] }; }
    throw new Error('Unexpected SQL: ' + sql);
  } };
}

test('social OAuth reports providers unconfigured without secrets and never reports connected', async () => {
  const old = { META_APP_ID: process.env.META_APP_ID, META_APP_SECRET: process.env.META_APP_SECRET, X_CLIENT_ID: process.env.X_CLIENT_ID, X_CLIENT_SECRET: process.env.X_CLIENT_SECRET, TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET };
  for (const key of Object.keys(old)) delete process.env[key];
  try {
    const oauth = socialOAuthService(memoryDb());
    for (const provider of ['facebook','instagram','x','tiktok']) {
      const status = await oauth.status(provider);
      assert.equal(status.configured, false);
      assert.equal(status.connected, false);
    }
    await assert.rejects(() => oauth.start('x'), /Add the X_CLIENT_ID/);
  } finally { for (const [key,value] of Object.entries(old)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});

test('social OAuth creates provider-scoped authorization URLs with state and PKCE', async () => {
  const old = { X_CLIENT_ID: process.env.X_CLIENT_ID, X_CLIENT_SECRET: process.env.X_CLIENT_SECRET };
  process.env.X_CLIENT_ID = 'x-test-client'; process.env.X_CLIENT_SECRET = 'x-test-secret';
  try {
    const oauth = socialOAuthService(memoryDb());
    const url = new URL(await oauth.start('x'));
    assert.equal(url.origin, 'https://twitter.com');
    assert.equal(url.pathname, '/i/oauth2/authorize');
    assert.equal(url.searchParams.get('client_id'), 'x-test-client');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(url.searchParams.get('code_challenge'));
    assert.ok(url.searchParams.get('state'));
    assert.ok(url.searchParams.get('scope').includes('tweet.write'));
  } finally { if (old.X_CLIENT_ID === undefined) delete process.env.X_CLIENT_ID; else process.env.X_CLIENT_ID=old.X_CLIENT_ID; if (old.X_CLIENT_SECRET === undefined) delete process.env.X_CLIENT_SECRET; else process.env.X_CLIENT_SECRET=old.X_CLIENT_SECRET; }
});

test('Instagram uses Unified Login configuration for newer Meta apps', async () => {
  const keys = ['META_APP_ID', 'META_APP_SECRET', 'META_LOGIN_CONFIG_ID', 'META_INSTAGRAM_LOGIN_CONFIG_ID', 'META_FACEBOOK_LOGIN_CONFIG_ID'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.META_APP_ID = 'meta-test-client';
  process.env.META_APP_SECRET = 'meta-test-secret';
  process.env.META_INSTAGRAM_LOGIN_CONFIG_ID = '29641980198772563';
  delete process.env.META_LOGIN_CONFIG_ID;
  try {
    const oauth = socialOAuthService(memoryDb());
    const instagram = new URL(await oauth.start('instagram'));
    assert.equal(instagram.origin, 'https://www.facebook.com');
    assert.equal(instagram.pathname, '/v27.0/dialog/oauth');
    assert.equal(instagram.searchParams.get('client_id'), 'meta-test-client');
    assert.equal(instagram.searchParams.get('config_id'), '29641980198772563');
    assert.equal(instagram.searchParams.has('scope'), false);
    assert.ok(instagram.searchParams.get('redirect_uri').endsWith('/api/integrations/instagram/callback'));
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Instagram keeps legacy direct login when no Unified Login configuration exists', async () => {
  const keys = ['META_APP_ID', 'META_APP_SECRET', 'META_LOGIN_CONFIG_ID', 'META_INSTAGRAM_LOGIN_CONFIG_ID'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.META_APP_ID = 'meta-test-client';
  process.env.META_APP_SECRET = 'meta-test-secret';
  delete process.env.META_LOGIN_CONFIG_ID;
  delete process.env.META_INSTAGRAM_LOGIN_CONFIG_ID;
  try {
    const oauth = socialOAuthService(memoryDb());
    const instagram = new URL(await oauth.start('instagram'));
    assert.equal(instagram.origin, 'https://www.instagram.com');
    assert.equal(instagram.pathname, '/oauth/authorize');
    assert.equal(instagram.searchParams.get('scope'), 'instagram_business_basic,instagram_business_content_publish');
    assert.equal(instagram.searchParams.has('config_id'), false);
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Facebook still requires its own Pages Login configuration', async () => {
  const keys = ['META_APP_ID', 'META_APP_SECRET', 'META_LOGIN_CONFIG_ID', 'META_FACEBOOK_LOGIN_CONFIG_ID'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.META_APP_ID = 'meta-test-client';
  process.env.META_APP_SECRET = 'meta-test-secret';
  process.env.META_FACEBOOK_LOGIN_CONFIG_ID = 'facebook-pages-config';
  try {
    const oauth = socialOAuthService(memoryDb());
    const facebook = new URL(await oauth.start('facebook'));
    assert.equal(facebook.searchParams.get('config_id'), 'facebook-pages-config');
    assert.ok(facebook.searchParams.get('redirect_uri').endsWith('/api/integrations/facebook/callback'));
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Facebook refuses to reuse the Instagram-only configuration when no Pages configuration exists', async () => {
  const keys = ['META_APP_ID', 'META_APP_SECRET', 'META_LOGIN_CONFIG_ID', 'META_FACEBOOK_LOGIN_CONFIG_ID', 'META_INSTAGRAM_LOGIN_CONFIG_ID'];
  const old = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.META_APP_ID = 'meta-test-client';
  process.env.META_APP_SECRET = 'meta-test-secret';
  process.env.META_LOGIN_CONFIG_ID = '29641980198772563';
  delete process.env.META_FACEBOOK_LOGIN_CONFIG_ID;
  try {
    const oauth = socialOAuthService(memoryDb());
    await assert.rejects(() => oauth.start('facebook'), /Facebook Login for Business configuration/);
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
