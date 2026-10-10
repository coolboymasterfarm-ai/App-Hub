const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { recommend } = require('../src/models');
const apps = require('../src/apps');

const pick = (r) => [r.whisper.find((m) => m.recommended).id, r.chat.find((m) => m.recommended)?.id];

test('recommends by hardware', () => {
  assert.deepStrictEqual(pick(recommend({ ramGB: 32, cores: 16, gpus: [{ name: 'RTX 4090', vramGB: 24, nvidia: true }] })), ['large-v3-turbo', 'qwen3:14b']);
  assert.deepStrictEqual(pick(recommend({ ramGB: 16, cores: 8, gpus: [{ name: 'RTX 3060', vramGB: 12, nvidia: true }] })), ['large-v3-turbo', 'qwen3:8b']);
  assert.deepStrictEqual(pick(recommend({ ramGB: 16, cores: 8, gpus: [{ name: 'Intel UHD', vramGB: 1, nvidia: false }] })), ['small', 'qwen3:4b']);
  assert.deepStrictEqual(pick(recommend({ ramGB: 4, cores: 2, gpus: [] })), ['base', undefined]);
  const amd = recommend({ ramGB: 16, cores: 8, gpus: [{ name: 'RX 7800', vramGB: 16, nvidia: false }] });
  assert.strictEqual(amd.whisper.find((m) => m.id === 'large-v3-turbo').fit, 'slow'); // Whisper GPU is NVIDIA-only
});

test('address checks', () => {
  assert.strictEqual(apps.toUrl('https://example.com'), 'https://example.com/');
  assert.strictEqual(apps.toUrl('localhost:3000'), 'http://localhost:3000/');
  assert.strictEqual(apps.toUrl('example.com/x'), 'https://example.com/x');
  assert.throws(() => apps.toUrl(''), /Type an address/);
  assert.throws(() => apps.toUrl('not a url'), /Use a web address/);
  assert.throws(() => apps.toUrl('C:/nope/missing.html'), /does not exist/);
  const f = path.join(os.tmpdir(), 'apphub-test.html');
  fs.writeFileSync(f, '<p>hi</p>');
  assert.match(apps.toUrl(f), /^file:\/\//);
});

test('app list add/remove/save/load', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apphub-')), 'apps.json');
  assert.deepStrictEqual(apps.load(file), []);
  let list = apps.add([], ' Notes ', 'https://example.com');
  assert.strictEqual(list[0].name, 'Notes');
  assert.throws(() => apps.add(list, '', 'https://x.com'), /name/);
  apps.save(file, list);
  assert.deepStrictEqual(apps.load(file), list);
  list = apps.remove(list, list[0].id);
  assert.deepStrictEqual(list, []);
  fs.writeFileSync(file, '{broken');
  assert.deepStrictEqual(apps.load(file), []);
});

test('folder apps', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apphub-folder-'));
  assert.throws(() => apps.toUrl(dir), /index\.html/);
  fs.writeFileSync(path.join(dir, 'game.html'), '<p>only page</p>');
  assert.match(apps.toUrl(dir), /game\.html$/);
  fs.writeFileSync(path.join(dir, 'other.html'), '');
  assert.throws(() => apps.entryHtml(dir), /index\.html/);
  fs.writeFileSync(path.join(dir, 'index.html'), '');
  assert.match(apps.toUrl(dir), /index\.html$/);
});

test('app update', () => {
  const list = apps.add([], 'Notes', 'https://example.com');
  const id = list[0].id;
  const renamed = apps.update([{ ...list[0], icon: 'https://example.com/f.ico' }], id, ' Docs ', list[0].url);
  assert.strictEqual(renamed[0].name, 'Docs');
  assert.strictEqual(renamed[0].icon, 'https://example.com/f.ico');            // same address keeps the icon
  const moved = apps.update(renamed, id, 'Docs', 'https://other.example');
  assert.strictEqual(moved[0].url, 'https://other.example/');
  assert.strictEqual(moved[0].icon, undefined);                               // new address, new icon
  assert.throws(() => apps.update(list, id, '', 'https://x.com'), /name/);
  assert.throws(() => apps.update(list, 'nope', 'X', 'https://x.com'), /gone/);
  assert.throws(() => apps.update(list, id, 'X', 'not a url'), /Use a web address/);
});
