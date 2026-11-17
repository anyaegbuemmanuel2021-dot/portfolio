import { randomUUID, createHash } from 'node:crypto';
import { HttpError } from '../lib/validate.js';
import { config } from '../config.js';
const now = () => new Date().toISOString();
const TYPES = { png: ['image/png', 'png'], jpeg: ['image/jpeg', 'jpg'], gif: ['image/gif', 'gif'], webp: ['image/webp', 'webp'], pdf: ['application/pdf', 'pdf'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'] };
export function sniff(b, name = '') { // validate by actual content (magic bytes), never by the client's claim
  if (b.length > 12 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'; if (b.slice(0, 4).toString() === 'GIF8') return 'gif';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'webp'; if (b.slice(0, 5).toString() === '%PDF-') return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b && /\.docx$/i.test(name)) return 'docx'; return null;
}
export function imageSize(b, kind) {
  try {
    if (kind === 'png') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; if (kind === 'gif') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (kind === 'jpeg') { let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2); } }
    if (kind === 'webp') { const t = b.slice(12, 16).toString(); if (t === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }; if (t === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }; if (t === 'VP8L') { const v = b.readUInt32LE(21); return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 }; } }
  } catch { /* fall through */ } return {};
}
let sharpP; const getSharp = () => (sharpP ||= import('sharp').then(m => m.default).catch(() => null)); // optional dependency
export function mediaService(db, storage) {
  const svc = {
    async upload(buf, { filename = 'upload', folderId = null, alt = null, adminId }) {
      if (!buf.length) throw new HttpError(400, 'Empty file'); if (buf.length > config.maxUploadBytes) throw new HttpError(413, `File exceeds ${config.maxUploadBytes / 1048576} MB limit`);
      const kind = sniff(buf, filename); if (!kind) throw new HttpError(415, 'Unsupported file type. Allowed: PNG, JPEG, GIF, WebP, PDF, DOCX');
      const safeName = String(filename).replace(/[^\w .-]+/g, '_').trim().slice(0, 120) || 'upload';
      let uploadedKeys = [];
      try {
        return await db.tx(async tx => {
          if (tx.dialect === 'postgres') await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['media-name:' + safeName.toLowerCase()]);
          const duplicate = (await tx.query('SELECT id FROM media_files WHERE lower(trim(original_name)) = lower(trim($1)) LIMIT 1', [safeName])).rows[0];
          if (duplicate) throw new HttpError(409, 'Name already exists', { field: 'filename' });
          let [mime, ext] = TYPES[kind]; let data = buf, size = imageSize(buf, kind); const variants = []; const id = randomUUID(); const d = new Date(); const base = `uploads/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${id}`;
          const sharp = ['png', 'jpeg', 'webp'].includes(kind) ? await getSharp() : null;
          if (sharp) { try { const img = sharp(buf, { failOn: 'error' }).rotate(); const meta = await img.metadata(); const out = await img.resize({ width: Math.min(meta.width || 2400, 2400), withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
            if (out.data.length < buf.length) { data = out.data; mime = 'image/webp'; ext = 'webp'; size = { width: out.info.width, height: out.info.height }; }
            for (const w of [480, 960]) if ((size.width || 0) > w) { const v = await sharp(data).resize({ width: w }).webp({ quality: 78 }).toBuffer(); const variantKey = `${base}-${w}.webp`; await storage.put(variantKey, v, 'image/webp'); uploadedKeys.push(variantKey); variants.push({ width: w, url: storage.publicUrl(variantKey) }); } } catch { throw new HttpError(422, 'Image could not be processed'); } }
          const key = `${base}.${ext}`; await storage.put(key, data, mime); uploadedKeys.push(key);
          const row = { id, folder_id: folderId, storage_provider: storage.name, storage_key: key, url: storage.publicUrl(key), original_name: safeName, mime_type: mime, size_bytes: data.length, width: size.width || null, height: size.height || null, checksum: createHash('sha256').update(data).digest('hex'), alt_text: alt, variants: JSON.stringify(variants), created_by: adminId, created_at: now() };
          const keys = Object.keys(row); await tx.query(`INSERT INTO media_files (${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')})`, keys.map(k => row[k]));
          return { ...row, variants, optimized: !!sharp };
        });
      } catch (error) {
        await Promise.all(uploadedKeys.map(key => storage.remove(key).catch(() => {})));
        throw error;
      }
    },
    async list({ q, type, folderId, page = 1, limit = 30 }) { const w = [], p = []; if (q) { p.push('%' + q + '%'); w.push(`(original_name ILIKE $${p.length} OR alt_text ILIKE $${p.length})`); } if (type === 'image') w.push("mime_type LIKE 'image/%'"); if (type === 'document') w.push("mime_type NOT LIKE 'image/%'"); if (folderId) { p.push(folderId); w.push(`folder_id = $${p.length}`); } const cl = w.length ? ' WHERE ' + w.join(' AND ') : ''; limit = Math.min(Math.max(Math.floor(+limit) || 30, 1), 100);
      const total = Number((await db.query(`SELECT COUNT(*) AS c FROM media_files${cl}`, p)).rows[0].c); const rows = (await db.query(`SELECT * FROM media_files${cl} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${(Math.max(parseInt(page) || 1, 1) - 1) * limit}`, p)).rows.map(r => ({ ...r, variants: r.variants ? JSON.parse(r.variants) : [] })); return { rows, total, page: +page, limit }; },
    usage: async id => (await db.query('SELECT entity, entity_id FROM media_usage_references WHERE media_id = $1', [id])).rows,
    async remove(id, { force = false } = {}) { const m = (await db.query('SELECT * FROM media_files WHERE id = $1', [id])).rows[0]; if (!m) throw new HttpError(404, 'Not found'); const u = await svc.usage(id); if (u.length && !force) throw new HttpError(409, `This file is used in ${u.length} place(s). Remove it from them first.`, { usage: u });
      await storage.remove(m.storage_key).catch(() => {}); for (const v of JSON.parse(m.variants || '[]')) await storage.remove(v.url.split('/').slice(-4).join('/')).catch(() => {}); await db.query('DELETE FROM media_files WHERE id = $1', [id]); },
    async syncUsage(entity, entityId, urls) { await db.query('DELETE FROM media_usage_references WHERE entity = $1 AND entity_id = $2', [entity, entityId]); for (const u of [...new Set((urls || []).filter(Boolean))]) { const m = (await db.query('SELECT id FROM media_files WHERE url = $1', [u])).rows[0]; if (m) await db.query('INSERT INTO media_usage_references (id,media_id,entity,entity_id,created_at) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), m.id, entity, entityId, now()]); } },
    stats: async () => { const r = (await db.query('SELECT COUNT(*) AS c, COALESCE(SUM(size_bytes),0) AS s FROM media_files')).rows[0]; return { files: Number(r.c), bytes: Number(r.s) }; },
  };
  return svc;
}
