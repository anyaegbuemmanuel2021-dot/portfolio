// Versioned migrations: server/migrations/NNN_name.sql, tracked in migration_history with checksums.
import { readdirSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('./migrations/', import.meta.url));
export const listMigrations = () => readdirSync(dir).filter(f => /^\d+_.+\.sql$/.test(f)).sort().map(f => { const sql = readFileSync(dir + f, 'utf8'); return { version: f.split('_')[0], name: f, sql, checksum: createHash('sha256').update(sql).digest('hex') }; });

export async function migrationStatus(db) {
  await db.exec('CREATE TABLE IF NOT EXISTS migration_history (id UUID PRIMARY KEY, version TEXT NOT NULL UNIQUE, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL)');
  const applied = (await db.query('SELECT version, name, checksum, applied_at FROM migration_history ORDER BY version')).rows;
  const all = listMigrations(); const seen = new Map(applied.map(a => [a.version, a]));
  return { applied, pending: all.filter(m => !seen.has(m.version)), drift: all.filter(m => seen.has(m.version) && seen.get(m.version).checksum !== m.checksum).map(m => m.name) };
}
export async function migrate(db, log = console.log) {
  const st = await migrationStatus(db); if (st.drift.length) throw new Error('Migration checksum drift: ' + st.drift.join(', '));
  for (const m of st.pending) {
    await db.tx(async t => {
      for (const stmt of m.sql.split(/;\s*\n/).map(s => s.replace(/^(\s*--.*\n)+/g, '').trim()).filter(Boolean)) {
        // SQLite does not support PostgreSQL's ADD COLUMN IF NOT EXISTS syntax.
        const addColumn = t.dialect === 'sqlite' && stmt.match(/^ALTER TABLE\s+([a-z_][a-z0-9_]*)\s+ADD COLUMN IF NOT EXISTS\s+([a-z_][a-z0-9_]*\s+.+)$/i);
        if (addColumn) {
          const columns = (await t.query('PRAGMA table_info(' + addColumn[1] + ')')).rows;
          if (!columns.some(column => column.name === addColumn[2].split(/\s+/, 1)[0])) {
            await t.exec('ALTER TABLE ' + addColumn[1] + ' ADD COLUMN ' + addColumn[2]);
          }
        } else if (t.dialect === 'sqlite' && /^ALTER TABLE\s+[a-z_][a-z0-9_]*\s+ALTER COLUMN\s+/i.test(stmt)) {
          // SQLite cannot change a column's default or NOT NULL constraint in place.
          // The author value is still assigned by the application on every article save.
        } else await t.exec(stmt);
      }
      await t.query('INSERT INTO migration_history (id, version, name, checksum, applied_at) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), m.version, m.name, m.checksum, new Date().toISOString()]);
    });
    log('applied ' + m.name);
  }
  return st.pending.map(m => m.name);
}
