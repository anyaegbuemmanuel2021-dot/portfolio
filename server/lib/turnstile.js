// Cloudflare Turnstile server-side verification. A browser widget alone is not security: always verify tokens here.
import { HttpError } from './validate.js';

export async function verifyTurnstile(token, ip, { secret, expectedHostname, expectedAction, fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  if (!secret) return { enabled: false, success: true }; // explicitly disabled until credentials are configured
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) throw new HttpError(403, 'Please complete the human verification challenge.');
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);
  let response;
  try {
    response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HttpError(503, 'Human verification is temporarily unavailable. Please try again shortly.');
  }
  if (!response.ok) throw new HttpError(503, 'Human verification is temporarily unavailable. Please try again shortly.');
  let result;
  try { result = await response.json(); } catch { throw new HttpError(503, 'Human verification could not be checked.'); }
  if (!result.success) throw new HttpError(403, 'Human verification failed. Please try again.');
  // Treat missing verification context as a failure too; a successful token must
  // be bound to the exact hostname and action expected by this endpoint.
  if (expectedHostname && result.hostname !== expectedHostname) throw new HttpError(403, 'Human verification came from an unexpected website.');
  if (expectedAction && result.action !== expectedAction) throw new HttpError(403, 'Human verification action did not match.');
  return { enabled: true, success: true, hostname: result.hostname || null, action: result.action || null };
}
