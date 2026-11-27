# Social integrations setup

The admin dashboard uses server-side OAuth. Provider secrets and access tokens are never sent to the browser. OAuth access and refresh tokens are encrypted with the application `AUTH_SECRET`; keep that secret stable across deploys or existing connections cannot be decrypted.

## Render environment variables

Set these in the portfolio web service's Render Environment tab. Do not paste secrets into GitHub, the website, or ChatGPT.

| Provider | Variables |
|---|---|
| Google admin sign-in | `GOOGLE_CLIENT_ID` |
| Facebook Pages + Instagram Professional | `META_APP_ID`, `META_APP_SECRET`, optionally `META_GRAPH_VERSION` |
| X | `X_CLIENT_ID`, `X_CLIENT_SECRET` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |

Optional redirect overrides are `META_FACEBOOK_REDIRECT_URI`, `META_INSTAGRAM_REDIRECT_URI`, `X_REDIRECT_URI`, and `TIKTOK_REDIRECT_URI`. By default, callback URLs use `SITE_URL`.

## Exact production callback URLs

Register these exact HTTPS URLs in the corresponding developer consoles:

- Facebook: `https://anyaegbu-emmanuel.onrender.com/api/integrations/facebook/callback`
- Instagram: `https://anyaegbu-emmanuel.onrender.com/api/integrations/instagram/callback`
- X: `https://anyaegbu-emmanuel.onrender.com/api/integrations/x/callback`
- TikTok: `https://anyaegbu-emmanuel.onrender.com/api/integrations/tiktok/callback`

Google Identity Services is an ID-token sign-in flow and does not use an OAuth redirect callback. Add the portfolio origin `https://anyaegbu-emmanuel.onrender.com` to the Google OAuth web client's Authorized JavaScript origins.

## Provider setup and limitations

### Google
Create a Google OAuth Web application client ID and configure the authorized JavaScript origin above. The server validates the JWT signature against Google's published signing keys, issuer, audience, expiry, verified email, and login nonce. Only the configured `OWNER_EMAIL` may sign in; the matching active admin account must already exist. Password login remains available.

### Meta
Use a Meta app with Facebook Login and the required Page/Instagram permissions: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, and `instagram_content_publish`. The Facebook profile must manage a Facebook Page. Instagram publishing requires an Instagram Professional account linked to that Page. The connection currently selects the first eligible Page returned by Meta. Meta app review and business verification may be required before production users can grant publishing permissions.

### X
Configure an OAuth 2.0 confidential client with Authorization Code + PKCE and the scopes `users.read`, `tweet.read`, `tweet.write`, and `offline.access`. The account owner must authorize the app. X API access and write quotas depend on the developer plan.

### TikTok
Enable Login Kit and Content Posting API with `user.info.basic`, `video.publish`, and `video.upload`. TikTok requires a verified public media domain for URL-pull uploads and may restrict unaudited apps to private/test visibility. The admin can check the asynchronous provider status from the social outbox.

## Publishing safety
New article posts are drafts. An admin with article permission must approve each post and press **Publish now**. X posts are text-only in this implementation. Instagram uses the article's featured image by default or a supplied public HTTPS image/video URL. TikTok requires a public HTTPS video URL. Facebook can publish the article link without a separate media file. Provider app review, account eligibility, quotas, and media requirements remain enforced by each provider.
