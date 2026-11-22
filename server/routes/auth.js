import { cookie, rateLimit } from '../lib/http.js';
import { config } from '../config.js';
import { HttpError, validate } from '../lib/validate.js';

function passwordField(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) {
    throw new HttpError(422, 'Validation failed', { [field]: 'must be a non-empty string of at most 200 characters' });
  }
  return value;
}

export function authRoutes(app, { auth, db }) {
  app.post('/api/auth/login', async ctx => {
    await rateLimit('login:' + ctx.ipHash, 12, 15 * 60e3, db);
    const b = validate({ email: { type: 'string', required: true, max: 254 }, password: { required: true, max: 200 } }, ctx.body);
    const r = await auth.login(b, { ipHash: ctx.ipHash, userAgent: ctx.req.headers['user-agent'] });
    ctx.setCookies.push(cookie('sid', r.raw, { maxAge: config.sessionHours * 3600, path: '/' }));
    return { admin: r.admin, csrf: r.csrf };
  });
  app.post('/api/auth/logout', { auth: true }, async ctx => { await auth.logout(ctx.rawToken); ctx.setCookies.push(cookie('sid', '', { maxAge: 0 })); return { loggedOut: true }; });
  app.get('/api/auth/me', { auth: true }, ctx => ({ admin: ctx.admin, csrf: ctx.csrf }));
  app.post('/api/auth/password', { auth: true }, async ctx => {
    const current = passwordField(ctx.body?.current, 'current');
    const next = passwordField(ctx.body?.next, 'next');
    await auth.changePassword(ctx.admin.id, current, next, ctx.session.id);
    await auth.audit(ctx, 'password_change', 'admin', ctx.admin.id);
    return { changed: true };
  });
  app.get('/api/auth/sessions', { auth: true }, async ctx => (await auth.sessions(ctx.admin.id)).map(s => ({ ...s, current: s.id === ctx.session.id })));
  app.post('/api/auth/sessions/revoke-others', { auth: true }, async ctx => { await auth.revokeOthers(ctx.admin.id, ctx.session.id); return { revoked: true }; });
  app.post('/api/auth/forgot', async ctx => {
    await rateLimit('forgot:' + ctx.ipHash, 5, 3600e3, db);
    const { email } = validate({ email: { type: 'email', required: true, max: 254 } }, ctx.body);
    await auth.requestReset(email, ctx.ipHash);
    return { message: 'If that account exists, a reset link has been sent.' };
  });
  app.post('/api/auth/reset', async ctx => {
    await rateLimit('reset:' + ctx.ipHash, 10, 3600e3, db);
    const { token } = validate({ token: { required: true, max: 128 } }, ctx.body);
    const password = passwordField(ctx.body?.password, 'password');
    await auth.resetPassword(token, password);
    return { reset: true };
  });
}
