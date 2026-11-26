import test from 'node:test';
import assert from 'node:assert/strict';
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123';
const { buildLinkedInPost, encryptLinkedInToken, decryptLinkedInToken, linkedinService } = await import('../server/services/linkedin.js');

test('LinkedIn post payload publishes as the authenticated personal member', () => {
  const payload = buildLinkedInPost('urn:li:person:abc123', 'New article\n\nRead more: https://example.com/article', { source: 'https://example.com/article', title: 'New article', description: 'An article summary' });
  assert.equal(payload.author, 'urn:li:person:abc123');
  assert.equal(payload.commentary, 'New article\n\nRead more: https://example.com/article');
  assert.equal(payload.visibility, 'PUBLIC');
  assert.equal(payload.lifecycleState, 'PUBLISHED');
  assert.equal(payload.distribution.feedDistribution, 'MAIN_FEED');
  assert.deepEqual(payload.distribution.targetEntities, []);
  assert.deepEqual(payload.content.article, { source: 'https://example.com/article', title: 'New article', description: 'An article summary' });
});

test('LinkedIn access tokens are encrypted and can be decrypted only with the same secret', () => {
  const encrypted = encryptLinkedInToken('access-token-value', process.env.AUTH_SECRET);
  assert.notEqual(encrypted, 'access-token-value');
  assert.equal(decryptLinkedInToken(encrypted, process.env.AUTH_SECRET), 'access-token-value');
  assert.throws(() => decryptLinkedInToken(encrypted, 'a-different-secret-that-is-long-enough'), /decrypt/i);
});

test('newly public LinkedIn outbox items publish once and retain the returned permalink', async () => {
  const { socialService } = await import('../server/services/social.js');
  const row = { id: 'post-1', caption: 'Article and link', status: 'draft', link_url: 'https://example.com/article', article_title: 'Example article', article_excerpt: 'An excerpt' };
  let calls = 0;
  const db = { query: async sql => {
    if (sql.startsWith('SELECT s.id,s.caption,s.status,s.link_url')) return { rows: [{ ...row }], rowCount: 1 };
    if (sql.includes("SET status='publishing'")) { if (!['draft','approved','failed'].includes(row.status)) return { rows: [], rowCount: 0 }; row.status = 'publishing'; return { rows: [{ id: row.id }], rowCount: 1 }; }
    if (sql.includes("SET status='published'")) { row.status = 'published'; row.published_url = 'https://www.linkedin.com/feed/update/urn:li:share:123/'; return { rows: [], rowCount: 1 }; }
    throw new Error('Unexpected SQL: ' + sql);
  } };
  const linkedin = { status: async () => ({ connected: true, auto_post_enabled: true }), publishPost: async () => { calls++; return { post_urn: 'urn:li:share:123', published_url: 'https://www.linkedin.com/feed/update/urn:li:share:123/' }; } };
  const social = socialService(db, { linkedin });
  const first = await social.publishLinkedinArticle('article-1');
  const second = await social.publishLinkedinArticle('article-1');
  assert.equal(first.status, 'published');
  assert.equal(second.skipped, true);
  assert.equal(row.status, 'published');
  assert.equal(calls, 1);
});

test('LinkedIn drafts are left untouched when automatic posting is paused', async () => {
  const { socialService } = await import('../server/services/social.js');
  let calls = 0;
  const row = { id: 'post-2', caption: 'Draft', status: 'draft' };
  const db = { query: async sql => {
    if (sql.startsWith('SELECT id,caption,status')) return { rows: [{ ...row }], rowCount: 1 };
    throw new Error('No write expected while auto-post is paused');
  } };
  const linkedin = { status: async () => ({ connected: true, auto_post_enabled: false }), publishPost: async () => { calls++; } };
  const result = await socialService(db, { linkedin }).publishLinkedinArticle('article-2');
  assert.equal(result.skipped, true);
  assert.equal(row.status, 'draft');
  assert.equal(calls, 0);
});

test('LinkedIn OAuth state and credentials use the portfolio site_settings table', async () => {
  const statements = [];
  const values = new Map();
  const db = { query: async (sql, params = []) => {
    statements.push(sql);
    if (sql.startsWith('SELECT value FROM site_settings')) return { rows: values.has(params[0]) ? [{ value: values.get(params[0]) }] : [] };
    if (sql.startsWith('INSERT INTO site_settings')) { values.set(params[0], params[1]); return { rows: [], rowCount: 1 }; }
    if (sql.startsWith('DELETE FROM site_settings')) { values.delete(params[0]); return { rows: [], rowCount: 1 }; }
    throw new Error('Unexpected SQL: ' + sql);
  } };
  const previousId = process.env.LINKEDIN_CLIENT_ID, previousSecret = process.env.LINKEDIN_CLIENT_SECRET;
  process.env.LINKEDIN_CLIENT_ID = 'test-client-id';
  process.env.LINKEDIN_CLIENT_SECRET = 'test-client-secret';
  try {
    const service = linkedinService(db);
    const authorizationUrl = new URL(await service.beginAuthorization());
    assert.equal(authorizationUrl.origin, 'https://www.linkedin.com');
    assert.equal(authorizationUrl.pathname, '/oauth/v2/authorization');
    assert.equal(authorizationUrl.searchParams.get('client_id'), 'test-client-id');
    assert.equal(authorizationUrl.searchParams.get('scope'), 'openid profile w_member_social');
    assert.ok(values.has('linkedin_oauth_state'));
    const status = await service.status();
    assert.equal(status.configured, true);
    assert.equal(status.connected, false);
    assert.ok(statements.every(sql => sql.includes('site_settings')));
  } finally {
    if (previousId === undefined) delete process.env.LINKEDIN_CLIENT_ID; else process.env.LINKEDIN_CLIENT_ID = previousId;
    if (previousSecret === undefined) delete process.env.LINKEDIN_CLIENT_SECRET; else process.env.LINKEDIN_CLIENT_SECRET = previousSecret;
  }
});
