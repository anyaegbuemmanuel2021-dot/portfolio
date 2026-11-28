import { randomBytes, createHash } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../lib/validate.js';
import { oauthSecurity } from './oauth-security.js';

const META_VERSION = process.env.META_GRAPH_VERSION || 'v27.0';
const callbacks = {
  facebook: process.env.META_FACEBOOK_REDIRECT_URI || config.siteUrl + '/api/integrations/facebook/callback',
  instagram: process.env.META_INSTAGRAM_REDIRECT_URI || config.siteUrl + '/api/integrations/instagram/callback',
  x: process.env.X_REDIRECT_URI || config.siteUrl + '/api/integrations/x/callback',
  tiktok: process.env.TIKTOK_REDIRECT_URI || config.siteUrl + '/api/integrations/tiktok/callback',
};
const metaScopes = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'];
const providerKeys = {
  facebook: { id: 'META_APP_ID', secret: 'META_APP_SECRET' },
  instagram: { id: 'META_APP_ID', secret: 'META_APP_SECRET' },
  x: { id: 'X_CLIENT_ID', secret: 'X_CLIENT_SECRET' },
  tiktok: { id: 'TIKTOK_CLIENT_KEY', secret: 'TIKTOK_CLIENT_SECRET' },
};
const safeJson = async response => response.json().catch(() => ({}));
const validMedia = value => {
  if (!value) return null;
  let url; try { url = new URL(String(value)); } catch { throw new HttpError(422, 'Media URL must be a public HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new HttpError(422, 'Media URL must be a public HTTPS URL');
  return url.href;
};

export function socialOAuthService(db) {
  const security = oauthSecurity(db);
  const key = (provider, name) => 'social_oauth_' + provider + '_' + name;
  const get = async (provider, name) => (await db.query('SELECT value FROM site_settings WHERE key=$1', [key(provider, name)])).rows[0]?.value ?? null;
  const set = async (provider, name, value) => db.query(
    'INSERT INTO site_settings (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2,updated_at=$3',
    [key(provider, name), value == null ? null : String(value), new Date().toISOString()],
  );
  const remove = async provider => db.query("DELETE FROM site_settings WHERE key LIKE $1", ['social_oauth_' + provider + '_%']);
  const configured = p => Boolean(process.env[providerKeys[p].id] && process.env[providerKeys[p].secret]);
  const exchange = async (url, body, headers = {}) => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams(body), signal: AbortSignal.timeout(20000) });
    const data = await safeJson(response);
    if (!response.ok || data.error || data.error_description) throw new Error(data.error_description || data.error?.message || data.message || 'Provider token exchange failed (HTTP ' + response.status + ')');
    return data;
  };
  const profileFetch = async (url, token) => {
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15000) });
    const data = await safeJson(response);
    if (!response.ok || data.errors?.length || data.error) throw new Error(data.detail || data.error?.message || 'Provider profile request failed (HTTP ' + response.status + ')');
    return data;
  };
  async function saveTokens(provider, data, profile) {
    if (!data.access_token) throw new Error('The provider did not return an access token');
    await set(provider, 'access_token_enc', security.encrypt(data.access_token));
    if (data.refresh_token) await set(provider, 'refresh_token_enc', security.encrypt(data.refresh_token));
    await set(provider, 'expires_at', data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : '');
    await set(provider, 'account_id', String(profile.id || profile.open_id || profile.user_id || ''));
    await set(provider, 'account_name', String(profile.name || profile.username || profile.display_name || ''));
  }
  async function start(provider) {
    if (!providerKeys[provider] || !configured(provider)) throw new HttpError(503, 'Add the ' + (providerKeys[provider]?.id || 'provider') + ' and secret to the Render environment before connecting.');
    const clientId = process.env[providerKeys[provider].id];
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = await security.createState(provider, { verifier, redirectUri: callbacks[provider] });
    let url;
    if (provider === 'facebook') {
      url = new URL('https://www.facebook.com/' + META_VERSION + '/dialog/oauth');
      const loginConfigId = process.env.META_FACEBOOK_LOGIN_CONFIG_ID;
      if (!loginConfigId) throw new HttpError(503, 'Facebook Login for Business configuration is missing. Add META_FACEBOOK_LOGIN_CONFIG_ID in Render.');
      url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callbacks.facebook, state, response_type: 'code', config_id: loginConfigId }).toString();
    } else if (provider === 'instagram') {
      // Instagram Login is independent of Facebook Login and does not require a Page.
      url = new URL('https://www.instagram.com/oauth/authorize');
      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbacks.instagram,
        response_type: 'code',
        scope: 'instagram_business_basic,instagram_business_content_publish',
        state,
      }).toString();
    } else if (provider === 'x') {
      url = new URL('https://twitter.com/i/oauth2/authorize');
      url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: callbacks.x, scope: 'users.read tweet.read tweet.write offline.access', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
    } else {
      url = new URL('https://www.tiktok.com/v2/auth/authorize/');
      url.search = new URLSearchParams({ client_key: clientId, redirect_uri: callbacks.tiktok, response_type: 'code', scope: 'user.info.basic,video.publish,video.upload', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
    }
    return url.href;
  }
  async function complete(provider, code, state) {
    const stateData = await security.consumeState(provider, state);
    if (!stateData || !code) throw new HttpError(400, 'Authorization expired or failed its security check. Start the connection again.');
    const clientId = process.env[providerKeys[provider].id], secret = process.env[providerKeys[provider].secret];
    if (!configured(provider)) throw new HttpError(503, 'Provider credentials are not configured');
    if (provider === 'facebook') {
      const tokenResponse = await fetch('https://graph.facebook.com/' + META_VERSION + '/oauth/access_token?' + new URLSearchParams({
        client_id: clientId, client_secret: secret, redirect_uri: callbacks.facebook, code,
      }), { signal: AbortSignal.timeout(20000) });
      const tokenData = await safeJson(tokenResponse);
      if (!tokenResponse.ok || !tokenData.access_token) throw new Error('Meta authorization-code exchange failed. Verify the app credentials and exact callback URL.');
      const longToken = await safeJson(await fetch('https://graph.facebook.com/' + META_VERSION + '/oauth/access_token?' + new URLSearchParams({
        grant_type: 'fb_exchange_token', client_id: clientId, client_secret: secret, fb_exchange_token: tokenData.access_token,
      }), { signal: AbortSignal.timeout(15000) }));
      const userToken = longToken.access_token || tokenData.access_token;
      const pages = await profileFetch('https://graph.facebook.com/' + META_VERSION + '/me/accounts?fields=id,name,access_token&limit=100', userToken);
      const page = (pages.data || []).find(p => p.id && p.access_token);
      if (!page) throw new Error('No Facebook Page was found. Add your profile as an administrator of a Facebook Page and try again.');
      await set('facebook', 'access_token_enc', security.encrypt(page.access_token));
      await set('facebook', 'account_id', String(page.id));
      await set('facebook', 'account_name', String(page.name || 'Facebook Page'));
      await set('facebook', 'expires_at', longToken.expires_in ? new Date(Date.now() + Number(longToken.expires_in) * 1000).toISOString() : '');
      await set('facebook', 'user_token_enc', security.encrypt(userToken));
      return { connected: true, account_name: page.name };
    }
    if (provider === 'instagram') {
      const tokenData = await exchange('https://api.instagram.com/oauth/access_token', {
        client_id: clientId,
        client_secret: secret,
        grant_type: 'authorization_code',
        redirect_uri: callbacks.instagram,
        code,
      });
      if (!tokenData.access_token) throw new Error('Instagram did not return an access token.');
      const longTokenResponse = await fetch('https://graph.instagram.com/access_token?' + new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: secret,
        access_token: tokenData.access_token,
      }), { signal: AbortSignal.timeout(15000) });
      const longToken = await safeJson(longTokenResponse);
      if (!longTokenResponse.ok || !longToken.access_token) throw new Error(longToken.error?.message || 'Instagram long-lived token exchange failed.');
      const profile = await profileFetch('https://graph.instagram.com/' + META_VERSION + '/me?fields=user_id,username', longToken.access_token);
      const accountId = profile.user_id || profile.id;
      if (!accountId) throw new Error('Instagram did not return a professional account ID.');
      await set('instagram', 'access_token_enc', security.encrypt(longToken.access_token));
      await set('instagram', 'account_id', String(accountId));
      await set('instagram', 'account_name', String(profile.username || 'Instagram Professional account'));
      await set('instagram', 'expires_at', longToken.expires_in ? new Date(Date.now() + Number(longToken.expires_in) * 1000).toISOString() : '');
      return { connected: true, account_name: profile.username || null };
    }
    if (provider === 'x') {
      const tokenData = await exchange('https://api.x.com/2/oauth2/token', {
        grant_type: 'authorization_code', code, redirect_uri: callbacks.x, code_verifier: stateData.verifier, client_id: clientId,
      }, { Authorization: 'Basic ' + Buffer.from(clientId + ':' + secret).toString('base64') });
      const data = await profileFetch('https://api.x.com/2/users/me?user.fields=name,username', tokenData.access_token);
      const user = data.data || {};
      await saveTokens('x', tokenData, { id: user.id, name: user.username || user.name });
      return { connected: true, account_name: user.username || user.name };
    }
    const tokenData = await exchange('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: clientId, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: callbacks.tiktok, code_verifier: stateData.verifier,
    });
    const token = tokenData.data || tokenData;
    const profile = await profileFetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username', token.access_token);
    const user = profile.data?.user || {};
    await saveTokens('tiktok', token, { id: user.open_id || token.open_id, name: user.username || user.display_name });
    return { connected: true, account_name: user.username || user.display_name };
  }
  async function status(provider, refreshAttempted = false) {
    const [token, accountId, name, expires, refreshToken] = await Promise.all(['access_token_enc','account_id','account_name','expires_at','refresh_token_enc'].map(k => get(provider, k)));
    const isExpired = Boolean(expires && new Date(expires).getTime() <= Date.now());
    if (isExpired && refreshToken && !refreshAttempted && ['x','tiktok'].includes(provider)) {
      try { await accessToken(provider); return status(provider, true); } catch { /* Keep the expired state visible; reconnect remains available. */ }
    }
    return { platform: provider, configured: configured(provider), connected: Boolean(token && accountId && !isExpired), expired: Boolean(token && isExpired), account_name: name || null, callback_url: callbacks[provider] };
  }
  async function accessToken(provider) {
    const encrypted = await get(provider, 'access_token_enc');
    if (!encrypted) throw new HttpError(409, provider + ' is not connected. Connect the account first.');
    let expires = await get(provider, 'expires_at');
    if (expires && new Date(expires).getTime() <= Date.now()) {
      const refreshEnc = await get(provider, 'refresh_token_enc');
      if (!refreshEnc || !['x','tiktok'].includes(provider)) throw new HttpError(409, provider + ' access has expired. Reconnect the account.');
      const refreshToken = security.decrypt(refreshEnc);
      const body = provider === 'x'
        ? { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: process.env.X_CLIENT_ID }
        : { client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: refreshToken };
      const refreshed = provider === 'x'
        ? await exchange('https://api.x.com/2/oauth2/token', body, { Authorization: 'Basic ' + Buffer.from(process.env.X_CLIENT_ID + ':' + process.env.X_CLIENT_SECRET).toString('base64') })
        : await exchange('https://open.tiktokapis.com/v2/oauth/token/', body);
      const data = refreshed.data || refreshed;
      await set(provider, 'access_token_enc', security.encrypt(data.access_token));
      if (data.refresh_token) await set(provider, 'refresh_token_enc', security.encrypt(data.refresh_token));
      expires = new Date(Date.now() + Number(data.expires_in || 0) * 1000).toISOString();
      await set(provider, 'expires_at', expires);
      return data.access_token;
    }
    return security.decrypt(encrypted);
  }
  async function disconnect(provider) { if (!providerKeys[provider]) throw new HttpError(404, 'Unknown social provider'); await remove(provider); if (provider === 'facebook') await remove('instagram'); return { disconnected: true }; }

  async function creatorInfo() {
    const token = await accessToken('tiktok');
    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' },
      body: '{}', signal: AbortSignal.timeout(15000),
    });
    const data = await safeJson(response);
    if (!response.ok || data.error?.code && data.error.code !== 'ok') throw new Error(data.error?.message || 'TikTok creator settings could not be retrieved');
    return data.data || {};
  }
  async function publishStatus(provider, providerPostId) {
    if (provider !== 'tiktok' || !providerPostId) throw new HttpError(400, 'No asynchronous provider receipt is available for this post.');
    const token = await accessToken(provider);
    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/status/fetch/', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ publish_id: providerPostId }), signal: AbortSignal.timeout(15000),
    });
    const data = await safeJson(response);
    if (!response.ok || data.error?.code && data.error.code !== 'ok') throw new Error(data.error?.message || 'TikTok publication status could not be retrieved');
    const status = data.data?.status || 'PROCESSING';
    return { status, detail: data.data?.fail_reason || null, url: data.data?.share_url || null, published: status === 'PUBLISH_COMPLETE', failed: status === 'FAILED' };
  }
  async function publish(provider, { caption, mediaUrl, linkUrl, privacyLevel }) {
    const token = await accessToken(provider);
    const text = String(caption || '').trim().slice(0, provider === 'x' ? 280 : provider === 'tiktok' ? 150 : 2200);
    if (provider === 'facebook') {
      const pageId = await get('facebook', 'account_id');
      const body = new URLSearchParams({ message: text, access_token: token });
      if (linkUrl) body.set('link', linkUrl);
      const response = await fetch('https://graph.facebook.com/' + META_VERSION + '/' + pageId + '/feed', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(30000) });
      const data = await safeJson(response); if (!response.ok || data.error) throw new Error(data.error?.message || 'Facebook Page publishing failed');
      return { id: data.id, url: 'https://www.facebook.com/' + data.id.replace('_','/posts/') };
    }
    if (provider === 'instagram') {
      const igId = await get('instagram', 'account_id');
      const media = validMedia(mediaUrl);
      if (!media) throw new HttpError(422, 'Instagram publishing requires a public HTTPS image or video URL.');
      const isVideo = /\.(mp4|mov)(?:$|\?)/i.test(media);
      const create = await fetch('https://graph.instagram.com/' + META_VERSION + '/' + igId + '/media', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ caption: text, ...(isVideo ? { media_type: 'REELS', video_url: media } : { image_url: media }), access_token: token }), signal: AbortSignal.timeout(30000) });
      const container = await safeJson(create); if (!create.ok || container.error || !container.id) throw new Error(container.error?.message || 'Instagram media container creation failed');
      if (isVideo) {
        let ready = false;
        for (let i=0;i<12;i++) { await new Promise(resolve => setTimeout(resolve, 5000)); const check = await safeJson(await fetch('https://graph.instagram.com/' + META_VERSION + '/' + container.id + '?fields=status_code', { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) })); if (check.status_code === 'FINISHED') { ready = true; break; } if (check.status_code === 'ERROR') throw new Error('Instagram could not process the video asset'); }
        if (!ready) throw new Error('Instagram video processing is still pending. Retry after a short wait.');
      }
      const publishResponse = await fetch('https://graph.instagram.com/' + META_VERSION + '/' + igId + '/media_publish', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: container.id, access_token: token }), signal: AbortSignal.timeout(30000) });
      const published = await safeJson(publishResponse); if (!publishResponse.ok || published.error || !published.id) throw new Error(published.error?.message || 'Instagram publish failed');
      return { id: published.id, url: 'https://www.instagram.com/' };
    }
    if (provider === 'x') {
      const response = await fetch('https://api.x.com/2/tweets', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(20000) });
      const data = await safeJson(response); if (!response.ok || data.errors?.length || !data.data?.id) throw new Error(data.detail || 'X post failed. Check the app write permissions and user authorization.');
      return { id: data.data.id, url: 'https://x.com/i/web/status/' + data.data.id };
    }
    if (provider === 'tiktok') {
      const video = validMedia(mediaUrl);
      if (!video) throw new HttpError(422, 'TikTok publishing requires a publicly reachable HTTPS video URL.');
      const creator = await creatorInfo();
      const allowedPrivacy = Array.isArray(creator.privacy_level_options) ? creator.privacy_level_options : [];
      if (!privacyLevel || !allowedPrivacy.includes(privacyLevel)) throw new HttpError(422, 'Choose one of the privacy options returned by TikTok before publishing.');
      const response = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ post_info: { title: text.slice(0, 150), privacy_level: privacyLevel, disable_comment: false, disable_duet: false, disable_stitch: false }, source_info: { source: 'PULL_FROM_URL', video_url: video } }), signal: AbortSignal.timeout(30000) });
      const data = await safeJson(response); if (!response.ok || data.error?.code && data.error.code !== 'ok') throw new Error(data.error?.message || 'TikTok publish initialization failed');
      return { id: data.data?.publish_id || null, url: null, pending: true, message: 'TikTok accepted the upload request; check Creator Inbox for final processing status.' };
    }
    throw new HttpError(404, 'Unsupported social platform');
  }
  return { start, complete, status, disconnect, publish, publishStatus, creatorInfo, callbacks };
}
