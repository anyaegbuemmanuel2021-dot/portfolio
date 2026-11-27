import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
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

test('Google identity accepts a correctly signed token with matching audience, nonce and verified owner email', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', kid: 'unit-test-key' });
  const payload = encode({ iss: 'https://accounts.google.com', aud: 'web-client-id', sub: 'google-subject', email: 'owner@example.com', email_verified: true, name: 'Portfolio Owner', nonce: 'expected-login-nonce', iat: now, exp: now + 300 });
  const signingInput = header + '.' + payload;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  const token = signingInput + '.' + signature;
  const identity = await verifyGoogleIdToken(token, {
    clientId: 'web-client-id', nonce: 'expected-login-nonce',
    fetcher: async () => ({ ok: true, headers: { get: () => 'public, max-age=300' }, json: async () => ({ keys: [{ kid: 'unit-test-key', kty: 'RSA', n: jwk.n, e: jwk.e }] }) }),
  });
  assert.deepEqual(identity, { sub: 'google-subject', email: 'owner@example.com', name: 'Portfolio Owner' });
});
