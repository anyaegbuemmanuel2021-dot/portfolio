// Security primitives built on node:crypto only (scrypt KDF, HMAC).
import { scrypt, randomBytes, timingSafeEqual, createHash, createHmac, createCipheriv, createDecipheriv } from 'node:crypto';
import { config } from '../config.js';
const sc = (pw, salt, N, r, p) => new Promise((res, rej) => scrypt(pw, salt, 64, { N, r, p, maxmem: 128 * N * r * 2 }, (e, k) => e ? rej(e) : res(k)));
export async function hashPassword(pw) {
  const salt = randomBytes(16), N = 16384, r = 8, p = 1; const k = await sc(pw.normalize('NFKC'), salt, N, r, p);
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${k.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored).split('$'); if (alg !== 'scrypt') return false;
  const k = await sc(String(pw).normalize('NFKC'), Buffer.from(salt, 'base64'), +N, +r, +p); const h = Buffer.from(hash, 'base64');
  return k.length === h.length && timingSafeEqual(k, h);
}
export function passwordProblems(pw) { const o = []; if (typeof pw !== 'string' || pw.length < 12) o.push('at least 12 characters'); if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) o.push('upper, lower case and a digit'); return o; }
export const token = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = s => createHash('sha256').update(s).digest('hex');
export const hmac = (data, key = config.authSecret) => createHmac('sha256', key).update(data).digest('hex');
export const csrfFor = sessionToken => hmac('csrf:' + sessionToken);
export const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

const outboundKey = () => createHash('sha256').update('portfolio-outbound-link:' + config.authSecret).digest();
export function sealOutboundLink(destination, ttlMs = 30 * 60 * 1000) {
  const value = String(destination || ''), u = new URL(value);
  const allowed = (u.protocol === 'https:' && u.hostname === 'wa.me' && /^\/\d{8,15}$/.test(u.pathname))
    || (u.protocol === 'mailto:' && u.pathname.toLowerCase() === config.ownerEmail.toLowerCase());
  if (!allowed) throw new Error('Unsupported outbound link destination');
  const payload = Buffer.from(JSON.stringify({ v: 1, exp: Date.now() + ttlMs, url: value }));
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', outboundKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}
export function openOutboundLink(tokenValue) {
  try {
    const [ivText, tagText, dataText, extra] = String(tokenValue || '').split('.');
    if (!ivText || !tagText || !dataText || extra) return null;
    const decipher = createDecipheriv('aes-256-gcm', outboundKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    const raw = Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]);
    const payload = JSON.parse(raw.toString('utf8'));
    if (payload.v !== 1 || !Number.isFinite(payload.exp) || payload.exp < Date.now()) return null;
    const u = new URL(payload.url);
    const allowed = (u.protocol === 'https:' && u.hostname === 'wa.me' && /^\/\d{8,15}$/.test(u.pathname))
      || (u.protocol === 'mailto:' && u.pathname.toLowerCase() === config.ownerEmail.toLowerCase());
    return allowed ? u.href : null;
  } catch { return null; }
}
