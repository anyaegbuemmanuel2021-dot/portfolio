import { HttpError } from '../lib/validate.js';

const redirect = location => ({ __raw: true, status: 302, headers: { Location: location, 'Cache-Control': 'no-store', 'Content-Length': '0' }, body: '' });
const providers = ['facebook', 'instagram', 'x', 'tiktok'];

export function socialIntegrationRoutes(app, { oauth, social, auth, db }) {
  for (const provider of providers) {
    app.get('/api/integrations/' + provider + '/connect', { auth: 'articles' }, async () => redirect(await oauth.start(provider)));
    app.get('/api/integrations/' + provider + '/callback', async ctx => {
      if (ctx.query.error) return redirect('/admin/#/social?' + provider + '=denied');
      try {
        if (!ctx.query.code || !ctx.query.state) throw new HttpError(400, 'Missing authorization code or state');
        const result = await oauth.complete(provider, ctx.query.code, ctx.query.state);
        return redirect('/admin/#/social?' + provider + (result.connected ? '=connected' : '=needs_setup'));
      } catch (error) {
        console.error(provider + ' OAuth callback failed:', error.message);
        return redirect('/admin/#/social?' + provider + '=error');
      }
    });
    app.get('/api/integrations/' + provider + '/status', { auth: 'articles' }, () => oauth.status(provider));
    app.post('/api/integrations/' + provider + '/disconnect', { auth: 'articles' }, async ctx => {
      const result = await oauth.disconnect(provider);
      await auth.audit(ctx, 'disconnect', 'social_account', null, { platform: provider });
      return result;
    });
  }

  app.get('/api/social/connections', { auth: 'articles' }, async () => ({ connections: await social.connections() }));
  app.get('/api/social/posts/:id/status', { auth: 'articles' }, async ctx => {
    const row = (await db.query('SELECT id,platform,status,provider_post_id FROM social_posts WHERE id=$1', [ctx.params.id])).rows[0];
    if (!row) throw new HttpError(404, 'Social post not found');
    if (row.platform !== 'tiktok' || row.status !== 'publishing' || !row.provider_post_id) return { status: row.status, checked: false };
    const result = await oauth.publishStatus('tiktok', row.provider_post_id);
    if (result.published) {
      await db.query("UPDATE social_posts SET status='published',last_error=NULL,published_at=$1,updated_at=$1 WHERE id=$2", [new Date().toISOString(), row.id]);
      await auth.audit(ctx, 'publish_confirmed', 'social_post', row.id, { platform: 'tiktok', provider_status: result.status });
      return { status: 'published', checked: true };
    }
    if (result.failed) {
      const error = String(result.detail || 'TikTok could not publish this video').slice(0, 1000);
      await db.query("UPDATE social_posts SET status='failed',last_error=$1,updated_at=$2 WHERE id=$3", [error, new Date().toISOString(), row.id]);
      return { status: 'failed', checked: true, error };
    }
    return { status: 'publishing', checked: true, provider_status: result.status, message: 'TikTok is still processing this video.' };
  });
  app.post('/api/social/posts/:id/publish', { auth: 'articles' }, async ctx => {
    const row = (await db.query('SELECT s.id,s.article_id,s.platform,s.caption,s.link_url,s.media_url,s.status,a.featured_image_url FROM social_posts s JOIN articles a ON a.id=s.article_id WHERE s.id=$1', [ctx.params.id])).rows[0];
    if (!row) throw new HttpError(404, 'Social draft not found');
    if (row.platform === 'linkedin') throw new HttpError(400, 'Use the LinkedIn publish/retry action for LinkedIn posts.');
    if (row.status !== 'approved') throw new HttpError(409, 'Approve this draft before publishing. Nothing has been sent.');
    const claimed = await db.query("UPDATE social_posts SET status='publishing',last_error=NULL,updated_at=$1 WHERE id=$2 AND status='approved' RETURNING id", [new Date().toISOString(), row.id]);
    if (!claimed.rowCount) throw new HttpError(409, 'This post is already being processed or is not approved.');
    try {
      const result = await oauth.publish(row.platform, { caption: row.caption, mediaUrl: row.media_url || row.featured_image_url, linkUrl: row.link_url });
      if (result.pending) {
        await db.query("UPDATE social_posts SET status='publishing',provider_post_id=$1,published_url=NULL,last_error=$2,updated_at=$3 WHERE id=$4", [result.id || null, result.message || 'Provider is processing this post.', new Date().toISOString(), row.id]);
        await auth.audit(ctx, 'publish_started', 'social_post', row.id, { platform: row.platform, provider_id: result.id });
        return { status: 'publishing', pending: true, message: result.message };
      }
      await db.query("UPDATE social_posts SET status='published',provider_post_id=$1,published_url=$2,last_error=NULL,published_at=$3,updated_at=$3 WHERE id=$4", [result.id || null, result.url || null, new Date().toISOString(), row.id]);
      await auth.audit(ctx, 'publish', 'social_post', row.id, { platform: row.platform, provider_id: result.id });
      return { status: 'published', published_url: result.url || null };
    } catch (error) {
      const message = String(error.message || 'Social publishing failed').slice(0, 1000);
      await db.query("UPDATE social_posts SET status='failed',last_error=$1,updated_at=$2 WHERE id=$3", [message, new Date().toISOString(), row.id]);
      await auth.audit(ctx, 'publish_failed', 'social_post', row.id, { platform: row.platform, error: message });
      throw new HttpError(502, message);
    }
  });
}
