import { config, assertConfig } from './config.js';
import { connect } from './db.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { log, attachDb } from './lib/logger.js';
import { createApp, rateLimit } from './lib/http.js';
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
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';
import { entityRoutes } from './routes/entities.js';
import { setSeoDb } from './routes/seo.js';

export async function buildApp({ db, storage, mailer } = {}) {
  assertConfig(); db ||= await connect(); storage ||= createStorage(); mailer ||= createMailer(); attachDb(db); setSeoDb(db);
  if (process.env.AUTO_MIGRATE !== 'false') await migrate(db, m => log.info('migration ' + m)); await seed(db);
  const auth = authService(db, mailer); const media = mediaService(db, storage); const ads = adService(db);
  const analytics = analyticsService(db, { siteHost: new URL(config.siteUrl).hostname }); const articles = articleService(db, { syncUsage: media.syncUsage }); const email = emailService(db, mailer); const leads = leadService(db, { mailer });
  const app = createApp({ log });
  app.middleware = async (ctx, opts) => {
    const m = ctx.req.method;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) { const o = ctx.req.headers.origin; if (o && o !== config.siteUrl && !config.allowedOrigins.includes(o) && new URL(o).host !== ctx.req.headers.host) throw new HttpError(403, 'Cross-origin request blocked'); }
    if (!opts.auth) return; rateLimit('adm:' + ctx.ipHash, 300, 60e3);
    const r = await auth.resolve(ctx.cookies.sid); if (!r) throw new HttpError(401, 'Authentication required');
    if (m !== 'GET' && !safeEq(ctx.req.headers['x-csrf-token'] || '', r.csrf)) throw new HttpError(403, 'Invalid CSRF token');
    if (typeof opts.auth === 'string' && !r.admin.permissions.includes(opts.auth)) throw new HttpError(403, 'You do not have permission for this action');
    Object.assign(ctx, { admin: r.admin, session: r.session, csrf: r.csrf, rawToken: ctx.cookies.sid });
  };
  authRoutes(app, { auth }); const deps = { db, auth, articles, media, leads, email, ads, analytics, storage, mailer, syncUsage: media.syncUsage };
  publicRoutes(app, deps); adminRoutes(app, deps); entityRoutes(app, deps); // specific admin routes first, generic /api/admin/:entity last
  return { app, db, deps };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const { app, db } = await buildApp(); const server = app.server().listen(config.port, () => log.info('listening', { port: config.port, env: config.env, db: db.dialect }));
  const bg = setInterval(() => db.query("UPDATE articles SET status = 'published', published_at = publish_at WHERE status = 'scheduled' AND publish_at <= $1", [new Date().toISOString()]).catch(() => {}), 60e3); bg.unref();
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { server.close(() => db.close().then(() => process.exit(0))); });
}
