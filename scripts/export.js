// Usage: npm run export [-- out.json]   (SOURCE = DATABASE_URL). Prints checksum; keep the file somewhere private.
import '../server/config.js'; import { writeFileSync } from 'node:fs'; import { connect } from '../server/db.js'; import { exportAll } from '../server/services/backup.js';
const out = process.argv[2] || `backup-${new Date().toISOString().slice(0, 10)}.json`; const db = await connect(); const x = await exportAll(db); writeFileSync(out, x.json, { mode: 0o600 });
console.log(`Wrote ${out} (${x.size} bytes) sha256=${x.checksum}`); console.log(x.counts); await db.close();
