import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123';
const { buildLinkedInPost, encryptLinkedInToken, decryptLinkedInToken } = await import('../server/services/linkedin.js');

test('LinkedIn post payload publishes as the authenticated personal member', () => {
  const payload = buildLinkedInPost('urn:li:person:abc123', 'New article\n\nRead more: https://example.com/article');
  assert.equal(payload.author, 'urn:li:person:abc123');
  assert.equal(payload.commentary, 'New article\n\nRead more: https://example.com/article');
  assert.equal(payload.visibility, 'PUBLIC');
  assert.equal(payload.lifecycleState, 'PUBLISHED');
  assert.equal(payload.distribution.feedDistribution, 'MAIN_FEED');
  assert.deepEqual(payload.distribution.targetEntities, []);
});

test('LinkedIn access tokens are encrypted and can be decrypted only with the same secret', () => {
  const encrypted = encryptLinkedInToken('access-token-value', process.env.AUTH_SECRET);
  assert.notEqual(encrypted, 'access-token-value');
  assert.equal(decryptLinkedInToken(encrypted, process.env.AUTH_SECRET), 'access-token-value');
  assert.throws(() => decryptLinkedInToken(encrypted, 'a-different-secret-that-is-long-enough'), /decrypt/i);
});
