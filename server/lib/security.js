// Security primitives built on node:crypto only (scrypt KDF, HMAC).
import { scrypt, randomBytes, timingSafeEqual, createHash, createHmac } from 'node:crypto';
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
