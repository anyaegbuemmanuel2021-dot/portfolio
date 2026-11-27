import { createPublicKey, verify as verifySignature } from 'node:crypto';
import { HttpError } from '../lib/validate.js';

let cached = null;
let cacheUntil = 0;

async function signingKeys(fetcher = fetch) {
  if (cached && cacheUntil > Date.now()) return cached;
  const response = await fetcher('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new HttpError(503, 'Google sign-in verification is temporarily unavailable');
  const body = await response.json();
  if (!Array.isArray(body.keys)) throw new HttpError(503, 'Google signing keys are unavailable');
  cached = new Map(body.keys.filter(k => k.kid && (k.x5c?.[0] || (k.kty === 'RSA' && k.n && k.e))).map(k => [k.kid, k.x5c?.[0] ? createPublicKey({ key: `-----BEGIN CERTIFICATE-----\n${k.x5c[0]}\n-----END CERTIFICATE-----`, format: 'pem' }) : createPublicKey({ key: { kty: 'RSA', n: k.n, e: k.e }, format: 'jwk' })]));
  const maxAge = Number((response.headers.get('cache-control') || '').match(/max-age=(\\d+)/i)?.[1] || 1800);
  cacheUntil = Date.now() + Math.min(Math.max(maxAge, 60), 3600) * 1000;
  return cached;
}

export async function verifyGoogleIdToken(token, { clientId, nonce, fetcher = fetch, clock = () => Date.now() } = {}) {
  if (!clientId || typeof token !== 'string' || token.length > 10000) throw new HttpError(401, 'Invalid Google sign-in credential');
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Invalid Google sign-in credential');
  let header, claims, signature;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    signature = Buffer.from(parts[2], 'base64url');
  } catch { throw new HttpError(401, 'Invalid Google sign-in credential'); }
  if (header.alg !== 'RS256' || !header.kid || !signature.length) throw new HttpError(401, 'Unsupported Google sign-in credential');
  const keys = await signingKeys(fetcher);
  const key = keys.get(header.kid);
  if (!key || !verifySignature('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, signature)) throw new HttpError(401, 'Google sign-in signature is invalid');
  const now = Math.floor(clock() / 1000);
  const issuerOk = ['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss);
  const audienceOk = claims.aud === clientId || (Array.isArray(claims.aud) && claims.aud.includes(clientId));
  if (!issuerOk || !audienceOk || !claims.sub || !claims.email || claims.email_verified !== true
    || !Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= now
    || (claims.iat && Number(claims.iat) > now + 60)
    || (nonce && claims.nonce !== nonce)) {
    throw new HttpError(401, 'Google sign-in credential is expired or does not match this login request');
  }
  return { sub: String(claims.sub), email: String(claims.email).trim().toLowerCase(), name: String(claims.name || '').slice(0, 160) };
}
