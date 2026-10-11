const test = require('node:test');
const assert = require('node:assert');
const { check, finishedText, send, mask } = require('../src/telegram');

const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

test('telegram: token and chat checks, message text, mask', () => {
  assert.doesNotThrow(() => check(TOKEN, '987654321'));
  assert.doesNotThrow(() => check(TOKEN, '-1001234567890'));
  assert.throws(() => check('nope', '1234'), /bot token/);
  assert.throws(() => check(TOKEN, 'abc'), /chat ID/);
  const text = finishedText({ title: 'My podcast', clips: [
    { state: 'done', file: 'a', title: 'Hook A', score: 71 }, { state: 'done', file: 'b', title: 'Hook B', score: 88 },
    { state: 'error', title: 'Broken', score: 99 }] });
  assert.strictEqual(text, '🎬 Clips ready: My podcast · 2 clips\nBest: Hook B (88)');
  assert.strictEqual(finishedText({ title: 'X', clips: [] }), '🎬 Clips ready: X · 0 clips');
  assert.strictEqual(mask(TOKEN), '••••Dsaw');
  assert.strictEqual(mask(''), '');
});

test('telegram: sends to the Bot API and explains failures', async () => {
  let call;
  const ok = async (url, opts) => { call = { url, body: JSON.parse(opts.body) }; return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  assert.strictEqual(await send(TOKEN, ' 987654321 ', 'hi', ok), true);
  assert.strictEqual(call.url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.deepStrictEqual([call.body.chat_id, call.body.text], ['987654321', 'hi']);
  const fail = (description, status = 400) => async () => ({ ok: false, status, json: async () => ({ ok: false, description }) });
  await assert.rejects(send(TOKEN, '987654321', 'hi', fail('Bad Request: chat not found')), /chat not found\. Send your bot/);
  await assert.rejects(send(TOKEN, '987654321', 'hi', fail('Unauthorized', 401)), /token was refused/);
  await assert.rejects(send('bad', '987654321', 'hi', ok), /bot token/); // checked before any request
});
