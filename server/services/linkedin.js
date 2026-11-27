import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../lib/validate.js';

const TOKEN_KEY_PREFIX = 'linkedin_';
const VERSION = process.env.LINKEDIN_VERSION || '202611';
const CALLBACK_PATH = '/api/integrations/linkedin/callback';
const scopes = ['openid', 'profile', 'w_member_social'];

function keyFor(secret) {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('AUTH_SECRET must contain at least 32 characters to encrypt LinkedIn credentials');
  return createHash('sha256').update('portfolio-linkedin-token:v1:' + secret).digest();
}

export function encryptLinkedInToken(value, secret = config.authSecret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptLinkedInToken(value, secret = config.authSecret) {
  try {
    const [version, iv, tag, data, extra] = String(value || '').split('.');
    if (version !== 'v1' || !iv || !tag || !data || extra) throw new Error('Invalid encrypted token');
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('LinkedIn credentials could not be decrypted. Check AUTH_SECRET has not changed.');
  }
}

export function buildLinkedInPost(author, commentary, article) {
  if (!/^urn:li:person:[A-Za-z0-9_-]+$/.test(String(author || ''))) throw new Error('Invalid LinkedIn member author URN');
  const payload = {
    author,
    commentary: String(commentary || '').slice(0, 3000),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
  if (article?.source && article?.title) {
    const source = new URL(article.source);
    if (source.protocol !== 'https:') throw new Error('LinkedIn article source must use HTTPS');
    payload.content = { article: {
      source: source.href,
      title: String(article.title).slice(0, 200),
      description: String(article.description || '').slice(0, 1000),
      ...(article.thumbnail ? { thumbnail: String(article.thumbnail) } : {}),
    } };
  }
  return payload;
}

export function linkedinRedirectUri() {
  return process.env.LINKEDIN_REDIRECT_URI || config.siteUrl + CALLBACK_PATH;
}

export function linkedinService(db) {
  const get = async key => (await db.query('SELECT value FROM site_settings WHERE key=$1', [TOKEN_KEY_PREFIX + key])).rows[0]?.value ?? null;
  const set = async (key, value) => db.query(
    'INSERT INTO site_settings (key,value,updated_at) VALUES ($1,$2,$3) ON CONFLICT (key) DO UPDATE SET value=$2,updated_at=$3',
    [TOKEN_KEY_PREFIX + key, value == null ? null : String(value), new Date().toISOString()]
  );
  const remove = async key => db.query('DELETE FROM site_settings WHERE key=$1', [TOKEN_KEY_PREFIX + key]);
  const configured = () => Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
  const redirectUri = linkedinRedirectUri();

  async function status() {
    const [token, author, expires, name, enabled] = await Promise.all([
      get('access_token_enc'), get('author_urn'), get('expires_at'), get('member_name'), get('auto_post_enabled'),
    ]);
    const connected = Boolean(token && author && expires && new Date(expires).getTime() > Date.now());
    return {
      configured: configured(),
      connected,
      expired: Boolean(token && expires && !connected),
      member_name: connected ? name : null,
      auto_post_enabled: connected && enabled === 'true',
      callback_url: redirectUri,
      required_products: ['Share on LinkedIn', 'Sign In with LinkedIn using OpenID Connect'],
      required_scopes: scopes,
    };
  }

  async function beginAuthorization() {
    if (!configured()) throw new HttpError(503, 'LinkedIn Client ID and Client Secret must be configured in Render first');
    const state = randomBytes(32).toString('base64url');
    await set('oauth_state', JSON.stringify({ state, expires_at: Date.now() + 10 * 60 * 1000 }));
    const url = new URL('https://www.linkedin.com/oauth/v2/authorization');
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINKEDIN_CLIENT_ID,
      redirect_uri: redirectUri,
      state,
      scope: scopes.join(' '),
      enable_extended_login: 'true',
    }).toString();
    return url.href;
  }

  async function completeAuthorization(code, state) {
    const saved = await get('oauth_state');
    await remove('oauth_state');
    let expected;
    try { expected = JSON.parse(saved || 'null'); } catch { expected = null; }
    const a = Buffer.from(String(expected?.state || ''));
    const b = Buffer.from(String(state || ''));
    if (!expected || expected.expires_at < Date.now() || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new HttpError(400, 'LinkedIn connection request expired or failed its security check. Please connect again.');
    }
    if (!code || !configured()) throw new HttpError(400, 'LinkedIn authorization was not completed');
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error('LinkedIn token exchange failed. Recheck the app credentials and exact callback URL.');
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
      signal: AbortSignal.timeout(15000),
    });
    const profile = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || !profile.sub) throw new Error('LinkedIn could not return the connected member profile. Confirm OpenID Connect is enabled.');
    const expiry = new Date(Date.now() + Number(tokenData.expires_in || 0) * 1000).toISOString();
    await set('access_token_enc', encryptLinkedInToken(tokenData.access_token));
    await set('author_urn', 'urn:li:person:' + profile.sub);
    await set('expires_at', expiry);
    await set('member_name', profile.name || '');
    await set('auto_post_enabled', 'true');
    return { member_name: profile.name || '', expires_at: expiry };
  }


  export function resolveLinkedInThumbnailUrl(imageUrl, siteUrl = config.siteUrl, cloudName = config.storage.cloudinary.cloudName) {
  if (!imageUrl) return null;
  const source = new URL(String(imageUrl), siteUrl);
  const site = new URL(siteUrl);
  const sameSite = source.origin === site.origin;
  const cloudinaryPath = cloudName ? '/' + cloudName + '/image/upload/' : null;
  const isCloudinary = source.protocol === 'https:' && source.hostname === 'res.cloudinary.com'
    && cloudinaryPath && source.pathname.includes(cloudinaryPath);
  if (source.protocol !== 'https:' || source.username || source.password || (!sameSite && !isCloudinary)) {
    throw new Error('LinkedIn thumbnail must be a public HTTPS image on this portfolio or its configured Cloudinary account.');
  }
  // Cloudinary-hosted portfolio images are often stored as WebP. LinkedIn's
  // image upload endpoint does not accept WebP, so request a JPEG rendition
  // directly from Cloudinary without changing the stored original.
  if (isCloudinary) source.pathname = source.pathname.replace(cloudinaryPath, cloudinaryPath + 'f_jpg,q_auto/');
  return source.href;
}

async function uploadArticleThumbnail(accessToken, author, imageUrl) {
    if (!imageUrl) return null;
    const sourceUrl = resolveLinkedInThumbnailUrl(imageUrl);
    const imageResponse = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
    if (!imageResponse.ok) throw new Error('Could not fetch the article featured image (HTTP ' + imageResponse.status + ').');
    const contentType = (imageResponse.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(contentType)) throw new Error('The article featured image must be JPG, PNG or GIF for LinkedIn.');
    const declaredLength = Number(imageResponse.headers.get('content-length') || 0);
    if (declaredLength > 8 * 1024 * 1024) throw new Error('The article featured image is larger than LinkedIn publishing allows (8 MB limit).');
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error('The article featured image is empty or larger than 8 MB.');
    const init = await fetch('https://api.linkedin.com/rest/images?action=initializeUpload', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'Linkedin-Version': VERSION,
      },
      body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
      signal: AbortSignal.timeout(20000),
    });
    const initData = await init.json().catch(() => ({}));
    if (!init.ok || !initData.value?.uploadUrl || !initData.value?.image) {
      throw new Error('LinkedIn could not initialize the thumbnail upload (HTTP ' + init.status + ').');
    }
    const uploaded = await fetch(initData.value.uploadUrl, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': contentType },
      body: bytes,
      signal: AbortSignal.timeout(30000),
    });
    if (!uploaded.ok) throw new Error('LinkedIn thumbnail upload failed (HTTP ' + uploaded.status + ').');
    return initData.value.image;
  }

  async function publishPost(commentary, article) {
    const [encrypted, author, expires] = await Promise.all([get('access_token_enc'), get('author_urn'), get('expires_at')]);
    if (!encrypted || !author || !expires || new Date(expires).getTime() <= Date.now()) {
      throw new Error('LinkedIn is disconnected or its access token has expired. Reconnect LinkedIn in Social publishing.');
    }
    const accessToken = decryptLinkedInToken(encrypted);
    let thumbnail = null;
    let thumbnail_warning = null;
    if (article?.image) {
      try { thumbnail = await uploadArticleThumbnail(accessToken, author, article.image); }
      catch (error) {
        // A thumbnail is optional for LinkedIn article posts. Do not lose the
        // text and article link because an image host or upload request failed.
        thumbnail_warning = String(error?.message || 'LinkedIn thumbnail upload failed').slice(0, 500);
      }
    }
    const postArticle = { ...article, ...(thumbnail ? { thumbnail } : {}) };
    const response = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'Linkedin-Version': VERSION,
      },
      body: JSON.stringify(buildLinkedInPost(author, commentary, postArticle)),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error('LinkedIn API returned ' + response.status + (detail ? ': ' + detail : ''));
    }
    const postUrn = response.headers.get('x-restli-id');
    if (!postUrn) throw new Error('LinkedIn accepted the request but did not return a post ID. Check LinkedIn before retrying to avoid a duplicate.');
    return { post_urn: postUrn, published_url: 'https://www.linkedin.com/feed/update/' + postUrn + '/', ...(thumbnail_warning ? { thumbnail_warning } : {}) };
  }

  return {
    status,
    beginAuthorization,
    completeAuthorization,
    publishPost,
    async setAutoPost(enabled) {
      if (enabled) {
        const s = await status();
        if (!s.connected) throw new HttpError(409, 'Connect a valid LinkedIn account before enabling automatic posting');
      }
      await set('auto_post_enabled', enabled ? 'true' : 'false');
      return status();
    },
    async disconnect() {
      for (const key of ['access_token_enc', 'author_urn', 'expires_at', 'member_name', 'auto_post_enabled', 'oauth_state']) await remove(key);
      return status();
    },
  };
}
