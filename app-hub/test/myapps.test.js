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
  put(path.join(appdata, 'npm', 'omniroute.cmd'));

  m = myApps(env);
  assert.ok(m.starnet.exe.endsWith('skynet-desktop.exe'));
  assert.strictEqual(m.starnet.url(), 'http://127.0.0.1:57653/');
  assert.ok(m.freellmapi.exe.endsWith('FreeLLMAPI.exe'));
  assert.strictEqual(m.freellmapi.url(), 'http://127.0.0.1:31416/');
  assert.ok(m.omniroute.exe.endsWith('omniroute.cmd'));
  assert.deepStrictEqual(m.omniroute.args, ['--no-open']);

  put(path.join(appdata, 'FreeLLMAPI', 'config.json'), 'not json'); // a broken config falls back to the default port
  assert.strictEqual(myApps(env).freellmapi.url(), 'http://127.0.0.1:31415/');
  fs.rmSync(home, { recursive: true, force: true });
});
