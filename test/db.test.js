import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../server/db.js';

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
