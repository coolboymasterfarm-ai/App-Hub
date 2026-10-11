const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const starnet = require('../src/starnet');

const clip = (n, score, state = 'done') => ({ n, score, state, start: 10, end: 40.04, title: 'T' + n, file: `clips/clip0${n}_v1.mp4`, srt: `clips/clip0${n}_v1.srt` });

test('videoKey: one YouTube video under any link form', () => {
  const k = 'yt:abcdefghijk';
  for (const u of ['https://www.youtube.com/watch?v=abcdefghijk', 'https://youtu.be/abcdefghijk?t=3', 'https://youtube.com/shorts/abcdefghijk',
    'https://www.youtube.com/watch?list=x&v=abcdefghijk']) assert.strictEqual(starnet.videoKey(u), k);
  assert.strictEqual(starnet.videoKey('C:\\Videos\\A.mp4'), 'c:\\videos\\a.mp4');
});

test('pickClips: finished only, best first, your own clips first', () => {
  const got = starnet.pickClips([clip(1, 60), clip(2, 90), clip(3, null), clip(4, 99, 'error')], 2).map((c) => c.n);
  assert.deepStrictEqual(got, [3, 2]);
});

test('workspaces: finds Starnet installed or run from source, newest wins', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-'));
  const env = { APPDATA: path.join(tmp, 'Roaming'), LOCALAPPDATA: path.join(tmp, 'Local') };
  assert.strictEqual(starnet.workspaces(env), null);
  const installed = path.join(env.APPDATA, 'ai.skynet.harness', 'workspaces');
  const source = path.join(env.LOCALAPPDATA, 'StarNet', 'workspaces');
  fs.mkdirSync(installed, { recursive: true });
  assert.strictEqual(starnet.workspaces(env), installed);
  fs.mkdirSync(source, { recursive: true });
  fs.utimesSync(installed, new Date(1000), new Date(1000));
  assert.strictEqual(starnet.workspaces(env), source);
});

test('summary + sendToStarnet: clips land in the agent folder', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-'));
  const folder = path.join(tmp, 'projects', 'v1');
  fs.mkdirSync(path.join(folder, 'clips'), { recursive: true });
  for (const n of [1, 2]) fs.writeFileSync(path.join(folder, 'clips', `clip0${n}_v1.mp4`), 'video' + n);
  const p = { id: 'v1', title: 'Talk', status: 'done', clips: [clip(1, 50), clip(2, 80)] };

  const s = starnet.summary(p, folder);
  assert.deepStrictEqual(s.clips.map((c) => [c.n, c.seconds, c.file]), [[2, 30, path.join(folder, 'clips', 'clip02_v1.mp4')], [1, 30, path.join(folder, 'clips', 'clip01_v1.mp4')]]);
  assert.strictEqual(s.note, undefined);
  assert.match(starnet.summary({ ...p, status: 'rendering' }, folder).note, /Still working/);

  const ws = path.join(tmp, 'workspaces');
  fs.mkdirSync(path.join(ws, 'agent'), { recursive: true });
  assert.throws(() => starnet.sendToStarnet(p, folder, 'nobody', 0, ws), /Folders in Starnet: agent/);
  assert.throws(() => starnet.sendToStarnet(p, folder, '../x', 0, ws), /agent id/);
  assert.throws(() => starnet.sendToStarnet(p, folder, 'agent', 0, null), /not found/);
  const r = starnet.sendToStarnet(p, folder, 'agent', 1, ws);
  assert.deepStrictEqual(r.files, [{ n: 2, title: 'T2', path: 'clipforge/v1/clip02.mp4' }]);
  assert.strictEqual(fs.readFileSync(path.join(ws, 'agent', 'clipforge', 'v1', 'clip02.mp4'), 'utf8'), 'video2');
  starnet.sendToStarnet(p, folder, 'agent', 1, ws); // again: replaces, no error
});
