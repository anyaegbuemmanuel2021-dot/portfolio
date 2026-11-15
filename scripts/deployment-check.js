import { config } from '../server/config.js';
const checks = [
  ['NODE_ENV=production', config.isProd],
  ['PostgreSQL DATABASE_URL', !/^sqlite:/i.test(config.databaseUrl) && /^postgres(ql)?:\/\//i.test(config.databaseUrl)],
  ['AUTH_SECRET (at least 32 characters)', config.authSecret.length >= 32],
  ['HTTPS SITE_URL', /^https:\/\//i.test(config.siteUrl)],
  ['Dbrij Storage provider', config.storage.provider === 'dbrij'],
  ['DBRIJ_S3_ENDPOINT (HTTPS)', /^https:\/\//i.test(config.storage.dbrij.endpoint)],
  ['DBRIJ_BUCKET', Boolean(config.storage.dbrij.bucket)],
  ['DBRIJ_KEY_ID', Boolean(config.storage.dbrij.accessKeyId)],
  ['DBRIJ_KEY_SECRET', Boolean(config.storage.dbrij.secretAccessKey)],
  ['DBRIJ_MEDIA_PUBLIC_BASE (HTTPS)', /^https:\/\//i.test(config.storage.dbrij.publicBase)],
  ['Turnstile key pair (both configured or both empty)', Boolean(config.turnstile.siteKey) === Boolean(config.turnstile.secretKey)],
];
let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'MISSING'} ${label}`);
  if (!ok) failed = true;
}
if (config.email.provider === 'brevo' && !config.email.brevoKey) {
  console.log('MISSING BREVO_API_KEY (required because EMAIL_PROVIDER=brevo)'); failed = true;
}
if (failed) {
  console.error('\nDeployment configuration is incomplete. Set missing variables in Render Environment, not in frontend files.');
  process.exitCode = 1;
} else console.log('\nRequired deployment configuration is present. Run npm run verify:production for live database and Dbrij S3 checks.');
