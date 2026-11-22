import { randomUUID, createHash } from 'node:crypto';
import { HttpError } from '../lib/validate.js';
import { config } from '../config.js';
import { inflateRawSync } from 'node:zlib';
const now = () => new Date().toISOString();
const MAX_IMAGE_PIXELS = 40_000_000;
const TYPES = { png: ['image/png', 'png'], jpeg: ['image/jpeg', 'jpg'], gif: ['image/gif', 'gif'], webp: ['image/webp', 'webp'], pdf: ['application/pdf', 'pdf'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'] };

const MAX_DOCX_ENTRIES = 512;
const MAX_DOCX_UNCOMPRESSED = 64 * 1024 * 1024;
const MAX_DOCX_ENTRY_UNCOMPRESSED = 16 * 1024 * 1024;
const MAX_DOCX_COMPRESSION_RATIO = 100;
function zipCrc32(data) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }

export function isDocxPackage(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 22 || buf.length > config.maxUploadBytes) return false;
    const min = Math.max(0, buf.length - 22 - 0xffff);
    let end = -1;
    for (let i = buf.length - 22; i >= min; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50 && i + 22 + buf.readUInt16LE(i + 20) === buf.length) { end = i; break; }
    }
    if (end < 0 || buf.readUInt16LE(end + 4) !== 0 || buf.readUInt16LE(end + 6) !== 0) return false;
    const diskEntries = buf.readUInt16LE(end + 8), entries = buf.readUInt16LE(end + 10);
    const centralSize = buf.readUInt32LE(end + 12), centralOffset = buf.readUInt32LE(end + 16);
    if (!entries || entries !== diskEntries || entries > MAX_DOCX_ENTRIES || centralOffset + centralSize !== end) return false;
    const names = new Set(), required = new Map();
    let cursor = centralOffset, totalUncompressed = 0;
    for (let n = 0; n < entries; n++) {
      if (cursor + 46 > end || buf.readUInt32LE(cursor) !== 0x02014b50) return false;
      const flags = buf.readUInt16LE(cursor + 8), method = buf.readUInt16LE(cursor + 10);
      const compressed = buf.readUInt32LE(cursor + 20), uncompressed = buf.readUInt32LE(cursor + 24);
      const nameLength = buf.readUInt16LE(cursor + 28), extraLength = buf.readUInt16LE(cursor + 30), commentLength = buf.readUInt16LE(cursor + 32);
      const diskStart = buf.readUInt16LE(cursor + 34), externalAttrs = buf.readUInt32LE(cursor + 38), localOffset = buf.readUInt32LE(cursor + 42);
      const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
      if (recordEnd > end || !nameLength || diskStart !== 0 || (flags & 1) || (method !== 0 && method !== 8)) return false;
      const name = new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(cursor + 46, cursor + 46 + nameLength));
      if (!name || name.startsWith('/') || name.includes(String.fromCharCode(92)) || name.includes(String.fromCharCode(0)) || name.split('/').some(part => part === '..' || part === '.')) return false;
      if (names.has(name) || ((externalAttrs >>> 16) & 0xf000) === 0xa000) return false;
      names.add(name);
      if (uncompressed > MAX_DOCX_ENTRY_UNCOMPRESSED) return false;
      totalUncompressed += uncompressed;
      if (totalUncompressed > MAX_DOCX_UNCOMPRESSED) return false;
      if (uncompressed > 0 && (compressed === 0 || uncompressed / compressed > MAX_DOCX_COMPRESSION_RATIO)) return false;
      if (localOffset + 30 > centralOffset || buf.readUInt32LE(localOffset) !== 0x04034b50) return false;
      const localNameLength = buf.readUInt16LE(localOffset + 26), localExtraLength = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      if (dataStart + compressed > centralOffset) return false;
      const localName = new TextDecoder('utf-8', { fatal: true }).decode(buf.subarray(localOffset + 30, localOffset + 30 + localNameLength));
      if (localName !== name || buf.readUInt16LE(localOffset + 6) !== flags || buf.readUInt16LE(localOffset + 8) !== method) return false;
      if (name === '[Content_Types].xml' || name === 'word/document.xml') required.set(name, { start: dataStart, compressed, uncompressed, method, crc: buf.readUInt32LE(cursor + 16) });
      cursor = recordEnd;
    }
    if (cursor !== centralOffset + centralSize || !names.has('[Content_Types].xml') || !names.has('word/document.xml') || required.size !== 2) return false;
    const readXml = entry => {
      const packed = buf.subarray(entry.start, entry.start + entry.compressed);
      const data = entry.method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: MAX_DOCX_ENTRY_UNCOMPRESSED });
      if (data.length !== entry.uncompressed || zipCrc32(data) !== entry.crc) throw new Error('Invalid ZIP entry checksum');
      return new TextDecoder('utf-8', { fatal: true }).decode(data);
    };
    const typesXml = readXml(required.get('[Content_Types].xml'));
    const documentXml = readXml(required.get('word/document.xml'));
    return /<(?:[A-Za-z0-9_]+:)?Types\b/.test(typesXml)
      && typesXml.includes('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')
      && /<(?:[A-Za-z0-9_]+:)?document\b/.test(documentXml)
      && documentXml.includes('wordprocessingml/2006/main');
  } catch { return false; }
}

export function sniff(b, name = '') { // validate by actual content (magic bytes), never by the client's claim
  if (b.length > 12 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'; if (b.slice(0, 4).toString() === 'GIF8') return 'gif';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'webp'; if (b.slice(0, 5).toString() === '%PDF-') return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b && /\.docx$/i.test(name)) return isDocxPackage(b) ? 'docx' : null; return null;
}
export function validateImageDimensions(size) {
  const width = size?.width, height = size?.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new HttpError(422, 'Image dimensions could not be verified');
  }
  if (width > MAX_IMAGE_PIXELS / height) {
    throw new HttpError(413, 'Image dimensions exceed the 40 megapixel limit');
  }
  return { width, height };
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
    // Migrate existing references to stable same-origin URLs without moving or deleting stored objects.
    async repairPublicUrls() {
      const rows = (await db.query('SELECT id, url, storage_key, variants FROM media_files WHERE storage_key IS NOT NULL')).rows;
      let repaired = 0;
      for (const row of rows) {
        const nextUrl = storage.publicUrl(row.storage_key);
        if (row.url === nextUrl) continue;
        await db.tx(async tx => {
          await tx.query('UPDATE media_files SET url = $1 WHERE id = $2', [nextUrl, row.id]);
          await tx.query('UPDATE articles SET featured_image_url = $1 WHERE featured_image_url = $2', [nextUrl, row.url]);
          await tx.query('UPDATE article_images SET url = $1 WHERE url = $2', [nextUrl, row.url]);
          await tx.query('UPDATE articles SET content_md = REPLACE(content_md, $1, $2), content_html = REPLACE(content_html, $1, $2) WHERE content_md LIKE $3 OR content_html LIKE $3', [row.url, nextUrl, `%${row.url}%`]);
          await tx.query('UPDATE article_revisions SET content_md = REPLACE(content_md, $1, $2) WHERE content_md LIKE $3', [row.url, nextUrl, `%${row.url}%`]);
          await tx.query('UPDATE biography SET photo_url = $1 WHERE photo_url = $2', [nextUrl, row.url]);
          await tx.query('UPDATE project_images SET url = $1 WHERE url = $2', [nextUrl, row.url]);
          if (row.variants) await tx.query('UPDATE media_files SET variants = REPLACE(variants, $1, $2) WHERE id = $3', [row.url, nextUrl, row.id]);
        });
        repaired++;
      }
      return { checked: rows.length, repaired };
    },
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
          if (['png', 'jpeg', 'gif', 'webp'].includes(kind)) size = validateImageDimensions(size);
          const sharp = ['png', 'jpeg', 'webp'].includes(kind) ? await getSharp() : null;
          if (sharp) { try { const img = sharp(buf, { failOn: 'error', limitInputPixels: MAX_IMAGE_PIXELS }).rotate(); const meta = await img.metadata(); if (meta.width && meta.height && meta.width * meta.height > MAX_IMAGE_PIXELS) throw new HttpError(413, 'Image dimensions exceed the 40 megapixel limit'); const out = await img.resize({ width: Math.min(meta.width || 2400, 2400), withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
            if (out.data.length < buf.length) { data = out.data; mime = 'image/webp'; ext = 'webp'; size = { width: out.info.width, height: out.info.height }; }
            for (const w of [480, 960]) if ((size.width || 0) > w) { const v = await sharp(data, { limitInputPixels: MAX_IMAGE_PIXELS }).resize({ width: w }).webp({ quality: 78 }).toBuffer(); const variantKey = `${base}-${w}.webp`; await storage.put(variantKey, v, 'image/webp'); uploadedKeys.push(variantKey); variants.push({ width: w, url: storage.publicUrl(variantKey) }); } } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(422, 'Image could not be processed'); } }
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
