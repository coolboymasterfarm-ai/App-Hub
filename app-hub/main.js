const { app, BrowserWindow, WebContentsView, ipcMain, shell, dialog } = require('electron');
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
const APPS_DIR = () => path.join(app.getPath('userData'), 'apps'); // folder apps are copied here

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

// ---------------------------------------------------------------- one-click installs

// Apps the hub can install. Each runs hidden (no console window); its output streams to the hub page.
const INSTALLERS = {
  ollama: {
    name: 'Ollama',
    note: 'Runs the AI chat models on this PC (free). ClipForge uses it to pick and title clips.',
    installed: async () => fs.existsSync(ollamaExe()) || !!(await ollamaModels()),
    cmd: () => ['winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements --silent', {}],
    after: startOllama,
  },
  clipforge: {
    name: 'ClipForge',
    note: 'AI auto-clipper: long video in, short vertical clips out. Installs Python, ffmpeg and its tools (5-15 min).',
    installed: async () => cfReady(),
    // CF_SKIP_MODEL: the user picks a chat model that fits their PC in the AI Models tab instead.
    cmd: () => ['Install.bat', { cwd: CF_DIR, env: { ...process.env, CF_SKIP_MODEL: '1' } }],
    after: startClipForge,
  },
};
let installing = null;

const installLog = (id, line) => win && win.webContents.send('install:log', { id, line });

async function installState() {
  return Promise.all(Object.entries(INSTALLERS).map(async ([id, x]) =>
    ({ id, name: x.name, note: x.note, installed: await x.installed(), installing: installing === id })));
}

function runInstall(id) {
  const x = INSTALLERS[id];
  return new Promise((resolve) => {
    if (!x) return resolve({ ok: false, error: 'Unknown app.' });
    if (installing) return resolve({ ok: false, error: `${INSTALLERS[installing].name} is still installing.` });
    if (!WIN) return resolve({ ok: false, error: 'Installing runs on Windows only.' });
    installing = id;
    const [cmd, opts] = x.cmd();
    const p = spawn('cmd.exe', ['/d', '/c', cmd], { ...opts, windowsHide: true });
    p.stdin.end(); // answers Install.bat's "pause" so it never waits for a key
    let buf = '';
    const onData = (d) => {
      buf += d;
      const lines = buf.split(/[\r\n]+/);
      buf = lines.pop();
      for (const l of lines) if (l.trim()) installLog(id, l.trim());
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    const done = async (error) => {
      installing = null;
      if (buf.trim()) installLog(id, buf.trim());
      const ok = await x.installed();
      if (ok) await x.after();
      resolve(ok ? { ok } : { ok, error: error || `${x.name} did not finish installing. See the log for the reason.` });
    };
    p.on('exit', () => done());
    p.on('error', (e) => done(e.message));
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

// A folder app is copied into the hub, so it keeps working if the original folder moves.
function addApp(list, name, address) {
  const src = String(address || '').trim().replace(/^"(.*)"$/, '$1');
  if (!apps.isDir(src)) return apps.add(list, name, address);
  apps.entryHtml(src); // throws a readable error before anything is copied
  const dest = path.join(APPS_DIR(), Date.now().toString(36) + '-' + path.basename(src).replace(/[^\w.-]/g, '_'));
  fs.cpSync(src, dest, { recursive: true, filter: (f) => path.basename(f) !== 'node_modules' && path.basename(f) !== '.git' });
  return apps.add(list, name || path.basename(src), dest);
}

function removeApp(list, id) {
  const a = list.find((x) => x.id === id);
  if (a && a.url.startsWith('file:')) { // delete the hub's own copy, never a folder outside it
    const dir = path.relative(APPS_DIR(), require('url').fileURLToPath(a.url)).split(path.sep)[0];
    if (dir && dir !== '..' && !path.isAbsolute(dir)) fs.rmSync(path.join(APPS_DIR(), dir), { recursive: true, force: true });
  }
  return apps.remove(list, id);
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
ipcMain.handle('install:state', installState);
ipcMain.handle('install:run', (_e, id) => runInstall(id));
ipcMain.handle('models:overview', overview);
ipcMain.handle('models:download', (_e, kind, id) => download(kind, id));
ipcMain.handle('models:delete', (_e, kind, id) => remove(kind, id));
ipcMain.handle('models:use', (_e, kind, id) => use(kind, id));
ipcMain.handle('apps:list', () => apps.load(APPS_FILE()));
ipcMain.handle('apps:add', (_e, name, address) => tryApps((l) => addApp(l, name, address)));
ipcMain.handle('apps:remove', (_e, id) => { closeTab(id); return tryApps((l) => removeApp(l, id)); });
ipcMain.handle('apps:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose your app folder (with an index.html)', properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
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
