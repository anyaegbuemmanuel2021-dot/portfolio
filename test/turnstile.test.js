import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTurnstile } from '../server/lib/turnstile.js';
import { HttpError } from '../server/lib/validate.js';

test('Turnstile is optional only when no secret is configured', async () => {
  assert.deepEqual(await verifyTurnstile('', '127.0.0.1', { secret: '' }), { enabled: false, success: true });
});
test('Turnstile rejects missing tokens when enabled', async () => {
  await assert.rejects(() => verifyTurnstile('', '127.0.0.1', { secret: 'secret' }), e => e instanceof HttpError && e.status === 403);
});
test('Turnstile sends server-side verification and checks hostname/action', async () => {
  let sent;
  const result = await verifyTurnstile('valid-token-value', '203.0.113.2', {
    secret: 'private-secret', expectedHostname: 'example.com', expectedAction: 'contact',
    fetchImpl: async (url, options) => { sent = { url, options }; return { ok: true, json: async () => ({ success: true, hostname: 'example.com', action: 'contact' }) }; },
  });
  assert.equal(result.success, true);
  assert.match(sent.url, /siteverify$/);
  assert.match(String(sent.options.body), /secret=private-secret/);
  assert.match(String(sent.options.body), /remoteip=203.0.113.2/);
});
test('Turnstile rejects failed verification, wrong hostname, wrong action and provider errors', async () => {
  const fake = body => async () => ({ ok: true, json: async () => body });
  await assert.rejects(() => verifyTurnstile('valid-token-value', null, { secret: 's', fetchImpl: fake({ success: false }) }), e => e.status === 403);
  await assert.rejects(() => verifyTurnstile('valid-token-value', null, { secret: 's', expectedHostname: 'right.test', fetchImpl: fake({ success: true, hostname: 'wrong.test' }) }), e => e.status === 403);
  await assert.rejects(() => verifyTurnstile('valid-token-value', null, { secret: 's', expectedAction: 'contact', fetchImpl: fake({ success: true, action: 'newsletter' }) }), e => e.status === 403);
  await assert.rejects(() => verifyTurnstile('valid-token-value', null, { secret: 's', fetchImpl: async () => { throw new Error('network'); } }), e => e.status === 503);
});

test('Turnstile rejects successful tokens with missing hostname or action context', async () => {
  const fake = body => async () => ({ ok: true, json: async () => body });
  await assert.rejects(
    () => verifyTurnstile('valid-token-value', null, {
      secret: 's', expectedHostname: 'example.com', expectedAction: 'contact',
      fetchImpl: fake({ success: true, action: 'contact' }),
    }),
    e => e.status === 403,
  );
  await assert.rejects(
    () => verifyTurnstile('valid-token-value', null, {
      secret: 's', expectedHostname: 'example.com', expectedAction: 'contact',
      fetchImpl: fake({ success: true, hostname: 'example.com' }),
    }),
    e => e.status === 403,
  );
});
