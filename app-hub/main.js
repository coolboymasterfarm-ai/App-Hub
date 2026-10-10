const { app, BrowserWindow, WebContentsView, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const hardware = require('./src/hardware');
const models = require('./src/models');
const apps = require('./src/apps');

const PORT = 8765;
const WIN = process.platform === 'win32';
const HEADER = 56; // px, the hub's tab bar; app tabs fill the rest

// In the repo, ClipForge sits next to app-hub. In the installed .exe it ships in resources/ and is
// copied to %LOCALAPPDATA%\App Hub\ClipForge, because setup writes its Python, tools and models
// next to it (Program Files is read-only, and Roaming is the wrong place for gigabytes).
const CF_SRC = app.isPackaged ? path.join(process.resourcesPath, 'ClipForge') : path.join(__dirname, '..', 'ClipForge');
const CF_DIR = app.isPackaged
  ? path.join(process.env.LOCALAPPDATA || app.getPath('userData'), 'App Hub', 'ClipForge')
  : CF_SRC;
const PY = WIN ? path.join(CF_DIR, '.venv', 'Scripts', 'python.exe') : path.join(CF_DIR, '.venv', 'bin', 'python');
const CF_SETTINGS = path.join(CF_DIR, 'data', 'settings.json');
const WHISPER_DIR = path.join(CF_DIR, 'data', 'models', 'whisper');
const OLLAMA = 'http://127.0.0.1:11434';
const APPS_FILE = () => path.join(app.getPath('userData'), 'apps.json');

let server = null;
let win = null;
const views = new Map(); // app id -> WebContentsView

// ---------------------------------------------------------------- ClipForge

function syncClipForge() {
  if (!app.isPackaged) return;
  const mark = path.join(CF_DIR, '.hub-version');
  if (fs.existsSync(mark) && fs.readFileSync(mark, 'utf8') === app.getVersion()) return;
  // New hub version: refresh the code. .venv, bin, node_modules and data/ are not in the source, so they stay.
  fs.cpSync(CF_SRC, CF_DIR, { recursive: true, force: true });
  fs.writeFileSync(mark, app.getVersion());
}

const cfReady = () => fs.existsSync(PY);

function startClipForge() {
  if (server || !cfReady()) return;
  server = spawn(PY, ['-m', 'clipforge', '--port', String(PORT)], { cwd: CF_DIR, stdio: 'inherit', windowsHide: true });
  server.on('exit', (c) => { console.error('ClipForge server exited', c); server = null; });
}

// Runs ClipForge's own Install.bat in a console window the user can watch.
function runSetup() {
  return new Promise((resolve) => {
    if (!WIN) return resolve({ ok: false, error: 'Setup runs on Windows only.' });
    // CF_SKIP_MODEL: the user picks a chat model that fits their PC in the Models tab instead.
    const p = spawn('cmd.exe', ['/c', 'start "ClipForge setup" /wait cmd /c Install.bat'],
      { cwd: CF_DIR, windowsVerbatimArguments: true, env: { ...process.env, CF_SKIP_MODEL: '1' } });
    p.on('exit', () => { startClipForge(); resolve({ ok: cfReady() }); });
    p.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

// ---------------------------------------------------------------- Ollama

async function ollama(pathname, opts = {}) {
  return fetch(OLLAMA + pathname, { ...opts, signal: opts.signal || AbortSignal.timeout(4000) });
}

async function ollamaModels() {
  try { return ((await (await ollama('/api/tags')).json()).models || []).map((m) => m.name); } catch { return null; }
}

function ollamaExe() {
  const local = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
  return WIN && fs.existsSync(local) ? local : 'ollama';
}

async function startOllama() {
  if (await ollamaModels()) return;
  const p = spawn(ollamaExe(), ['serve'], { detached: true, stdio: 'ignore', windowsHide: true });
  p.on('error', () => {}); // not installed: the Models tab offers to install it
  p.unref();
}

function installOllama() {
  return new Promise((resolve) => {
    if (!WIN) return resolve({ ok: false, error: 'Install Ollama from https://ollama.com' });
    const p = spawn('cmd.exe', ['/c', 'start "Install Ollama" /wait winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements'],
      { windowsVerbatimArguments: true });
    p.on('exit', async () => { await startOllama(); resolve({ ok: true }); });
    p.on('error', (e) => resolve({ ok: false, error: e.message }));
  });
}

// ---------------------------------------------------------------- models

const progress = (kind, id, text, pct) => win && win.webContents.send('models:progress', { kind, id, text, pct });
const ollamaHas = (installed, id) => installed.some((n) => n === id || n === id + ':latest');

function whisperDirs() {
  try { return fs.readdirSync(WHISPER_DIR); } catch { return []; }
}

function whisperInstalled(id) {
  const dir = whisperDirs().find((d) => new RegExp(`faster-whisper-${id.replace(/\./g, '\\.')}(-ct2)?$`).test(d));
  if (!dir) return false;
  try { // a finished HF download has snapshots/<hash>/model.bin
    const snaps = path.join(WHISPER_DIR, dir, 'snapshots');
    return fs.readdirSync(snaps).some((s) => fs.existsSync(path.join(snaps, s, 'model.bin')));
  } catch { return false; }
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(CF_SETTINGS, 'utf8')); } catch { return {}; }
}

function writeSettings(patch) {
  const cur = { ...readSettings(), ...patch };
  fs.mkdirSync(path.dirname(CF_SETTINGS), { recursive: true });
  fs.writeFileSync(CF_SETTINGS + '.tmp', JSON.stringify(cur, null, 2));
  fs.renameSync(CF_SETTINGS + '.tmp', CF_SETTINGS);
}

async function overview() {
  const [hw, installed] = await Promise.all([hardware.detect(fs.existsSync(CF_DIR) ? CF_DIR : app.getPath('userData')), ollamaModels()]);
  const rec = models.recommend(hw);
  const s = readSettings();
  for (const m of rec.whisper) { m.installed = whisperInstalled(m.id); m.inUse = s.whisper_model === m.id; }
  for (const m of rec.chat) {
    m.installed = !!installed && ollamaHas(installed, m.id);
    m.inUse = !!s.ollama_model && (s.ollama_model === m.id || s.ollama_model === m.id + ':latest');
  }
  return { hw, ...rec, ollama: !!installed, cfReady: cfReady(), whisperAuto: !s.whisper_model || s.whisper_model === 'auto' };
}

async function pullOllama(id) {
  const r = await ollama('/api/pull', { method: 'POST', body: JSON.stringify({ model: id, stream: true }), signal: AbortSignal.timeout(6 * 3600e3) });
  if (!r.ok) throw new Error(`Ollama said ${r.status}`);
  let buf = '';
  for await (const chunk of r.body) {
    buf += Buffer.from(chunk).toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const ev = JSON.parse(line);
      if (ev.error) throw new Error(ev.error);
      progress('ollama', id, ev.status, ev.total ? ev.completed / ev.total : null);
    }
  }
}

function pullWhisper(id) {
  return new Promise((resolve, reject) => {
    if (!cfReady()) return reject(new Error('Run the ClipForge setup first.'));
    fs.mkdirSync(WHISPER_DIR, { recursive: true });
    progress('whisper', id, 'downloading', null);
    // Same call and folder ClipForge uses (transcribe._load), so it finds the files later.
    const code = 'import sys; from faster_whisper import download_model; download_model(sys.argv[1], cache_dir=sys.argv[2])';
    const p = spawn(PY, ['-c', code, id, WHISPER_DIR], { cwd: CF_DIR, windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(err.trim().split('\n').pop() || `exit ${c}`))));
  });
}

async function download(kind, id) {
  try {
    if (kind === 'ollama') {
      if (!(await ollamaModels())) throw new Error('Ollama is not running. Install or start it first.');
      await pullOllama(id);
    } else await pullWhisper(id);
    progress(kind, id, 'done', 1);
    return { ok: true };
  } catch (e) {
    progress(kind, id, 'failed', null);
    return { ok: false, error: e.message };
  }
}

async function remove(kind, id) {
  try {
    if (kind === 'ollama') {
      const r = await ollama('/api/delete', { method: 'DELETE', body: JSON.stringify({ model: id }) });
      if (!r.ok) throw new Error(`Ollama said ${r.status}`);
    } else {
      for (const d of whisperDirs().filter((d) => d.endsWith('faster-whisper-' + id) || d.endsWith('faster-whisper-' + id + '-ct2'))) {
        fs.rmSync(path.join(WHISPER_DIR, d), { recursive: true, force: true });
      }
    }
    const s = readSettings();
    if (kind === 'ollama' && s.ollama_model === id) writeSettings({ ollama_model: '' });
    if (kind === 'whisper' && s.whisper_model === id) writeSettings({ whisper_model: 'auto' });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

function use(kind, id) {
  // ClipForge re-reads settings.json on every job, so no restart needed.
  writeSettings(kind === 'ollama' ? { ollama_model: id, ai_provider: 'auto' } : { whisper_model: id });
  return { ok: true };
}

// ---------------------------------------------------------------- app tabs

function viewBounds() {
  const [w, h] = win.getContentSize();
  return { x: 0, y: HEADER, width: w, height: Math.max(0, h - HEADER) };
}

function showTab(id) {
  for (const [vid, v] of views) v.setVisible(vid === id);
  if (!id || views.has(id)) return;
  const a = apps.load(APPS_FILE()).find((x) => x.id === id);
  if (!a) return;
  const v = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  v.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.contentView.addChildView(v);
  v.setBounds(viewBounds());
  v.webContents.loadURL(a.url).catch((e) => console.error('Could not load', a.url, e.message));
  views.set(id, v);
}

function closeTab(id) {
  const v = views.get(id);
  if (!v) return;
  win.contentView.removeChildView(v);
  v.webContents.close();
  views.delete(id);
}

function tryApps(fn) {
  try {
    const list = fn(apps.load(APPS_FILE()));
    apps.save(APPS_FILE(), list);
    return { ok: true, apps: list };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ---------------------------------------------------------------- window

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, title: 'App Hub', backgroundColor: '#0f0f0f',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  win.loadFile('index.html');
  win.on('resize', () => { for (const v of views.values()) v.setBounds(viewBounds()); });
}

ipcMain.on('start-clipforge', startClipForge);
ipcMain.on('open-app', (_e, id) => { if (id === 'clipforge') { startClipForge(); win && win.webContents.send('switch-tab', 'clipforge'); } });
ipcMain.handle('hub:status', () => ({ cfReady: cfReady(), cfDir: CF_DIR }));
ipcMain.handle('hub:setup', runSetup);
ipcMain.handle('ollama:install', installOllama);
ipcMain.handle('models:overview', overview);
ipcMain.handle('models:download', (_e, kind, id) => download(kind, id));
ipcMain.handle('models:delete', (_e, kind, id) => remove(kind, id));
ipcMain.handle('models:use', (_e, kind, id) => use(kind, id));
ipcMain.handle('apps:list', () => apps.load(APPS_FILE()));
ipcMain.handle('apps:add', (_e, name, address) => tryApps((l) => apps.add(l, name, address)));
ipcMain.handle('apps:remove', (_e, id) => { closeTab(id); return tryApps((l) => apps.remove(l, id)); });
ipcMain.on('tab:show', (_e, id) => showTab(id));
ipcMain.on('tab:close', (_e, id) => closeTab(id));

app.whenReady().then(() => {
  try { syncClipForge(); } catch (e) { console.error('Could not copy ClipForge:', e.message); }
  startOllama();
  startClipForge();
  createWindow();
});
app.on('before-quit', () => { if (server) server.kill(); });
app.on('window-all-closed', () => app.quit());
