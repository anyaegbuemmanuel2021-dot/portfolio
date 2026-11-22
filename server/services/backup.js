// Provider-independent JSON export/import. Works against any target PostgreSQL (or the SQLite test adapter).
import { randomUUID, createHash } from 'node:crypto';
import { migrate, listMigrations } from '../migrate.js';
export const TABLE_ORDER = ['roles', 'permissions', 'role_permissions', 'admins', 'admin_role_assignments', 'site_settings', 'homepage_sections', 'biography', 'services', 'projects', 'project_images', 'skills', 'experience', 'testimonials', 'social_links', 'navigation_items', 'content_revisions', 'article_categories', 'article_tags', 'articles', 'article_tag_assignments', 'article_images', 'article_revisions', 'article_comments', 'media_folders', 'media_files', 'media_metadata', 'media_usage_references', 'contacts', 'lead_sources', 'leads', 'lead_activities', 'conversations', 'contact_messages', 'follow_up_records', 'email_templates', 'email_contacts', 'email_subscribers', 'email_campaigns', 'email_conversations', 'email_messages', 'email_delivery_logs', 'email_saved_replies', 'advertisers', 'ad_placements', 'ad_campaigns', 'advertisements', 'ad_impressions', 'ad_clicks', 'ad_network_settings', 'analytics_events', 'page_views', 'project_views', 'article_views', 'conversion_events', 'traffic_sources', 'system_settings', 'backup_history', 'notification_settings', 'audit_logs'];
// Intentionally excluded: sessions, password_reset_requests, security_events, application_logs, migration_history (re-created on target).
const FORMAT = 'portfolio-backup';
export const isSafeBackupColumn = value => typeof value === 'string' && /^[a-z_][a-z0-9_]*$/i.test(value);
export async function exportAll(db, { only } = {}) {
  const tables = {}, counts = {}; for (const t of TABLE_ORDER) { if (only && !only.includes(t)) continue; const rows = (await db.query(`SELECT * FROM ${t}`)).rows; tables[t] = rows; counts[t] = rows.length; }
  const mig = listMigrations(); const body = { format: FORMAT, version: 1, created_at: new Date().toISOString(), schema_version: mig[mig.length - 1]?.version, counts, tables };
  const json = JSON.stringify(body); return { json, checksum: createHash('sha256').update(json).digest('hex'), counts, size: Buffer.byteLength(json) };
}
export async function importAll(target, json, { force = false } = {}) {
  const report = { steps: [], errors: [], counts: {}, ok: false }; const step = s => report.steps.push(s);
  let data; try { data = typeof json === 'string' ? JSON.parse(json) : json; } catch { report.errors.push('File is not valid JSON'); return report; }
  if (data.format !== FORMAT || !data.tables || typeof data.tables !== 'object' || Array.isArray(data.tables)) { report.errors.push('Not a portfolio-backup file'); return report; }
  // Table names are fixed by TABLE_ORDER. Validate every imported column name
  // before constructing SQL; parameter placeholders cannot bind identifiers.
  for (const table of TABLE_ORDER) {
    const rows = data.tables[table] ?? [];
    if (!Array.isArray(rows)) { report.errors.push(`Invalid rows for table: ${table}`); return report; }
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) { report.errors.push(`Invalid record in table: ${table}`); return report; }
      const columns = Object.keys(row);
      if (!columns.length || columns.some(key => !isSafeBackupColumn(key))) { report.errors.push(`Invalid column name in table: ${table}`); return report; }
    }
  }
  step('1. Target database reachable'); await target.query('SELECT 1');
  step('2. Applying migrations on target'); const applied = await migrate(target, () => {}); step(`   applied: ${applied.join(', ') || 'none (already current)'}`);
  const latest = listMigrations().at(-1)?.version; if (data.schema_version > latest) { report.errors.push(`Backup schema ${data.schema_version} is newer than this app (${latest}). Upgrade the app first.`); return report; }
  step('3. Checking target is empty'); const existing = Number((await target.query('SELECT COUNT(*) AS c FROM admins')).rows[0].c) + Number((await target.query('SELECT COUNT(*) AS c FROM articles')).rows[0].c);
  if (existing && !force) { report.errors.push('Target already contains data. Re-run with force to replace it (destructive).'); return report; }
  try {
    await target.tx(async tx => {
      if (existing) for (const t of [...TABLE_ORDER].reverse()) await tx.query(`DELETE FROM ${t}`);
      step('4. Importing records (foreign-key order)');
      for (const t of TABLE_ORDER) { const rows = data.tables[t] || []; for (const r of rows) { const k = Object.keys(r); await tx.query(`INSERT INTO ${t} (${k.join(',')}) VALUES (${k.map((_, i) => '$' + (i + 1)).join(',')})`, k.map(c => r[c])); } report.counts[t] = rows.length; }
    });
  } catch (e) { report.errors.push('Import rolled back: ' + e.message); return report; }
  step('5. Verifying record counts'); for (const t of TABLE_ORDER) { const c = Number((await target.query(`SELECT COUNT(*) AS c FROM ${t}`)).rows[0].c); if (c !== (data.tables[t] || []).length) report.errors.push(`${t}: expected ${(data.tables[t] || []).length}, found ${c}`); }
  report.ok = !report.errors.length; step(report.ok ? '6. Done — counts match' : '6. Finished with errors'); return report;
}
export const recordBackup = (db, o) => db.query('INSERT INTO backup_history (id,kind,status,size_bytes,location,checksum,verified_at,notes,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [randomUUID(), o.kind, o.status, o.size || null, o.location || null, o.checksum || null, o.verified ? new Date().toISOString() : null, o.notes || null, o.adminId || null, new Date().toISOString()]);
