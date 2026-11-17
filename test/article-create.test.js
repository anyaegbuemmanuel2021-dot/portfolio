import test from 'node:test';
import assert from 'node:assert/strict';
import { articleService } from '../server/services/articles.js';

test('creating an article checks its slug without comparing a UUID to an empty string', async () => {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT id FROM articles WHERE slug =')) return { rows: [] };
      if (sql.startsWith('SELECT * FROM articles WHERE id =')) {
        return { rows: [{ id: params[0], title: 'A new article', slug: 'a-new-article', status: 'draft', content_md: '', tags: [] }] };
      }
      return { rows: [], rowCount: 1 };
    },
    async tx(fn) { return fn(this); },
  };
  const service = articleService(db, { syncUsage: async () => {} });

  const article = await service.save(null, {
    title: 'A new article',
    content_md: '',
    tags: [],
    status: 'draft',
  }, 'admin-id');

  const slugCheck = calls.find(c => c.sql.startsWith('SELECT id FROM articles WHERE slug ='));
  assert.ok(slugCheck, 'slug uniqueness query should run');
  assert.equal(slugCheck.sql, 'SELECT id FROM articles WHERE slug = $1');
  assert.deepEqual(slugCheck.params, ['a-new-article']);
  assert.equal(article.title, 'A new article');
  assert.equal(article.status, 'draft');
});
