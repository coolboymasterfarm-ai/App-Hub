const test = require('node:test');
const assert = require('node:assert');
const { check, send, mask } = require('../src/discord');

const HOOK = 'https://discord.com/api/webhooks/123456789012345678/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd';

test('discord: webhook check, mask, send and failures', async () => {
  assert.doesNotThrow(() => check(HOOK));
  assert.doesNotThrow(() => check(HOOK.replace('discord.com', 'canary.discordapp.com')));
  assert.throws(() => check('https://evil.example/api/webhooks/1/2'), /webhook address looks wrong/);
  assert.throws(() => check(''), /looks wrong/);
  assert.strictEqual(mask(HOOK), 'https://discord.com/api/webhooks/123456789012345678/••••abcd');
  let sent;
  const ok = async (url, o) => { sent = { url, body: JSON.parse(o.body) }; return { ok: true, status: 204 }; };
  assert.strictEqual(await send(HOOK, 'x'.repeat(2500), ok), true);
  assert.deepStrictEqual([sent.url, sent.body.content.length, sent.body.allowed_mentions], [HOOK, 2000, { parse: [] }]);
  await assert.rejects(send(HOOK, 'hi', async () => ({ ok: false, status: 404, json: async () => ({ message: 'Unknown Webhook' }) })), /no longer exists/);
  await assert.rejects(send(HOOK, 'hi', async () => ({ ok: false, status: 429, json: async () => ({ message: 'You are being rate limited.' }) })), /Discord: You are being rate limited/);
});
