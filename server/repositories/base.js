// Generic table repository: portable SQL only ($n params, no provider-specific features).
import { randomUUID } from 'node:crypto';
import { HttpError } from '../lib/validate.js';
const now = () => new Date().toISOString();
export const fixRow = r => { if (!r) return r; for (const k of Object.keys(r)) if (/^is_/.test(k)) r[k] = !!r[k]; return r; };

function nameColumn(cols, data) {
  return ['name', 'title'].find(k => cols.includes(k) && data[k] != null && String(data[k]).trim());
}
async function lockName(tx, table, column, value) {
  if (tx.dialect === 'postgres') {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [table + ':' + column + ':' + String(value).trim().toLowerCase()]);
  }
}
export function tableRepo(db, table, cols, { order = 'sort_order ASC, created_at ASC', searchCols = [], timestamps = true } = {}) {
  const repo = {
    table, cols,
    async list({ publishedOnly = false, search, limit = 100, offset = 0, where = [], params = [] } = {}) {
      const w = [...where], p = [...params];
      if (publishedOnly && cols.includes('is_published')) w.push('is_published = TRUE');
      if (search && searchCols.length) { p.push('%' + search + '%'); w.push('(' + searchCols.map(c => `${c} ILIKE $${p.length}`).join(' OR ') + ')'); }
      const clause = w.length ? ' WHERE ' + w.join(' AND ') : '';
      const total = Number((await db.query(`SELECT COUNT(*) AS c FROM ${table}${clause}`, p)).rows[0].c);
      const rows = (await db.query(`SELECT * FROM ${table}${clause} ORDER BY ${order} LIMIT ${Math.min(Math.max(Math.floor(+limit) || 100, 1), 500)} OFFSET ${Math.max(Math.floor(+offset) || 0, 0)}`, p)).rows.map(fixRow);
      return { rows, total };
    },
    async get(id) { return fixRow((await db.query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0]); },
    async create(data, qdb = db) {
      const work = async tx => {
        const column = nameColumn(cols, data);
        if (column) {
          await lockName(tx, table, column, data[column]);
          const duplicate = (await tx.query(`SELECT id FROM ${table} WHERE lower(trim(${column})) = lower(trim($1)) LIMIT 1`, [String(data[column]).trim()])).rows[0];
          if (duplicate) throw new HttpError(409, 'Name already exists', { field: column });
        }
        const id = randomUUID(), t = now(), stamp = timestamps === 'created' ? { created_at: t } : timestamps ? { created_at: t, updated_at: t } : {}, row = { id, ...data, ...stamp };
        const keys = Object.keys(row);
        const sql = 'INSERT INTO ' + table + ' (' + keys.join(',') + ') VALUES (' + keys.map((_, i) => '$' + (i + 1)).join(',') + ')';
        await tx.query(sql, keys.map(k => row[k]));
        return fixRow((await tx.query('SELECT * FROM ' + table + ' WHERE id = $1', [id])).rows[0]);
      };
      return qdb === db ? db.tx(work) : work(qdb);
    },
    async update(id, data, qdb = db) {
      const work = async tx => {
        const row = { ...data, ...(timestamps === true ? { updated_at: now() } : {}) };
        const keys = Object.keys(row).filter(k => cols.includes(k) || k === 'updated_at');
        const column = nameColumn(cols, row);
        if (column) {
          await lockName(tx, table, column, row[column]);
          const duplicate = (await tx.query(`SELECT id FROM ${table} WHERE lower(trim(${column})) = lower(trim($1)) AND id <> $2 LIMIT 1`, [String(row[column]).trim(), id])).rows[0];
          if (duplicate) throw new HttpError(409, 'Name already exists', { field: column });
        }
        if (!keys.length) return fixRow((await tx.query('SELECT * FROM ' + table + ' WHERE id = $1', [id])).rows[0]);
        const assignments = keys.map((k, i) => k + ' = $' + (i + 1)).join(', ');
        await tx.query('UPDATE ' + table + ' SET ' + assignments + ' WHERE id = $' + (keys.length + 1), [...keys.map(k => row[k]), id]);
        return fixRow((await tx.query('SELECT * FROM ' + table + ' WHERE id = $1', [id])).rows[0]);
      };
      return qdb === db ? db.tx(work) : work(qdb);
    },
    async remove(id) { return (await db.query(`DELETE FROM ${table} WHERE id = $1`, [id])).rowCount > 0; },
    async reorder(ids) { await db.tx(async t => { for (let i = 0; i < ids.length; i++) await t.query(`UPDATE ${table} SET sort_order = $1 WHERE id = $2`, [i, ids[i]]); }); },
  };
  return repo;
}
export const kv = (db, table) => ({
  async all() { return Object.fromEntries((await db.query(`SELECT key, value FROM ${table}`)).rows.map(r => [r.key, r.value])); },
  async get(key) { return (await db.query(`SELECT value FROM ${table} WHERE key = $1`, [key])).rows[0]?.value ?? null; },
  async set(key, value) { await db.query(`INSERT INTO ${table} (key, value, updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`, [key, value == null ? null : String(value), now()]); },
});
export { now };
