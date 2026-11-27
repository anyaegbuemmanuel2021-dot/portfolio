import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyGoogleIdToken } from '../server/services/google-identity.js';

test('Google identity rejects missing client configuration and malformed credentials', async () => {
  await assert.rejects(() => verifyGoogleIdToken('not-a-jwt', { clientId: '' }), /Invalid Google sign-in credential/);
  await assert.rejects(() => verifyGoogleIdToken('not-a-jwt', { clientId: 'web-client-id' }), /Invalid Google sign-in credential/);
});

test('Google identity rejects unsigned and non-RS256 tokens before key lookup', async () => {
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = b64({ alg: 'none', kid: 'test' }) + '.' + b64({ iss: 'accounts.google.com', aud: 'web-client-id' }) + '.c2ln';
  await assert.rejects(() => verifyGoogleIdToken(token, { clientId: 'web-client-id', fetcher: async () => { throw new Error('must not fetch keys'); } }), /Unsupported Google sign-in credential/);
});

test('Google identity rejects credentials with malformed JWT structure', async () => {
  await assert.rejects(() => verifyGoogleIdToken('a.b.c.d', { clientId: 'web-client-id' }), /Invalid Google sign-in credential/);
});
