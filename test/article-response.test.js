import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'sqlite::memory:';
process.env.AUTH_SECRET = 'article-diagnostic-secret-12345678901234567890';
process.env.SITE_URL = 'http://localhost';
process.env.TRUST_PROXY = 'false';

const { buildApp } = await import('../server/index.js');
const { authService } = await import('../server/services/auth.js');
const { app, db } = await buildApp();
const server = app.server().listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

test('article creation returns the created article payload', async () => {
  try {
    await authService(db, { real: false }).bootstrap({
      email: 'article-owner@example.com',
      password: 'Strong-Article-Password-1',
      name: 'Article Owner'
    });
    const loginResponse = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'article-owner@example.com', password: 'Strong-Article-Password-1' })
    });
    const login = await loginResponse.json();
    const cookie = loginResponse.headers.get('set-cookie').split(';')[0];
    const response = await fetch(base + '/api/admin/articles', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
        'x-csrf-token': login.data.csrf
      },
      body: JSON.stringify({ title: 'Diagnostic Article', content_md: 'A short article body', tags: [] })
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    assert.equal(body.data?.slug, 'diagnostic-article', JSON.stringify(body));
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.close();
  }
});
