// All configuration comes from environment variables. Secrets never reach the frontend.
import { readFileSync, existsSync } from 'node:fs';
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) for (const l of readFileSync(envFile, 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const e = process.env;
export const config = {
  env: e.NODE_ENV || 'development',
  isProd: e.NODE_ENV === 'production',
  port: Number(e.PORT || 8787),
  databaseUrl: e.DATABASE_URL || 'sqlite:./data/dev.sqlite',
  authSecret: e.AUTH_SECRET || '',
  siteUrl: (e.SITE_URL || e.RENDER_EXTERNAL_URL || 'http://localhost:8787').replace(/\/$/, ''),
  allowedOrigins: (e.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  enforceSiteHost: e.ENFORCE_SITE_HOST === 'true',
  siteHostAllowlist: (e.SITE_HOST_ALLOWLIST || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  whatsappNumber: (e.WHATSAPP_NUMBER || '2347046947391').replace(/\D/g, ''),
  ownerEmail: e.OWNER_EMAIL || 'anyaegbuemmanuel2021@gmail.com',
  sessionHours: Number(e.SESSION_HOURS || 12),
  storage: { provider: e.STORAGE_PROVIDER || 'local', localDir: e.LOCAL_MEDIA_DIR || './data/media',
    publicBase: (e.DBRIJ_MEDIA_PUBLIC_BASE || e.MEDIA_PUBLIC_BASE || '').replace(/\/$/, ''),
    cloudinary: { cloudName: e.CLOUDINARY_CLOUD_NAME, apiKey: e.CLOUDINARY_API_KEY, apiSecret: e.CLOUDINARY_API_SECRET },
    dbrij: { endpoint: e.DBRIJ_S3_ENDPOINT || 'https://s3.dbrij.com', region: e.DBRIJ_S3_REGION || 'auto', bucket: e.DBRIJ_BUCKET, accessKeyId: e.DBRIJ_KEY_ID, secretAccessKey: e.DBRIJ_KEY_SECRET, publicBase: (e.DBRIJ_MEDIA_PUBLIC_BASE || e.MEDIA_PUBLIC_BASE || '').replace(/\/$/, '') } },
  email: { provider: e.EMAIL_PROVIDER || 'log', brevoKey: e.BREVO_API_KEY, from: e.EMAIL_FROM || 'no-reply@example.com', fromName: e.EMAIL_FROM_NAME || 'Portfolio', inboundSecret: e.EMAIL_INBOUND_SECRET || '' },
  ai: { provider: e.AI_PROVIDER || 'rules', baseUrl: e.AI_BASE_URL, apiKey: e.AI_API_KEY, model: e.AI_MODEL },
  maxUploadBytes: Number(e.MAX_UPLOAD_MB || 8) * 1024 * 1024,
  staticDirs: { public: new URL('../public/', import.meta.url).pathname, admin: new URL('../admin/', import.meta.url).pathname },
  turnstile: { siteKey: e.TURNSTILE_SITE_KEY || '', secretKey: e.TURNSTILE_SECRET_KEY || '' },
  retentionDays: Number(e.RETENTION_DAYS || 400),
};
export function assertConfig() {
  if (config.storage.provider === 'cloudinary') {
    const c = config.storage.cloudinary;
    if (!c.cloudName || !c.apiKey || !c.apiSecret) throw new Error('Cloudinary storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET');
  }
  if (config.storage.provider === 'dbrij') {
    const d = config.storage.dbrij;
    if (!d.bucket || !d.accessKeyId || !d.secretAccessKey) throw new Error('Dbrij storage requires DBRIJ_BUCKET, DBRIJ_KEY_ID and DBRIJ_KEY_SECRET');
    if (!/^https:\/\//i.test(d.endpoint)) throw new Error('Dbrij S3 endpoint must use HTTPS');
  }
  if (Boolean(config.turnstile.siteKey) !== Boolean(config.turnstile.secretKey)) throw new Error('Configure both TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, or leave both unset');
  if (config.isProd && (config.authSecret.length < 32)) throw new Error('AUTH_SECRET must be set (>=32 chars) in production');
  if (!config.authSecret) config.authSecret = 'dev-only-insecure-secret-change-me-0000000000';
}
