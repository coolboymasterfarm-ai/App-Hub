const test = require('node:test');
const assert = require('node:assert');
const { isUserApp, starnetId, userConnectors, syncKeys } = require('../src/appconnectors');

test('app connectors: one per added app, with a unique Starnet id', () => {
  assert.ok(isUserApp('app-lq3x9a') && !isUserApp('apps') && !isUserApp('clipforge') && !isUserApp('app-../x'));
  const taken = new Set(['clipforge', 'myapps']);
  assert.deepStrictEqual(['My Notes!', 'My notes', 'ClipForge', '日本'].map((n) => starnetId(n, taken)),
    ['mynotes', 'mynotes-2', 'clipforge-2', 'app']);
  const c = userConnectors([{ id: 'app-1', name: 'Notion' }, { id: 'app-2', name: 'notion' }], [{ id: 'apphub' }]);
  assert.deepStrictEqual(c.map((x) => [x.scope, x.title, x.path, x.id, x.sw]),
    [['app-1', 'Notion', '/mcp/app-1', 'notion', 'agentApps'], ['app-2', 'notion', '/mcp/app-2', 'notion-2', 'agentApps']]);
});

test('app connectors: a key is made when an app is added and deleted when it is removed', () => {
  let n = 0;
  const newKey = (scope) => `k_${scope}_${++n}`;
  const s = { appKeys: { clipforge: 'kc' }, keyMade: { clipforge: 5 } };
  assert.strictEqual(syncKeys(s, ['clipforge', 'app-a'], newKey, 100), true);
  assert.deepStrictEqual([s.appKeys['app-a'], s.keyMade['app-a'], s.keyMade.clipforge, s.keyMade.all], ['k_app-a_1', 100, 5, 100]);
  assert.strictEqual(syncKeys(s, ['clipforge', 'app-a'], newKey, 200), false);   // nothing new: nothing written
  s.keyDays = { 'app-a': 30 };
  assert.strictEqual(syncKeys(s, ['clipforge'], newKey, 300), true);             // app-a removed
  assert.deepStrictEqual([s.appKeys['app-a'], s.keyMade['app-a'], s.keyDays['app-a'], s.appKeys.clipforge], [undefined, undefined, undefined, 'kc']);
});
