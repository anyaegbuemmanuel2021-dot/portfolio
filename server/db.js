// Database connection layer. PostgreSQL (via `pg`) in production; SQLite (node:sqlite) only for local tests/dev.
// Everything else in the app talks to `db.query(sql, params)` with portable $1,$2 SQL.
import { config } from './config.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const normalize = v => v === undefined ? null : v instanceof Date ? v.toISOString() : typeof v === 'boolean' ? (v ? 1 : 0) : v;

async function createSqlite(url) {
  const { DatabaseSync } = await import('node:sqlite');
  const file = url.replace(/^sqlite:/, '');
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const raw = new DatabaseSync(file); raw.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  const run = (sql, params = []) => {
    const ordered = [...sql.matchAll(/\$(\d+)/g)].map(m => params[Number(m[1]) - 1]);
    const s = sql.replace(/\$\d+/g, '?').replace(/\bILIKE\b/gi, 'LIKE');
    const st = raw.prepare(s); const p = (ordered.length ? ordered : params).map(normalize);
    if (/^\s*(select|with)/i.test(s) || /\breturning\b/i.test(s)) { const rows = st.all(...p); return { rows: rows.map(r => ({ ...r })), rowCount: rows.length }; }
    const r = st.run(...p); return { rows: [], rowCount: Number(r.changes) };
  };
  const api = { dialect: 'sqlite', query: async (s, p) => run(s, p), exec: async s => { raw.exec(s); },
    tx: async fn => { raw.exec('BEGIN'); const tx = { dialect: 'sqlite', query: async (s, p) => run(s, p), exec: async s => { raw.exec(s); } }; try { const r = await fn(tx); raw.exec('COMMIT'); return r; } catch (e) { raw.exec('ROLLBACK'); throw e; } },
    close: async () => raw.close() };
  return api;
}

export function normalizePgSslMode(url) {
  const parsed = new URL(url);
  const mode = parsed.searchParams.get('sslmode');
  // pg-connection-string currently treats these legacy modes as verify-full;
  // make that intent explicit before the next major version changes semantics.
  if (['prefer', 'require', 'verify-ca'].includes(mode)) parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
}

async function createPg(url) {
  let pg; try { pg = (await import('pg')).default; } catch { throw new Error('The "pg" package is not installed. Run: npm install'); }
  const connectionString = normalizePgSslMode(url);
  const pool = new pg.Pool({ connectionString, max: Number(process.env.DB_POOL_MAX || 5), ssl: /sslmode=disable/.test(connectionString) || /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: true } });
  const wrap = c => ({ dialect: 'postgres', query: (s, p) => c.query(s, (p || []).map(v => v === undefined ? null : v)), exec: s => c.query(s) });
  const api = { ...wrap(pool), tx: async fn => { const c = await pool.connect(); try { await c.query('BEGIN'); const r = await fn(wrap(c)); await c.query('COMMIT'); return r; } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } }, close: () => pool.end() };
  return api;
}

export async function connect(url = config.databaseUrl) {
  return /^sqlite:/.test(url) ? createSqlite(url) : createPg(url);
}
export const n = v => Number(v || 0);
