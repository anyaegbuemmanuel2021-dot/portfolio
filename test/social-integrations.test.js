import test from 'node:test';
import assert from 'node:assert/strict';
import { socialService } from '../server/services/social.js';

test('social integration inventory includes Facebook, Instagram, LinkedIn, X and TikTok', async () => {
  const linkedin = { status: async () => ({ connected: false, configured: false }) };
  const social = socialService({ query: async () => ({ rows: [] }) }, { linkedin });
  const connections = await social.connections();
  assert.deepEqual(connections.map(item => item.platform), ['facebook', 'instagram', 'linkedin', 'x', 'tiktok']);
});

test('social integrations never report a connection merely because legacy static credentials exist', async () => {
  const names = ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN', 'INSTAGRAM_BUSINESS_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) process.env[name] = 'configured-but-not-oauth-connected';
  try {
    const linkedin = { status: async () => ({ connected: false, configured: false }) };
    const social = socialService({ query: async () => ({ rows: [] }) }, { linkedin });
    const connections = await social.connections();
    assert.equal(connections.find(item => item.platform === 'facebook').connected, false);
    assert.equal(connections.find(item => item.platform === 'instagram').connected, false);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
