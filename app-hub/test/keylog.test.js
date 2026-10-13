const test = require('node:test');
const assert = require('node:assert');
const { expiresAt, isExpired, record, clean, MAX } = require('../src/keylog');

const DAY = 86400000;

test('keylog: expiry', () => {
  const made = Date.UTC(2026, 9, 1);
  assert.strictEqual(expiresAt(made, 0), null);              // never
  assert.strictEqual(expiresAt(made, 30), made + 30 * DAY);
  assert.strictEqual(expiresAt(undefined, 30), null);        // a key from before expiry existed
  assert.strictEqual(isExpired(made, 30, made + 29 * DAY), false);
  assert.strictEqual(isExpired(made, 30, made + 30 * DAY), true);
  assert.strictEqual(isExpired(made, 0, made + 9999 * DAY), false);
});

test('keylog: last used per key and the last 50 calls, newest first', () => {
  let s = clean(null);
  s = record(s, { scope: 'clipforge', at: 1 });              // e.g. tools/list: used, not logged
  assert.deepStrictEqual(s, { lastUsed: { clipforge: 1 }, calls: [] });
  s = record(s, { scope: 'clipforge', client: 'Starnet', tool: 'make_clips', ok: true, ms: 1234.4, at: 2 });
  s = record(s, { scope: 'models', tool: 'download_model', ok: false, at: 3 });
  assert.deepStrictEqual(s.lastUsed, { clipforge: 2, models: 3 });
  assert.deepStrictEqual(s.calls[0], { at: 3, scope: 'models', client: 'unknown agent', tool: 'download_model', ok: false, ms: 0 });
  assert.strictEqual(s.calls[1].ms, 1234);
  for (let i = 0; i < 60; i++) s = record(s, { scope: 'all', tool: 't' + i, at: 10 + i });
  assert.strictEqual(s.calls.length, MAX);
  assert.strictEqual(s.calls[0].tool, 't59');
  assert.deepStrictEqual(clean({ lastUsed: 5, calls: [{ at: 1 }, null, { at: 2, tool: 'x' }] }), { lastUsed: {}, calls: [{ at: 2, tool: 'x' }] });
});
