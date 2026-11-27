import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptOAuthToken, decryptOAuthToken, oauthSecurity } from '../server/services/oauth-security.js';

const secret = 'oauth-test-secret-with-more-than-thirty-two-characters';
function memoryDb() {
  const rows = new Map();
  return {
    rows,
    async query(sql, params = []) {
      if (sql.startsWith('INSERT INTO site_settings')) {
        rows.set(params[0], params[1]);
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('SELECT value FROM site_settings')) {
        return { rowCount: rows.has(params[0]) ? 1 : 0, rows: rows.has(params[0]) ? [{ value: rows.get(params[0]) }] : [] };
      }
      if (sql.startsWith('DELETE FROM site_settings')) {
        const value = rows.get(params[0]);
        const existed = rows.delete(params[0]);
        return { rowCount: existed ? 1 : 0, rows: sql.includes('RETURNING value') && existed ? [{ value }] : [] };
      }
      throw new Error('Unexpected SQL: ' + sql);
    },
  };
}

test('OAuth tokens are encrypted, randomized and decrypt only with the original secret', () => {
  const first = encryptOAuthToken('access-token-value', secret);
  const second = encryptOAuthToken('access-token-value', secret);
  assert.notEqual(first, second);
  assert.notEqual(first, 'access-token-value');
  assert.equal(decryptOAuthToken(first, secret), 'access-token-value');
  assert.throws(() => decryptOAuthToken(first, secret + '-wrong'), /could not be decrypted/);
  const parts = first.split('.');
  parts[3] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => decryptOAuthToken(parts.join('.'), secret), /could not be decrypted/);
});

test('OAuth state is random, provider-scoped, expiring and single-use', async () => {
  let time = 1_800_000_000_000;
  const db = memoryDb();
  const oauth = oauthSecurity(db, { secret, clock: () => time });
  const state = await oauth.createState('facebook', { intent: 'connect' });
  assert.equal(typeof state, 'string');
  assert.equal(await oauth.consumeState('instagram', state), null);
  assert.deepEqual(await oauth.consumeState('facebook', state), { intent: 'connect' });
  assert.equal(await oauth.consumeState('facebook', state), null);

  const expired = await oauth.createState('x', { intent: 'connect' });
  time += 10 * 60 * 1000 + 1;
  assert.equal(await oauth.consumeState('x', expired), null);
});

test('OAuth state rejects malformed values and provider names', async () => {
  const oauth = oauthSecurity(memoryDb(), { secret });
  assert.equal(await oauth.consumeState('google', 'short'), null);
  await assert.rejects(() => oauth.createState('../google'), /Invalid OAuth provider/);
});

test('OAuth state can be consumed by only one concurrent callback', async () => {
  const db = memoryDb();
  const oauth = oauthSecurity(db, { secret });
  const state = await oauth.createState('facebook', { intent: 'connect' });
  const results = await Promise.all([
    oauth.consumeState('facebook', state),
    oauth.consumeState('facebook', state),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
});
