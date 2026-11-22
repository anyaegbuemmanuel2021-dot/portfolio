import test from 'node:test';
import assert from 'node:assert/strict';
import { connect, normalizePgSslMode } from '../server/db.js';
import { tableRepo } from '../server/repositories/base.js';

test('SQLite adapter maps PostgreSQL numbered placeholders in occurrence order', async () => {
  const db = await connect('sqlite::memory:');
  try {
    const result = await db.query('SELECT $2 AS second, $1 AS first, $2 AS repeated', ['alpha', 'beta']);
    assert.deepEqual(result.rows[0], { second: 'beta', first: 'alpha', repeated: 'beta' });
    await db.query('CREATE TABLE sample (id TEXT PRIMARY KEY, active INTEGER)');
    await db.query('INSERT INTO sample (id, active) VALUES ($1, $2)', ['x', true]);
    assert.equal((await db.query('SELECT active FROM sample WHERE id = $1', ['x'])).rows[0].active, 1);
  } finally { await db.close(); }
});


test('SQLite transaction handle is distinct so repositories do not open nested transactions', async () => {
  const db = await connect('sqlite::memory:');
  try {
    await db.query('CREATE TABLE sample_items (id TEXT PRIMARY KEY, title TEXT NOT NULL UNIQUE, created_at TEXT, updated_at TEXT)');
    const repo = tableRepo(db, 'sample_items', ['title'], { order: 'created_at ASC' });
    await db.tx(async tx => {
      assert.notEqual(tx, db);
      const row = await repo.create({ title: 'Created inside outer transaction' }, tx);
      assert.equal(row.title, 'Created inside outer transaction');
    });
    assert.equal((await db.query('SELECT COUNT(*) AS c FROM sample_items')).rows[0].c, 1);
  } finally { await db.close(); }
});


test('legacy PostgreSQL SSL modes are normalized to explicit full certificate verification', () => {
  const base = 'postgres://user:pass@db.example.com:5432/portfolio';
  for (const mode of ['prefer', 'require', 'verify-ca']) {
    const parsed = new URL(normalizePgSslMode(base + '?sslmode=' + mode));
    assert.equal(parsed.searchParams.get('sslmode'), 'verify-full');
  }
  assert.equal(new URL(normalizePgSslMode(base + '?sslmode=disable')).searchParams.get('sslmode'), 'disable');
  assert.equal(new URL(normalizePgSslMode(base)).searchParams.has('sslmode'), false);
});
