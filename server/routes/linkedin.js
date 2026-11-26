import { HttpError } from '../lib/validate.js';

const redirect = (location, status = 302) => ({
  __raw: true,
  status,
  headers: { Location: location, 'Cache-Control': 'no-store', 'Content-Length': '0' },
  body: '',
});

export function linkedinRoutes(app, { linkedin, social, auth }) {
  app.get('/api/integrations/linkedin/connect', { auth: 'articles' }, async () => redirect(await linkedin.beginAuthorization()));

  app.get('/api/integrations/linkedin/callback', async ctx => {
    if (ctx.query.error) return redirect('/admin/#/social?linkedin=denied');
    try {
      if (!ctx.query.code || !ctx.query.state) throw new HttpError(400, 'Missing LinkedIn authorization code or state');
      await linkedin.completeAuthorization(ctx.query.code, ctx.query.state);
      return redirect('/admin/#/social?linkedin=connected');
    } catch {
      return redirect('/admin/#/social?linkedin=error');
    }
  });

  app.get('/api/integrations/linkedin/status', { auth: 'articles' }, () => linkedin.status());
  app.post('/api/integrations/linkedin/auto-post', { auth: 'articles' }, async ctx => {
    const result = await linkedin.setAutoPost(ctx.body?.enabled === true);
    await auth.audit(ctx, 'update', 'linkedin_auto_post', null, { enabled: result.auto_post_enabled });
    return result;
  });
  app.post('/api/integrations/linkedin/disconnect', { auth: 'articles' }, async ctx => {
    const result = await linkedin.disconnect();
    await auth.audit(ctx, 'disconnect', 'linkedin', null);
    return result;
  });
  app.post('/api/social/posts/:id/retry', { auth: 'articles' }, async ctx => {
    const result = await social.retryLinkedin(ctx.params.id);
    await auth.audit(ctx, 'retry', 'social_post', ctx.params.id, { platform: 'linkedin', status: result.status });
    return result;
  });
}
