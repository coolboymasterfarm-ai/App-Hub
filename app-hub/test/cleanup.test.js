const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { plan, run, freedBytes, sizeText } = require('../src/cleanup');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 11);
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-'));
  const projects = path.join(root, 'projects'), ws = path.join(root, 'workspaces');
  const video = (id, status, daysOld, bytes) => {
    const d = path.join(projects, id, 'clips');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(projects, id, 'project.json'), JSON.stringify({ id, title: 'T ' + id, status, created: (NOW - daysOld * DAY) / 1000 }));
    fs.writeFileSync(path.join(d, 'clip01_v1.mp4'), Buffer.alloc(bytes));
    return path.join(d, 'clip01_v1.mp4');
  };
  return { root, projects, ws, video };
}

test('cleanup: old finished videos and their Starnet copies; never a video being made', () => {
  const { root, projects, ws, video } = setup();
  const oldClip = video('old', 'done', 40, 5000);
  video('new', 'done', 2, 7000);
  video('busy', 'rendering', 90, 9000);              // still being made: kept however old
  video('failed', 'error', 31, 1000);
  const copy = path.join(ws, 'agent', 'clipforge', 'old');
  fs.mkdirSync(copy, { recursive: true });
  fs.linkSync(oldClip, path.join(copy, 'clip01.mp4')); // a hard link: no extra space
  fs.writeFileSync(path.join(copy, 'clip01_small.mp4'), Buffer.alloc(300)); // a real copy (made smaller for Telegram)
  const p = plan({ projects, workspaces: ws, days: 30, now: NOW });
  assert.deepStrictEqual(p.videos.map((v) => v.id).sort(), ['failed', 'old']);
  assert.deepStrictEqual(p.copies.map((c) => c.id), ['old']);
  assert.strictEqual(p.bytes, 5000 + 1000 + 300 + fs.statSync(path.join(projects, 'old', 'project.json')).size
    + fs.statSync(path.join(projects, 'failed', 'project.json')).size);
  assert.strictEqual(plan({ projects, workspaces: ws, days: 0, now: NOW }).videos.length, 3); // every finished one
  const r = run({ projects, workspaces: ws, days: 30, now: NOW });
  assert.deepStrictEqual([r.videos, r.copies, r.deleted], [2, 1, 3]);
  assert.deepStrictEqual(fs.readdirSync(projects).sort(), ['busy', 'new']);
  assert.ok(!fs.existsSync(copy));
  fs.rmSync(root, { recursive: true, force: true });
});

test('cleanup: a hard-linked file counts only when every link goes', () => {
  const { root, projects, video } = setup();
  const clip = video('a', 'done', 1, 4000);
  const other = path.join(root, 'elsewhere');
  fs.mkdirSync(other);
  fs.linkSync(clip, path.join(other, 'same.mp4'));
  assert.strictEqual(freedBytes([path.join(projects, 'a', 'clips')]), 0);           // the other link keeps it
  assert.strictEqual(freedBytes([path.join(projects, 'a', 'clips'), other]), 4000);
  assert.strictEqual(plan({ projects: path.join(root, 'nope'), workspaces: null, days: 30, now: NOW }).bytes, 0); // missing folders
  assert.deepStrictEqual([sizeText(3.2e9), sizeText(45e6), sizeText(900)], ['3.2 GB', '45 MB', '1 KB']);
  fs.rmSync(root, { recursive: true, force: true });
});
