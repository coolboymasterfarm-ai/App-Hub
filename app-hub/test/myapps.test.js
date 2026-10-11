const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { myApps, starnetPort } = require('../src/myapps');

test('starnetPort takes the newest listening port from StarNet startup.log', () => {
  const log = [
    'spawn_sidecar pid=17044 port=60594 listening=true',
    'webview-startup: constructing main window',
    'spawn_sidecar pid=11788 port=59773 listening=true',
    'spawn_sidecar pid=1 port=1234 listening=false',
  ].join('\r\n');
  assert.strictEqual(starnetPort(log), 59773);
  // a future StarNet that words the line a little differently is still read
  assert.strictEqual(starnetPort(log + '\nspawn_sidecar ok port=40001 pid=3'), 40001);
  assert.strictEqual(starnetPort(''), null);
});

test('myApps finds the programs and addresses on this PC', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-'));
  const appdata = path.join(home, 'AppData', 'Roaming');
  const env = { USERPROFILE: home, APPDATA: appdata, LOCALAPPDATA: path.join(home, 'AppData', 'Local') };

  let m = myApps(env); // nothing installed yet
  assert.strictEqual(m.starnet.exe, null);
  assert.strictEqual(m.starnet.url(), null);
  assert.strictEqual(m.freellmapi.url(), 'http://127.0.0.1:31415/');
  assert.strictEqual(m.omniroute.url(), 'http://127.0.0.1:20128/');

  const put = (p, text = '') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  put(path.join(home, 'Downloads', 'starnet', 'skynet-desktop.exe'));
  put(path.join(appdata, 'ai.skynet.harness', 'startup.log'), 'spawn_sidecar pid=9 port=57653 listening=true\n');
  put(path.join(home, 'Downloads', 'freellapi', 'FreeLLMAPI.exe'));
  put(path.join(appdata, 'FreeLLMAPI', 'config.json'), '{"port": 31416}');
  assert.strictEqual(m.omniroute.exe, null);
  // OmniRoute: its script comes from its package.json (an update may move it), run with this PC's Node
  const omni = path.join(appdata, 'npm', 'node_modules', 'omniroute');
  put(path.join(omni, 'package.json'), JSON.stringify({ bin: { omniroute: 'bin/v2/omniroute.mjs' } }));
  put(path.join(omni, 'bin', 'v2', 'omniroute.mjs'));
  env.PATH = '';
  env.ProgramFiles = path.join(home, 'Program Files'); // not the test PC's real Node
  assert.match(myApps(env).omniroute.missing, /Node\.js 22/); // OmniRoute there, Node not
  put(path.join(appdata, 'npm', process.platform === 'win32' ? 'node.exe' : 'node'));
  put(path.join(home, '.omniroute', '.env'), 'STORAGE_ENCRYPTION_KEY=x\nPORT=20130\n');

  m = myApps(env);
  assert.ok(m.starnet.exe.endsWith('skynet-desktop.exe'));
  assert.strictEqual(m.starnet.url(), 'http://127.0.0.1:57653/');
  assert.ok(m.freellmapi.exe.endsWith('FreeLLMAPI.exe'));
  assert.strictEqual(m.freellmapi.url(), 'http://127.0.0.1:31416/');
  assert.ok(/node(\.exe)?$/.test(m.omniroute.exe));
  assert.deepStrictEqual(m.omniroute.args, [path.join(omni, 'bin', 'v2', 'omniroute.mjs'), '--no-open']);
  assert.strictEqual(m.omniroute.hidden, true);
  assert.strictEqual(m.omniroute.url(), 'http://127.0.0.1:20130/');

  // an installer's Start menu shortcut is found too (main.js follows it to the program)
  put(path.join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StarNet', 'StarNet.lnk'));
  assert.strictEqual(myApps(env).starnet.shortcuts.length, 1);

  put(path.join(appdata, 'FreeLLMAPI', 'config.json'), 'not json'); // a broken config falls back to the default port
  assert.strictEqual(myApps(env).freellmapi.url(), 'http://127.0.0.1:31415/');
  fs.rmSync(home, { recursive: true, force: true });
});

test('tail: the end of a big log, whole small files, empty for a missing one', () => {
  const { tail } = require('../src/myapps');
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tail-')), 'startup.log');
  fs.writeFileSync(f, 'old line\n'.repeat(1000) + 'spawn_sidecar pid=1 port=4321 listening=true\n');
  assert.match(tail(f, 100), /port=4321/);
  assert.strictEqual(tail(f, 100).length, 100);
  assert.strictEqual(tail(f), fs.readFileSync(f, 'utf8'));
  assert.strictEqual(tail(f + '.nope'), '');
});
