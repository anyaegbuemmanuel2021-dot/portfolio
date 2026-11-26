# LinkedIn Personal-Profile Auto-Publishing

The portfolio can publish the LinkedIn outbox item when an article first becomes public. Drafts are not sent. Editing an article that is already public does not create another LinkedIn post.

## LinkedIn Developer Portal

1. Open the existing LinkedIn app under My Apps.
2. Keep **Share on LinkedIn** enabled.
3. Add **Sign In with LinkedIn using OpenID Connect** so the app can request `openid profile` and resolve the authenticated member's person URN.
4. Under Auth, register this exact redirect URL:

   `https://anyaegbu-emmanuel.onrender.com/api/integrations/linkedin/callback`

5. Copy the app's Client ID and Primary Client Secret. Do not put the secret in source control or a chat message.

## Render environment

In the portfolio web service, add:

| Key | Value |
| --- | --- |
| `LINKEDIN_CLIENT_ID` | Client ID from the LinkedIn app |
| `LINKEDIN_CLIENT_SECRET` | Primary Client Secret from the LinkedIn app |
| `LINKEDIN_REDIRECT_URI` | `https://anyaegbu-emmanuel.onrender.com/api/integrations/linkedin/callback` |
| `LINKEDIN_VERSION` | `202611` |

Keep the existing `AUTH_SECRET` stable. The OAuth access token is encrypted at rest using a key derived from it. Changing `AUTH_SECRET` makes the stored LinkedIn token unreadable and requires reconnecting.

## Connect and publish

1. Sign in to `/admin/` and open **Social publishing**.
2. Choose **Connect LinkedIn** and approve the requested scopes.
3. Confirm the connected account name and leave automatic posting enabled.
4. Publish an article. Its LinkedIn outbox item is submitted to the Posts API and records the returned post URN and link.
5. Failed items can be retried from Social publishing. Check LinkedIn before retrying an error that says LinkedIn accepted a request but did not return a post ID, because the remote post may already exist.

The LinkedIn access token is stored encrypted in `system_settings`. Tokens without an approved refresh-token grant expire and require reconnecting from the dashboard. Facebook and Instagram continue to use their existing review workflow; this integration only auto-publishes to the personal LinkedIn profile.
