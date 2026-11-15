// Copy all media objects between storage providers and verify checksums.
// Usage: FROM_STORAGE=local TO_STORAGE=dbrij [DBRIJ_* env] npm run media-migrate   (reads media_files from DATABASE_URL)
import '../server/config.js'; import { createHash } from 'node:crypto'; import { connect } from '../server/db.js'; import { createStorage } from '../server/providers/storage.js';
const from = createStorage(process.env.FROM_STORAGE || 'local'), to = createStorage(process.env.TO_STORAGE || 'dbrij'); const db = await connect(); let ok = 0, bad = 0;
for (const m of (await db.query('SELECT id, storage_key, mime_type, checksum, variants FROM media_files')).rows) {
  try { const buf = await from.get(m.storage_key); if (m.checksum && createHash('sha256').update(buf).digest('hex') !== m.checksum) throw new Error('source checksum mismatch'); await to.put(m.storage_key, buf, m.mime_type);
    const back = await to.get(m.storage_key); if (createHash('sha256').update(back).digest('hex') !== createHash('sha256').update(buf).digest('hex')) throw new Error('verification failed'); ok++; } catch (e) { bad++; console.error('FAILED', m.storage_key, e.message); } }
console.log(`Media migrated: ${ok} ok, ${bad} failed. Now update MEDIA_PUBLIC_BASE/URLs: run  UPDATE media_files SET url = replace(url, '<old base>', '<new base>')  (see docs/MIGRATION.md).`); await db.close(); process.exitCode = bad ? 1 : 0;
