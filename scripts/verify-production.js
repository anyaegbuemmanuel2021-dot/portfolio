// Non-destructive production preflight. Requires real provider credentials in .env or environment.
import { randomUUID } from 'node:crypto';
import { connect } from '../server/db.js';
import { config } from '../server/config.js';
import { migrationStatus } from '../server/migrate.js';
import { createStorage } from '../server/providers/storage.js';
import { createMailer } from '../server/providers/mail.js';

const report = [];
let db;
try {
  if (/^sqlite:/.test(config.databaseUrl)) throw new Error('DATABASE_URL must point to PostgreSQL for this production check.');
  db = await connect();
  await db.query('SELECT 1 AS connected');
  const status = await migrationStatus(db);
  report.push({ check: 'PostgreSQL connection', status: 'PASS' });
  report.push({ check: 'Database migrations', status: status.pending.length ? 'PENDING' : 'PASS', detail: status.pending.map(x => x.name).join(', ') || `${status.applied.length} applied` });
  if (status.drift.length) report.push({ check: 'Migration checksums', status: 'FAIL', detail: status.drift.join(', ') });
} catch (e) { report.push({ check: 'PostgreSQL', status: 'FAIL', detail: e.message }); }
finally { if (db) await db.close(); }

try {
  if (config.storage.provider !== 'dbrij') throw new Error('STORAGE_PROVIDER is not set to dbrij.');
  const storage = createStorage('dbrij'); const key = `health-check/${randomUUID()}.txt`; const bytes = Buffer.from('portfolio-platform-dbrij-check');
  await storage.put(key, bytes, 'text/plain'); const fetched = await storage.get(key);
  if (!fetched.equals(bytes)) throw new Error('Dbrij read-back did not match uploaded bytes.');
  await storage.remove(key); report.push({ check: 'Dbrij S3 put/get/delete', status: 'PASS' });
} catch (e) { report.push({ check: 'Dbrij S3 storage', status: 'FAIL', detail: e.message }); }

try {
  const mailer = createMailer();
  report.push({ check: 'Email provider configuration', status: mailer.real ? 'READY' : 'NOT CONFIGURED', detail: mailer.name === 'log' ? 'Log provider does not deliver email.' : 'Credentials loaded; no email was sent by this preflight.' });
} catch (e) { report.push({ check: 'Email provider configuration', status: 'FAIL', detail: e.message }); }

for (const item of report) console.log(`${item.status.padEnd(14)} ${item.check}${item.detail ? ` — ${item.detail}` : ''}`);
const failed = report.some(x => x.status === 'FAIL' || x.status === 'PENDING');
process.exitCode = failed ? 1 : 0;
