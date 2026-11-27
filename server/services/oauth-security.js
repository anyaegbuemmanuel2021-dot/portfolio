import {
  createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual,
} from 'node:crypto';
import { config } from '../config.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const now = () => Date.now();

function encryptionKey(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('AUTH_SECRET must contain at least 32 characters to encrypt OAuth credentials');
  }
  return createHash('sha256').update('portfolio-oauth-token:v1:' + secret).digest();
}

export function encryptOAuthToken(value, secret = config.authSecret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptOAuthToken(value, secret = config.authSecret) {
  try {
    const [version, iv, tag, data, extra] = String(value || '').split('.');
    if (version !== 'v1' || !iv || !tag || !data || extra) throw new Error('Invalid encrypted token');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('OAuth credentials could not be decrypted. Check that AUTH_SECRET has not changed.');
  }
}

export function oauthSecurity(db, { secret = config.authSecret, clock = now } = {}) {
  const keyForState = (provider, state) => {
    if (!/^[a-z][a-z0-9_-]{1,30}$/.test(String(provider || ''))) throw new Error('Invalid OAuth provider');
    return 'oauth_state_' + provider + '_' + createHash('sha256').update(String(state || '')).digest('hex');
  };
  const set = async (key, value) => db.query(
    'INSERT INTO site_settings (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2,updated_at=$3',
    [key, value, new Date(clock()).toISOString()],
  );

  return {
    async createState(provider, metadata = {}) {
      const state = randomBytes(32).toString('base64url');
      const record = {
        state_hash: createHash('sha256').update(state).digest('hex'),
        expires_at: clock() + STATE_TTL_MS,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      };
      await set(keyForState(provider, state), JSON.stringify(record));
      return state;
    },
    async consumeState(provider, state) {
      if (typeof state !== 'string' || state.length < 32 || state.length > 200) return null;
      const key = keyForState(provider, state);
      const row = (await db.query('SELECT value FROM site_settings WHERE key=$1', [key])).rows[0];
      await db.query('DELETE FROM site_settings WHERE key=$1', [key]);
      if (!row?.value) return null;
      let record;
      try { record = JSON.parse(row.value); } catch { return null; }
      const actual = Buffer.from(createHash('sha256').update(state).digest('hex'));
      const expected = Buffer.from(String(record.state_hash || ''));
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected) || Number(record.expires_at) < clock()) return null;
      return record.metadata || {};
    },
    encrypt: value => encryptOAuthToken(value, secret),
    decrypt: value => decryptOAuthToken(value, secret),
  };
}
