import { config, assertConfig } from './config.js';
import { connect } from './db.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { log, attachDb } from './lib/logger.js';
import { createApp, rateLimit, mimeFor } from './lib/http.js';
import { HttpError } from './lib/validate.js';
import { safeEq } from './lib/security.js';
import { createStorage } from './providers/storage.js';
import { createMailer } from './providers/mail.js';
import { authService } from './services/auth.js';
import { leadService } from './services/leads.js';
import { articleService } from './services/articles.js';
import { mediaService } from './services/media.js';
import { analyticsService } from './services/analytics.js';
import { adService } from './services/ads.js';
import { emailService } from './services/email.js';
import { socialService } from './services/social.js';
import { linkedinService } from './services/linkedin.js';
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';
import { entityRoutes } from './routes/entities.js';
import { linkedinRoutes } from './routes/linkedin.js';
import { setSeoDb } from './routes/seo.js';

export async function buildApp({ db, storage, mailer } = {}) {
  assertConfig(); db ||= await connect(); storage ||= createStorage(); mailer ||= createMailer(); attachDb(db); setSeoDb(db);
  if (process.env.AUTO_MIGRATE !== 'false') await migrate(db, m => log.info('migration ' + m)); await seed(db);
  const auth = authService(db, mailer); const media = mediaService(db, storage); await media.repairPublicUrls(); const ads = adService(db);
  const analytics = analyticsService(db, { siteHost: new URL(config.siteUrl).hostname }); const articles = articleService(db, { syncUsage: media.syncUsage }); const email = emailService(db, mailer); const leads = leadService(db, { mailer }); const linkedin = linkedinService(db); const social = socialService(db, { linkedin });
  const app = createApp({ log, db });
  // Public, same-origin media delivery. Object-storage credentials remain server-side.
  app.get('/api/media/file', async ctx => {
    const key = String(ctx.query.key || '');
    if (!/^[a-zA-Z0-9/_.-]{1,500}$/.test(key) || key.includes('..')) throw new HttpError(400, 'Invalid media key');
    // Only deliver objects registered in the media library. A syntactically
    // valid key alone must never become an object-storage read capability.
    const record = (await db.query('SELECT storage_provider, mime_type FROM media_files WHERE storage_key = $1 LIMIT 1', [key])).rows[0];
    if (!record || record.storage_provider !== storage.name) throw new HttpError(404, 'Media not found');
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
    if (!allowedTypes.has(record.mime_type)) throw new HttpError(404, 'Media not found');
    let body;
    try { body = await storage.get(key); } catch { throw new HttpError(404, 'Media not found'); }
    return { __raw: true, status: 200, headers: { 'Content-Type': record.mime_type, 'Content-Length': body.length, 'Content-Disposition': 'inline', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' }, body };
  });
  app.middleware = async (ctx, opts) => {
    const m = ctx.req.method;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) {
      const origin = ctx.req.headers.origin;
      if (origin) {
        let parsed;
        try { parsed = new URL(origin); } catch { throw new HttpError(403, 'Cross-origin request blocked'); }
        if (parsed.origin !== origin || parsed.username || parsed.password) throw new HttpError(403, 'Cross-origin request blocked');
        const trustedOrigins = new Set([new URL(config.siteUrl).origin, ...config.allowedOrigins]);
        if (!trustedOrigins.has(origin)) throw new HttpError(403, 'Cross-origin request blocked');
      }
    }
    if (!opts.auth) return; await rateLimit('adm:' + ctx.ipHash, 300, 60e3, db);
    const r = await auth.resolve(ctx.cookies.sid); if (!r) throw new HttpError(401, 'Authentication required');
    if (m !== 'GET' && !safeEq(ctx.req.headers['x-csrf-token'] || '', r.csrf)) throw new HttpError(403, 'Invalid CSRF token');
    if (typeof opts.auth === 'string' && !r.admin.permissions.includes(opts.auth)) throw new HttpError(403, 'You do not have permission for this action');
    Object.assign(ctx, { admin: r.admin, session: r.session, csrf: r.csrf, rawToken: ctx.cookies.sid });
  };
  authRoutes(app, { auth, db }); const deps = { db, auth, articles, media, leads, email, ads, analytics, storage, mailer, social, linkedin, syncUsage: media.syncUsage };
  publicRoutes(app, deps); linkedinRoutes(app, deps); adminRoutes(app, deps); entityRoutes(app, deps); // specific admin routes first, generic /api/admin/:entity last
  return { app, db, deps };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, db, deps } = await buildApp(); const social = deps.social; const server = app.server().listen(config.port, () => log.info('listening', { port: config.port, env: config.env, db: db.dialect }));
  const publishDueArticles = async () => {
    const at = new Date().toISOString();
    const due = (await db.query("SELECT id FROM articles WHERE status = 'scheduled' AND publish_at <= $1", [at])).rows;
    if (!due.length) return;
    await db.query("UPDATE articles SET status = 'published', published_at = publish_at WHERE status = 'scheduled' AND publish_at <= $1", [at]);
    for (const article of due) { await social.enqueueArticle(article.id); await social.publishLinkedinArticle(article.id); }
  };
  const bg = setInterval(() => publishDueArticles().catch(err => log.error('scheduled article publishing failed', { error: err.message })), 60e3); bg.unref();
  publishDueArticles().catch(err => log.error('scheduled article publishing failed', { error: err.message }));
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { server.close(() => db.close().then(() => process.exit(0))); });
}
