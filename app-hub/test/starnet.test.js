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

test('summary + sendToStarnet: clips, captions and covers land in the agent folder', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-'));
  const folder = path.join(tmp, 'projects', 'v1');
  fs.mkdirSync(path.join(folder, 'clips'), { recursive: true });
  for (const n of [1, 2]) fs.writeFileSync(path.join(folder, 'clips', `clip0${n}_v1.mp4`), 'video' + n);
  fs.writeFileSync(path.join(folder, 'clips', 'clip02_v1_cover.jpg'), 'jpg');
  const p = { id: 'v1', title: 'Talk', status: 'done',
    clips: [clip(1, 50), { ...clip(2, 80), description: 'Watch this #money', reason: 'Bold hook', text: 'x'.repeat(500), cover: 'clips/clip02_v1_cover.jpg' }] };

  const s = starnet.summary(p, folder);
  assert.deepStrictEqual(s.clips.map((c) => [c.n, c.seconds, c.file]), [[2, 30, path.join(folder, 'clips', 'clip02_v1.mp4')], [1, 30, path.join(folder, 'clips', 'clip01_v1.mp4')]]);
  assert.deepStrictEqual([s.clips[0].caption, s.clips[0].why, s.clips[0].said.length, s.clips[0].cover], ['Watch this #money', 'Bold hook', 401, path.join(folder, 'clips', 'clip02_v1_cover.jpg')]);
  assert.strictEqual(s.note, undefined);
  assert.deepStrictEqual(starnet.summary(p, folder, 1).clips.map((c) => c.n), [2]);
  assert.match(starnet.summary({ ...p, status: 'rendering' }, folder).note, /Still working/);

  const ws = path.join(tmp, 'workspaces');
  fs.mkdirSync(path.join(ws, 'agent'), { recursive: true });
  await assert.rejects(starnet.sendToStarnet(p, folder, 'nobody', 0, { ws }), /Folders in Starnet: agent/);
  await assert.rejects(starnet.sendToStarnet(p, folder, '../x', 0, { ws }), /agent id/);
  await assert.rejects(starnet.sendToStarnet(p, folder, 'agent', 0, { ws: null }), /not found/);
  const r = await starnet.sendToStarnet(p, folder, 'agent', 1, { ws });
  assert.deepStrictEqual(r.files, [{ n: 2, title: 'T2', caption: 'Watch this #money', path: 'clipforge/v1/clip02.mp4', cover: 'clipforge/v1/clip02_cover.jpg' }]);
  assert.strictEqual(fs.readFileSync(path.join(ws, 'agent', 'clipforge', 'v1', 'clip02.mp4'), 'utf8'), 'video2');
  await starnet.sendToStarnet(p, folder, 'agent', 1, { ws }); // again: replaces, no error

  // over the limit: a smaller copy is made; without a way to shrink, it is flagged
  const shrunk = [];
  const small = await starnet.sendToStarnet(p, folder, 'agent', 0, { ws, limit: 3, shrink: async (from, to, secs, lim) => { shrunk.push([path.basename(from), secs, lim]); fs.writeFileSync(to, 's'); } });
  assert.deepStrictEqual(shrunk.map(([f, secs, lim]) => [f, Math.round(secs), lim]), [['clip02_v1.mp4', 30, 3], ['clip01_v1.mp4', 30, 3]]);
  assert.match(small.files[0].note, /made smaller/);
  assert.match((await starnet.sendToStarnet(p, folder, 'agent', 1, { ws, limit: 3 })).files[0].note, /too big/);
  const failed = await starnet.sendToStarnet(p, folder, 'agent', 1, { ws, limit: 3, shrink: async () => { throw new Error('no ffmpeg'); } });
  assert.match(failed.files[0].note, /could not make it smaller: no ffmpeg/);
});

test('fitKbps: a 60 s clip fits 20 MB; never below 300k', () => {
  const kbps = starnet.fitKbps(60);
  assert.ok(((kbps + 128) * 60 * 1000) / 8 < starnet.SEND_LIMIT && kbps > 2000, String(kbps));
  assert.strictEqual(starnet.fitKbps(100000), 300);
});

test('shortcut: finds the installed Starnet', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-'));
  const env = { APPDATA: tmp };
  assert.strictEqual(starnet.shortcut(env), null);
  const lnk = path.join(tmp, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StarNet', 'StarNet.lnk');
  fs.mkdirSync(path.dirname(lnk), { recursive: true });
  fs.writeFileSync(lnk, '');
  assert.strictEqual(starnet.shortcut(env), lnk);
});
