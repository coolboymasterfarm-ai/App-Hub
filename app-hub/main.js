const { app, BrowserWindow, WebContentsView, Notification, ipcMain, screen, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const hardware = require('./src/hardware');
const models = require('./src/models');
const apps = require('./src/apps');
const agentapi = require('./src/agentapi');
const starnet = require('./src/starnet');
const sleep = require('./src/sleep');
const myapps = require('./src/myapps');
myapps.BUNDLED.dir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'); // Grammar, Agent Dashboard
const cleanup = require('./src/cleanup');
const telegram = require('./src/telegram');
const discord = require('./src/discord');
const keylog = require('./src/keylog');
const appconn = require('./src/appconnectors');

const PORT = 8765;
const WIN = process.platform === 'win32';
const CF_URL = `http://127.0.0.1:${PORT}`;

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
const USER = (f) => path.join(app.getPath('userData'), f);

let server = null;
let win = null;
const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);

// ---------------------------------------------------------------- ClipForge

function syncClipForge() {
  if (!app.isPackaged) return;
  // Refresh the code on every start (it's small), so a rebuilt installer at the same version still
  // brings new ClipForge code. .venv, bin, node_modules and data/ are not in the source, so they stay.
  // preserveTimestamps: unchanged files keep their date, so Python doesn't recompile all of ClipForge each start
  fs.cpSync(CF_SRC, CF_DIR, { recursive: true, force: true, preserveTimestamps: true });
}

const cfReady = () => fs.existsSync(PY);

function startClipForge() {
  if (server || !cfReady()) return;
  // Its output goes to a log file (Settings > Open ClipForge log) - there is no console to show it.
  const log = fs.openSync(USER('clipforge.log'), 'w');
  server = spawn(PY, ['-m', 'clipforge', '--port', String(PORT)], { cwd: CF_DIR, stdio: ['ignore', log, log], windowsHide: true });
  server.on('exit', (c) => { console.error('ClipForge server exited', c); server = null; cfPoll(); });
  fs.closeSync(log);
}

// yt-dlp has to keep up with YouTube's changes; an old copy downloads slowly or not at all.
// It also keeps PyAV below 19, which breaks transcription (see ClipForge/requirements.txt).
// ClipForge's Python is made by uv (no pip in it), so update through uv - wherever Install.bat found it.
// Checked at most once a day (a stamp file marks the last good check), so ClipForge starts right away otherwise.
let updating = false;
function updateYtDlp(then) {
  const stamp = USER('yt-dlp-checked');
  try { if (Date.now() - fs.statSync(stamp).mtimeMs < 864e5) return then(); } catch { /* never checked */ }
  const uv = [path.join(CF_DIR, 'bin', WIN ? 'uv.exe' : 'uv'), path.join(os.homedir(), '.local', 'bin', WIN ? 'uv.exe' : 'uv')]
    .find((f) => fs.existsSync(f)) || 'uv';
  updating = true;
  const p = spawn(uv, ['pip', 'install', '--python', PY, '--upgrade', 'yt-dlp[default]', 'av<19'], { cwd: CF_DIR, windowsHide: true, stdio: 'ignore' });
  const timer = setTimeout(() => p.kill(), 90000); // offline or stuck: start ClipForge anyway
  const done = () => { if (!updating) return; updating = false; clearTimeout(timer); then(); };
  p.on('exit', (code) => {
    if (code === 0) try { fs.writeFileSync(stamp, ''); } catch { /* checks again next start */ }
    done();
  });
  p.on('error', done); // no uv: keep the yt-dlp that's there
}

// The whole tree: ClipForge's ffmpeg and HyperFrames (node + Chrome) would otherwise keep running on Windows.
// detached, or Electron's exit would take taskkill down with it.
const stopServer = () => (WIN
  ? spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true, detached: true, stdio: 'ignore' }).on('error', () => server && server.kill())
  : server.kill());

function restartClipForge() {
  if (!server) return startClipForge();
  server.once('exit', () => startClipForge());
  stopServer();
}

// The hub watches ClipForge: its state for the ClipForge page, recent videos for Home,
// and a desktop notification when a video finishes (or fails).
let cfLast = { state: 'starting', projects: [] };
const seen = new Map(); // project id -> last status
let primed = false;     // the first look only records, so old videos don't all notify at start

let cfBusy = false, cfMisses = 0, cfTick = 0;
let cfSent = ''; // what the page last got: it's only sent again when something changed
async function cfPoll() {
  if (cfBusy) return; // a slow answer is still on its way
  // minimized or hidden: every 15 s instead of 3 (agents' waits read the video files, not this)
  if (win && !win.isDestroyed() && (win.isMinimized() || !win.isVisible()) && ++cfTick % 5) return;
  cfBusy = true;
  try {
    let state = 'ready', projects = [];
    if (!cfReady()) state = 'not-installed';
    else if (!server) state = updating ? 'starting' : 'stopped';
    else {
      try {
        projects = await (await fetch(CF_URL + '/api/projects', { signal: AbortSignal.timeout(3000) })).json();
        cfMisses = 0;
      } catch {
        // busy rendering, not gone: keep the last state through two slow answers, so its page isn't reloaded
        if (cfLast.state === 'ready' && ++cfMisses < 3) return;
        state = 'starting';
      }
    }
    if (state === 'ready') notifyFinished(projects);
    cfLast = { state, url: CF_URL, projects: projects.slice(0, 12) };
    const j = JSON.stringify(cfLast);
    if (j !== cfSent) { cfSent = j; send('cf:state', cfLast); }
  } finally { cfBusy = false; }
}

function notifyFinished(projects) {
  for (const p of projects) {
    const was = seen.get(p.id);
    seen.set(p.id, p.status);
    if (!primed || !was || was === p.status || !['done', 'error'].includes(p.status)) continue;
    if (p.status === 'done' && hubSettings().starnetDrop) dropForStarnet(p.id);
    if (p.status === 'done') tellTelegram(p.id);
    if (!hubSettings().notifications || !Notification.isSupported()) continue;
    if (win && win.isFocused() && page === 'clipforge') continue; // they're looking at it
    const n = p.status === 'done'
      ? new Notification({ title: 'Your clips are ready', body: `${p.title} · ${p.clips} clip${p.clips === 1 ? '' : 's'}` })
      : new Notification({ title: "ClipForge couldn't finish a video", body: `${p.title}: ${p.error || 'open it to see why'}` });
    n.on('click', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); send('cf:open', p.id); } });
    n.show();
  }
  primed = true;
}

// ---------------------------------------------------------------- hub settings

// agent*: which apps agents may use through the App Hub API (src/agentapi.js)
// starnetDrop: leave a note in DROP_DIR when a video finishes, for a Starnet folder trigger
// telegramOn: send a short Telegram message too (telegramToken + telegramChat, set in Settings)
// discordOn: post the same message to a Discord channel (discordHook: its webhook address)
const HUB_DEFAULTS = { notifications: true, agentClipforge: true, agentModels: true, agentApps: true, agentMyapps: true, starnetDrop: false, telegramOn: false, discordOn: false };

// Read once and kept: App Hub is the only writer (every agent request asks for the keys and switches).
let hubCache = null;
function hubSettings() {
  if (hubCache) return { ...hubCache };
  let s;
  try { s = { ...HUB_DEFAULTS, ...JSON.parse(fs.readFileSync(USER('hub-settings.json'), 'utf8')) }; }
  catch { s = { ...HUB_DEFAULTS }; }
  // agentKey reaches every app; appKeys.<app> only that app (also every app the user added). keyMade.<scope>: when
  // that key was made (its expiry counts from then); keyDays.<scope>: how long it lives (0: always).
  if (!s.agentKey) s.agentKey = agentapi.newKey();
  if (appconn.syncKeys(s, connectors().map((c) => c.scope).filter((x) => x !== 'all'), agentapi.newKey)) {
    apps.save(USER('hub-settings.json'), s);
  }
  hubCache = s;
  return { ...s };
}
// After an app is added or removed: its key is made or deleted at once.
function syncAppKeys() { hubCache = null; hubSettings(); }
const keysOf = (s) => ({ all: s.agentKey, ...s.appKeys });

// The connectors agents can add: all apps in one, or one per app with its own key (id: the Starnet connector id).
const CONNECTORS = [
  { scope: 'all', title: 'All apps', path: '/mcp', id: 'apphub' },
  { scope: 'clipforge', title: 'ClipForge', path: '/mcp/clipforge', id: 'clipforge', sw: 'agentClipforge' },
  { scope: 'models', title: 'AI Models', path: '/mcp/models', id: 'aimodels', sw: 'agentModels' },
  { scope: 'apps', title: 'Other Apps', path: '/mcp/apps', id: 'otherapps', sw: 'agentApps' },
  { scope: 'myapps', title: 'My Apps', path: '/mcp/myapps', id: 'myapps', sw: 'agentMyapps' },
];

// The built-in connectors, then one for every app the user added (its own key, Starnet id from its name).
const connectors = () => [...CONNECTORS, ...appconn.userConnectors(apps.load(APPS_FILE()), CONNECTORS)];

// What an agent needs to connect: each connector's address and key, a ready-made MCP config for Claude Code
// (one server per app), and the last agent that connected to each.
const lastAgent = {}; // scope -> { name, at }
function agentInfo(s) {
  const keys = keysOf(s);
  const base = `http://127.0.0.1:${agentapi.PORT}`;
  return {
    url: base, lastAgent, starnet: starnet.workspaces(), starnetApp: !!starnet.shortcut(), dropDir: DROP_DIR(),
    connectors: connectors().map((c) => ({ ...c, url: base + c.path, key: keys[c.scope], lastUsed: agentLog.lastUsed[c.scope] || null,
      days: (s.keyDays || {})[c.scope] || 0, expires: keylog.expiresAt((s.keyMade || {})[c.scope], (s.keyDays || {})[c.scope]) })),
    calls: agentLog.calls,
    // runs the connector with App Hub's own Node; mcp.js reads the current key, APP_HUB_KEY is the fallback
    mcp: { mcpServers: Object.fromEntries(connectors().filter((c) => c.scope !== 'all').map((c) => [c.id, {
      command: process.execPath, args: [USER('mcp.js')],
      env: { ELECTRON_RUN_AS_NODE: '1', APP_HUB_APP: c.scope, APP_HUB_KEY: keys[c.scope] },
    }])) },
  };
}

function hubInfo() {
  const settings = hubSettings();
  settings.telegramToken = telegram.mask(settings.telegramToken); // the page never gets the whole token
  settings.discordHook = discord.mask(settings.discordHook);
  return {
    version: app.getVersion(), cfDir: CF_DIR, platform: process.platform, settings,
    openAtLogin: app.getLoginItemSettings().openAtLogin, agent: agentInfo(settings),
  };
}

function setHub(patch) {
  const s = hubSettings();
  for (const k of Object.keys(HUB_DEFAULTS)) if (k in patch) s[k] = !!patch[k];
  if (patch.keyDays && connectors().some((c) => c.scope === patch.keyDays.scope) && keylog.DAYS.includes(Number(patch.keyDays.days))) {
    s.keyDays = { ...s.keyDays, [patch.keyDays.scope]: Number(patch.keyDays.days) };
  }
  if (patch.discord) { // { hook (empty: keep the saved one) }
    const hook = String(patch.discord.hook || '').trim() || s.discordHook;
    discord.check(hook);
    Object.assign(s, { discordHook: hook, discordOn: true });
  }
  if (patch.telegram) { // { token (empty: keep the saved one), chat } - checked before it's saved
    const token = String(patch.telegram.token || '').trim() || s.telegramToken, chat = String(patch.telegram.chat || '').trim();
    telegram.check(token, chat);
    Object.assign(s, { telegramToken: token, telegramChat: chat, telegramOn: true });
  }
  // a new key for one connector; the old one stops working at once
  const reset = connectors().find((c) => c.scope === patch.resetKey);
  if (reset) {
    if (reset.scope === 'all') s.agentKey = agentapi.newKey();
    else s.appKeys = { ...s.appKeys, [reset.scope]: agentapi.newKey(reset.scope) };
    s.keyMade = { ...s.keyMade, [reset.scope]: Date.now() };
    delete lastAgent[reset.scope];
  }
  apps.save(USER('hub-settings.json'), s);
  hubCache = s;
  // Start-with-Windows lives in Windows itself, not in our file.
  if ('openAtLogin' in patch) app.setLoginItemSettings({ openAtLogin: !!patch.openAtLogin });
  return hubInfo();
}

// Folders the Settings page may open - by name, so the page can't ask for any path.
const FOLDERS = {
  clips: () => path.join(CF_DIR, 'data', 'projects'),
  music: () => path.join(CF_DIR, 'data', 'music'),
  hub: () => app.getPath('userData'),
  log: () => USER('clipforge.log'),
  drop: () => (fs.mkdirSync(DROP_DIR(), { recursive: true }), DROP_DIR()),
  starnet: () => starnet.shortcut() || '', // opening the shortcut starts Starnet
};

let hwCache = null; // hardware doesn't change while the app runs
const hwSummary = () => (hwCache = hwCache || hardware.detect(fs.existsSync(CF_DIR) ? CF_DIR : app.getPath('userData')));

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
  const [hw, installed] = await Promise.all([hwSummary(), ollamaModels()]);
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

// ---------------------------------------------------------------- My Apps (StarNet, FreeLLMAPI, OmniRoute)

// Each has its own program and serves its own page on this PC. App Hub starts the program (hidden where it can)
// and shows that page in a tab, like any other app. They keep running after App Hub closes - other tools use them.
const mineUrls = new Map(); // 'my-starnet' etc. -> the address its page is on, once it answered
// Quick check for the Home tiles; the start loop waits longer, since OmniRoute's first page can take a few seconds.
const alive = async (url, ms = 1500) => { try { await fetch(url, { signal: AbortSignal.timeout(ms) }); return true; } catch { return false; } };

// The app's program: where we know to look, else where its Start menu / desktop shortcut points
// (an update that moved the app keeps its shortcut up to date).
function exeOf(a) {
  if (a.exe) return a.exe;
  for (const lnk of a.shortcuts) {
    try { const t = shell.readShortcutLink(lnk).target; if (t && fs.existsSync(t)) return t; } catch { /* not a shortcut we can read */ }
  }
  return null;
}

async function mineState() {
  return Promise.all(Object.entries(myapps.myApps()).map(async ([key, a]) => {
    const url = a.url();
    return { id: 'my-' + key, name: a.name, icon: a.icon, note: a.note, installed: !!exeOf(a), running: mineUrls.get('my-' + key) === url || (!!url && await alive(url)) };
  }));
}

// StarNet picks a new port each start: a tab still on the old address is closed, and reopens at the new one.
function setMineUrl(id, url) {
  if (mineUrls.get(id) !== url) closeView(id);
  mineUrls.set(id, url);
  return { ok: true };
}

const mineStarting = new Map(); // id -> the start already under way, so two clicks start it once
function startMine(id) {
  if (!mineStarting.has(id)) mineStarting.set(id, startMineNow(id).finally(() => mineStarting.delete(id)));
  return mineStarting.get(id);
}
async function startMineNow(id) {
  const a = myapps.myApps()[String(id).replace(/^my-/, '')];
  if (!a) return { ok: false, error: 'Unknown app.' };
  let url = a.url();
  // wait the long time here too: a busy app that answers slowly must not get a second copy started
  if (url && await alive(url, 5000)) return setMineUrl(id, url);
  const exe = exeOf(a);
  if (!exe) return { ok: false, error: a.missing || `${a.name} isn't on this PC. Install it, then click Try again.` };
  // detached: it keeps running when App Hub closes. hidden: a console program (OmniRoute's Node) shows no window.
  const p = spawn(exe, a.args || [], { cwd: path.dirname(a.args && a.args[0] ? a.args[0] : exe), detached: true, stdio: 'ignore',
    windowsHide: !!a.hidden, env: { ...process.env, ...a.env } });
  let error = null;
  p.on('error', (e) => { error = e.message; });
  p.unref();
  const until = Date.now() + 120000; // a cold start of StarNet or OmniRoute takes 20-60 s
  while (Date.now() < until && !error) {
    await new Promise((r) => setTimeout(r, 1000));
    url = a.url();
    if (url && await alive(url, 5000)) return setMineUrl(id, url);
  }
  return { ok: false, error: error || `${a.name} didn't answer within 2 minutes. Open it from the Start menu once to see why.` };
}

// Stop and restart one My App (Settings > Writing Assistant > Restart).
function mineRestart(id) {
  const mineId = String(id).startsWith('my-') ? id : 'my-' + id;
  closeView(mineId);
  mineUrls.delete(mineId);
  return startMine(mineId);
}

// ---------------------------------------------------------------- pages and app tabs

let page = 'home';      // the page the hub shows: home | clipforge | models | settings | an app id
let viewRect = null;    // where app pages go, measured by the hub page (it owns the layout)
let covered = false;    // a hub dialog is open - native views would paint over it
const views = new Map(); // app id -> WebContentsView
const failed = new Map(); // app id -> { text, url } of a page that would not load
// Each open app is a whole web page in memory. Apps not looked at for a while go to sleep (closed, RAM freed)
// and come back at the same address when clicked. Apps playing sound stay awake.
const lastSeen = new Map(); // app id -> when it was last shown
const asleep = new Map();   // app id -> the address it was on
function sleepTabs() {
  const ids = sleep.toSleep([...views.keys()], { shown: page, lastSeen, now: Date.now(),
    audible: (id) => views.get(id).webContents.isCurrentlyAudible() });
  for (const id of ids) {
    const url = views.get(id).webContents.getURL();
    closeView(id);
    if (/^(https?|file):/i.test(url)) asleep.set(id, url);
  }
}

// Back/forward use webContents.canGoBack() etc., not webContents.navigationHistory: in Electron 31
// navigationHistory.canGoBack() never returns while a page is still loading, and freezes the app.

function layout() {
  for (const [id, v] of views) {
    const show = id === page && !covered && !failed.has(id) && !!viewRect;
    v.setVisible(show);
    if (show) v.setBounds(viewRect);
  }
}

function tabState(id) {
  const v = views.get(id);
  if (!v) return;
  const wc = v.webContents;
  send('tab:state', {
    id, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), failed: failed.has(id) ? failed.get(id).text : null,
    canBack: wc.canGoBack(), canForward: wc.canGoForward(),
  });
}

function showPage(id) {
  if (page && views.has(page)) lastSeen.set(page, Date.now()); // the page being left was seen until now
  page = id;
  lastSeen.set(id, Date.now());
  if (id && (id.startsWith('app-') || mineUrls.has(id)) && !views.has(id)) openView(id);
  sleepTabs();
  layout();
  tabState(id);
}

// A tab's app: one of My Apps (once started) or one the user added.
const findApp = (id) => (mineUrls.has(id) ? { id, url: mineUrls.get(id) } : apps.load(APPS_FILE()).find((x) => x.id === id));

function openView(id) {
  const a = findApp(id);
  if (!a) return;
  // spellcheck off: the dictionary is ~10 MB of RAM per tab and checks every key press in the app
  const v = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
  v.setBackgroundColor('#0a0b0e'); // the hub's colour while the app loads, not a white flash
  const wc = v.webContents;
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  wc.on('did-start-loading', () => { if (failed.delete(id)) layout(); tabState(id); });
  wc.on('did-stop-loading', () => tabState(id));
  wc.on('page-title-updated', () => tabState(id));
  wc.on('did-navigate-in-page', () => tabState(id));
  wc.on('did-fail-load', (_e, code, desc, url, main) => {
    if (!main || code === -3) return; // -3: the load was replaced by another one
    failed.set(id, { text: desc || `Error ${code}`, url });
    layout();
    tabState(id);
  });
  wc.on('page-favicon-updated', (_e, icons) => {
    const icon = icons.find((u) => /^https?:/i.test(u));
    if (icon && icon !== a.icon && id.startsWith('app-')) {
      a.icon = icon;
      const r = tryApps((list) => list.map((x) => (x.id === id ? { ...x, icon } : x)));
      if (r.ok) send('apps:changed', r.apps);
    }
  });
  hookKeys(wc);
  win.contentView.addChildView(v);
  views.set(id, v);
  wc.loadURL(asleep.get(id) || a.url).catch(() => {}); // failures arrive as did-fail-load
  asleep.delete(id);
}

function closeView(id) {
  const v = views.get(id);
  if (!v) return;
  win.contentView.removeChildView(v);
  v.webContents.close();
  views.delete(id);
  failed.delete(id);
  asleep.delete(id); // closing by hand forgets where it was
}

function navigate(id, action) {
  const v = views.get(id);
  if (!v) return;
  const wc = v.webContents;
  const a = findApp(id);
  if (action === 'back' && wc.canGoBack()) wc.goBack();
  else if (action === 'forward' && wc.canGoForward()) wc.goForward();
  else if (action === 'reload' && failed.has(id)) wc.loadURL(failed.get(id).url).catch(() => {});
  else if (action === 'reload') wc.reload();
  else if (action === 'home' && a) wc.loadURL(a.url).catch(() => {});
  else if (action === 'external' && /^https?:/i.test(wc.getURL() || (a && a.url))) shell.openExternal(wc.getURL() || a.url);
}

// Keyboard shortcuts work wherever the focus is: the hub page, the ClipForge frame or an app.
function shortcut(i) {
  if (i.type !== 'keyDown') return null;
  const c = i.control || i.meta, k = (i.key || '').toLowerCase();
  if (c && /^[1-9]$/.test(k)) return 'go:' + k;
  if (c && k === 'w') return 'close';
  if ((c && k === 'r') || k === 'f5') return 'reload';
  if (c && k === ',') return 'settings';
  if (c && k === 'tab') return i.shift ? 'prev' : 'next';
  if (i.alt && k === 'arrowleft') return 'back';
  if (i.alt && k === 'arrowright') return 'forward';
  return null;
}

function hookKeys(wc) {
  wc.on('before-input-event', (e, input) => {
    const a = shortcut(input);
    if (a) { e.preventDefault(); send('hub:shortcut', a); }
  });
}

// A folder app is copied into the hub, so it keeps working if the original folder moves.
function resolveAddress(address) {
  const src = String(address || '').trim().replace(/^"(.*)"$/, '$1');
  if (!apps.isDir(src)) return address;
  apps.entryHtml(src); // throws a readable error before anything is copied
  const dest = path.join(APPS_DIR(), Date.now().toString(36) + '-' + path.basename(src).replace(/[^\w.-]/g, '_'));
  fs.cpSync(src, dest, { recursive: true, filter: (f) => path.basename(f) !== 'node_modules' && path.basename(f) !== '.git' });
  return dest;
}

function addApp(list, name, address) {
  const src = String(address || '').trim().replace(/^"(.*)"$/, '$1');
  return apps.add(list, name || (apps.isDir(src) ? path.basename(src) : ''), resolveAddress(address));
}

// Deletes the hub's own copy of a folder app, never a folder outside it.
function dropCopy(a) {
  if (!a || !a.url.startsWith('file:')) return;
  const dir = path.relative(APPS_DIR(), require('url').fileURLToPath(a.url)).split(path.sep)[0];
  if (dir && dir !== '..' && !path.isAbsolute(dir)) fs.rmSync(path.join(APPS_DIR(), dir), { recursive: true, force: true });
}

function removeApp(list, id) {
  dropCopy(list.find((x) => x.id === id));
  return apps.remove(list, id);
}

function editApp(list, id, name, address) {
  const a = list.find((x) => x.id === id);
  if (!a) throw new Error('That app is gone.');
  const same = !String(address || '').trim() || address === a.url;
  const next = apps.update(list, id, name, same ? a.url : resolveAddress(address));
  if (!same) { dropCopy(a); closeView(id); }
  return next;
}

function tryApps(fn) {
  try {
    const list = fn(apps.load(APPS_FILE()));
    apps.save(APPS_FILE(), list);
    return { ok: true, apps: list };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ---------------------------------------------------------------- window

function savedBounds() {
  try {
    const b = JSON.parse(fs.readFileSync(USER('window.json'), 'utf8'));
    // only if it still lands on a screen (a monitor may have been unplugged)
    const on = screen.getAllDisplays().some(({ workArea: d }) =>
      b.x < d.x + d.width - 80 && b.x + b.width > d.x + 80 && b.y >= d.y - 10 && b.y < d.y + d.height - 80);
    return on && b.width >= 900 && b.height >= 600 ? b : null;
  } catch { return null; }
}

function createWindow() {
  const b = savedBounds();
  win = new BrowserWindow({
    width: 1360, height: 860, ...(b && { x: b.x, y: b.y, width: b.width, height: b.height }),
    minWidth: 900, minHeight: 600, title: 'App Hub', backgroundColor: '#0a0b0e', show: false,
    // our own title bar; Windows still draws its minimise/maximise/close buttons on top of it
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#0e1014', symbolColor: '#c9ced8', height: 44 },
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  if (b && b.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', () => {
    try { apps.save(USER('window.json'), { ...win.getNormalBounds(), maximized: win.isMaximized() }); } catch {}
  });
  hookKeys(win.webContents);
  win.loadFile('index.html');
}

ipcMain.handle('hub:info', hubInfo);
ipcMain.handle('hub:set', (_e, patch) => { try { return setHub(patch || {}); } catch (e) { return { error: e.message }; } });
ipcMain.handle('discord:test', async () => {
  try { await discord.send(hubSettings().discordHook, '✅ App Hub can post here. You\'ll get a note when ClipForge finishes a video.'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('telegram:test', async () => {
  const s = hubSettings();
  try { await telegram.send(s.telegramToken, s.telegramChat, '✅ App Hub can message you here. You\'ll get a note when ClipForge finishes a video.'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});
// Free up space (Settings): what would go, then delete it. ClipForge's own list drops deleted videos by itself.
const cleanOpts = (days) => ({ projects: PROJECTS(), workspaces: starnet.workspaces(), days: Number(days) || 0 });
ipcMain.handle('clean:plan', (_e, days) => {
  const p = cleanup.plan(cleanOpts(days));
  return { videos: p.videos.length, copies: p.copies.length, bytes: p.bytes, size: cleanup.sizeText(p.bytes) };
});
ipcMain.handle('clean:run', (_e, days) => { const r = cleanup.run(cleanOpts(days)); return { ...r, size: cleanup.sizeText(r.freed) }; });
// Writing Assistant: read/write its endpoint + API key, and restart its bundled server.
function writingConfigFile() { return USER('writing-assistant-config.json'); }
function writingConfig() { try { return JSON.parse(fs.readFileSync(writingConfigFile(), 'utf8')); } catch { return {}; } }
function writingStatus() {
  const s = mineState().find((m) => m.id === 'my-writing') || {};
  const cfg = writingConfig();
  return { state: s.state || 'stopped', running: !!s.running, port: s.port || null,
    endpoint: cfg.endpoint || null, hasKey: !!cfg.apiKey };
}
ipcMain.handle('writing:config', () => writingStatus());
ipcMain.handle('writing:set', (_e, patch) => {
  try {
    const cfg = { ...writingConfig() };
    if (patch.endpoint !== undefined) cfg.endpoint = String(patch.endpoint || '').trim();
    if (patch.apiKey !== undefined) cfg.apiKey = String(patch.apiKey || '').trim();
    fs.writeFileSync(writingConfigFile(), JSON.stringify(cfg, null, 2));
    return writingStatus();
  } catch (e) { return { error: e.message }; }
});
ipcMain.handle('writing:restart', () => { mineRestart('writing'); return writingStatus(); });
ipcMain.handle('hub:open', (_e, key) => (FOLDERS[key] ? shell.openPath(FOLDERS[key]()) : 'unknown folder'));
ipcMain.handle('hub:hardware', hwSummary);
ipcMain.handle('cf:state', () => cfLast);
// the page shows 'Starting…' at once; resend afterwards even if the state comes back the same
ipcMain.on('cf:start', () => { cfSent = ''; startClipForge(); });
ipcMain.on('cf:restart', () => { cfSent = ''; restartClipForge(); });
ipcMain.handle('install:state', installState);
ipcMain.handle('install:run', (_e, id) => runInstall(id));
ipcMain.handle('models:overview', overview);
ipcMain.handle('models:download', (_e, kind, id) => download(kind, id));
ipcMain.handle('models:delete', (_e, kind, id) => remove(kind, id));
ipcMain.handle('models:use', (_e, kind, id) => use(kind, id));
ipcMain.handle('apps:list', () => apps.load(APPS_FILE()));
// The sidebar/Home only list apps that open in a tab (not StarNet).
const tabbed = (id) => myapps.myApps()[String(id).replace(/^my-/, '')]?.tab !== false;
ipcMain.handle('mine:state', async () => (await mineState()).filter((m) => tabbed(m.id)));
ipcMain.handle('mine:start', (_e, id) => (tabbed(id) ? startMine(id) : { ok: false, error: 'StarNet opens in its own window.' }));
ipcMain.handle('apps:add', (_e, name, address) => { const r = tryApps((l) => addApp(l, name, address)); if (r.ok) syncAppKeys(); return r; });
ipcMain.handle('apps:edit', (_e, id, name, address) => tryApps((l) => editApp(l, id, name, address)));
ipcMain.handle('apps:remove', (_e, id) => { closeView(id); const r = tryApps((l) => removeApp(l, id)); if (r.ok) syncAppKeys(); return r; });
ipcMain.handle('apps:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose your app folder (with an index.html)', properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.on('page:show', (_e, id) => showPage(id));
ipcMain.on('page:rect', (_e, r) => {
  viewRect = r && { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(0, Math.round(r.width)), height: Math.max(0, Math.round(r.height)) };
  layout();
});
ipcMain.on('page:cover', (_e, on) => { covered = !!on; layout(); });
ipcMain.on('tab:nav', (_e, id, action) => navigate(id, action));
ipcMain.on('tab:close', (_e, id) => closeView(id));

// ---------------------------------------------------------------- App Hub API for agents

const AGENT_SWITCH = { clipforge: 'agentClipforge', models: 'agentModels', apps: 'agentApps', myapps: 'agentMyapps' };

const agentHandlers = {
  // An app the user added: its name and address, is it answering, and open it in its tab.
  async userApp(id, method, rest) {
    const a = apps.load(APPS_FILE()).find((x) => x.id === id);
    if (!a) return { status: 404, body: { error: 'That app is no longer in App Hub.' } };
    const what = rest.split('?')[0];
    if (method === 'GET' && what === 'info') return { id, name: a.name, address: a.url, open_in_app_hub: views.has(id) };
    if (method === 'GET' && what === 'check') {
      if (a.url.startsWith('file:')) {
        const ok = fs.existsSync(require('url').fileURLToPath(a.url));
        return { answering: ok, ...(!ok && { why: "The app's files are missing." }) };
      }
      try {
        const r = await fetch(a.url, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
        return { answering: r.status < 500, http_status: r.status };
      } catch (e) { return { answering: false, why: (e.cause && e.cause.code) || e.message }; }
    }
    if (method === 'POST' && what === 'open') {
      if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
      send('hub:show', id);
      return { opened: a.name };
    }
    return { status: 404, body: { error: `Try GET /v1/${id}/info, GET /v1/${id}/check or POST /v1/${id}/open` } };
  },
  // My Apps for agents: read only - running or not, port, addresses. Never starts or stops them.
  async myapps(method, rest) {
    const [what, query] = rest.split('?');
    if (method !== 'GET' || what !== 'status') return { status: 404, body: { error: 'Try GET /v1/myapps/status' } };
    const want = new URLSearchParams(query || '').get('app');
    const all = myapps.myApps();
    if (want && !all[want]) return { status: 400, body: { error: `Unknown app "${want}". Use starnet, freellmapi or omniroute.` } };
    const state = await mineState();
    return { apps: myapps.statusFor(all, state).filter((x) => !want || x.app === want) };
  },
  status: async () => {
    const s = hubSettings();
    return { app: 'App Hub', version: app.getVersion(), clipforge: cfLast.state,
      access: Object.fromEntries(Object.entries(AGENT_SWITCH).map(([a, k]) => [a, s[k]])),
      starnet_folder: starnet.workspaces(), ...(await readiness()) };
  },
  // ClipForge's own API, passed through (projects, clips, transcript, settings, options, jobs),
  // plus App Hub's one-call workflows: run (make clips, wait, send to Starnet) and wait/<id>.
  async clipforge(method, rest, body) {
    if (cfLast.state !== 'ready') return { status: 503, body: { error: `ClipForge is ${cfLast.state.replace('-', ' ')}. Open App Hub's ClipForge page to start it.` } };
    if (method === 'POST' && rest === 'run') return runClips(body || {});
    const w = method === 'POST' && /^wait\/([^/?]+)$/.exec(rest);
    if (w) return finish(w[1], body || {});
    const r = await fetch(`${CF_URL}/api/${rest}`, {
      method, body: body ? JSON.stringify(body) : undefined, headers: body ? { 'Content-Type': 'application/json' } : {},
    });
    const data = await r.json().catch(() => ({}));
    // agents run on this PC: tell them where a video's files are
    const m = method === 'GET' && /^projects\/([a-z0-9]+)$/.exec(rest);
    if (r.ok && m) data.folder = path.join(CF_DIR, 'data', 'projects', m[1]);
    return { status: r.status, body: data };
  },
  async models(method, rest, body) {
    if (method === 'GET' && !rest) return overview();
    const kind = body && body.kind, id = body && String(body.id || '');
    if (!['ollama', 'whisper'].includes(kind) || !id) return { status: 400, body: { error: 'Send {"kind": "ollama" or "whisper", "id": "<model>"}' } };
    if (method === 'POST' && rest === 'download') return download(kind, id);
    if (method === 'POST' && rest === 'use') return use(kind, id);
    return { status: 404, body: { error: 'Use GET /v1/models, POST /v1/models/download or /v1/models/use' } };
  },
  apps: (method) => (method === 'GET' ? apps.load(APPS_FILE()) : { status: 405, body: { error: 'Apps are read-only' } }),
};

// Can an agent make clips right now? ClipForge's own checks (ffmpeg, speech to text, YouTube, AI, HyperFrames)
// turned into one yes/no and the fixes, so an agent can tell the user what to do instead of failing later.
async function readiness() {
  if (!hubSettings().agentClipforge) return { ready_to_clip: false, problems: ['Agent access to ClipForge is switched off in App Hub Settings.'] };
  if (cfLast.state !== 'ready') {
    return { ready_to_clip: false, problems: [cfLast.state === 'not-installed'
      ? 'ClipForge is not installed: click Install on App Hub\'s Home page.' : `ClipForge is ${cfLast.state}: open App Hub's ClipForge page.`] };
  }
  let rows = [];
  try { rows = (await (await fetch(CF_URL + '/api/doctor', { signal: AbortSignal.timeout(20000) })).json()).rows || []; } catch { /* no report: still ready */ }
  // ClipForge still makes clips with most of these (e.g. no AI: its built-in scorer picks), so they are warnings
  const warnings = rows.filter((r) => !r.ok).map((r) => `${r.name}: ${r.detail}${r.hint ? ` - ${r.hint}` : ''}`);
  return { ready_to_clip: true, ...(warnings.length && { warnings }), videos_in_progress: cfLast.projects.filter((p) => !FINAL.includes(p.status)).length };
}

// ---- one-call ClipForge workflows (Starnet lets an unattended run make one connector call)

const PROJECTS = () => path.join(CF_DIR, 'data', 'projects');
const readProject = (id) => JSON.parse(fs.readFileSync(path.join(PROJECTS(), id, 'project.json'), 'utf8'));
const FINAL = ['done', 'error', 'cancelled'];

// Wait (up to 9.5 min - Starnet's longest connector timeout is 10) for a video, then sum it up and
// optionally copy its best clips into a Starnet agent's folder.
async function finish(id, a) {
  if (!/^[a-z0-9]+$/.test(id) || !fs.existsSync(path.join(PROJECTS(), id, 'project.json'))) return { status: 404, body: { error: `No video with id ${id}` } };
  const until = Date.now() + Math.min(Math.max(Number(a.wait_minutes) || 0, 0), 9.5) * 60000;
  let p = readProject(id);
  while (!FINAL.includes(p.status) && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 3000));
    p = readProject(id);
  }
  const folder = path.join(PROJECTS(), id);
  const out = starnet.summary(p, folder, Number(a.best) || 0);
  if (a.send_to_starnet && p.status === 'done') {
    out.starnet = await starnet.sendToStarnet(p, folder, String(a.send_to_starnet), Number(a.best) || 0, { shrink });
  }
  return out;
}

// A smaller copy of a clip that fits Telegram, with ClipForge's ffmpeg; tried once more at a lower bitrate if needed.
async function shrink(from, to, seconds, limit) {
  const ff = [path.join(CF_DIR, 'bin', WIN ? 'ffmpeg.exe' : 'ffmpeg')].find((f) => fs.existsSync(f)) || 'ffmpeg';
  for (const factor of [1, 0.75]) {
    const v = Math.floor(starnet.fitKbps(seconds, limit) * factor);
    await new Promise((resolve, reject) => {
      const p = spawn(ff, ['-y', '-v', 'error', '-i', from, ...(v < 1500 ? ['-vf', 'scale=-2:1280'] : []),
        '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', `${v}k`, '-maxrate', `${v}k`, '-bufsize', `${2 * v}k`,
        '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', to], { windowsHide: true });
      let err = '';
      p.stderr.on('data', (d) => { err += d; });
      p.on('error', reject);
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err.trim().split(/\r?\n/).pop() || `ffmpeg exit ${code}`))));
    });
    if (fs.statSync(to).size <= limit) return;
  }
  throw new Error('still over the limit');
}

// One line of input: one video (or a channel's newest). Several lines: several videos, all waited for together.
async function runClips(a) {
  const lines = String(a.input || '').split(/\r?\n/).map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
  if (!lines.length) return { status: 400, body: { error: 'input is required: a YouTube link or a video file path' } };
  if (lines.length > 10) return { status: 400, body: { error: 'At most 10 videos in one call' } };
  const until = Date.now() + Math.min(Math.max(Number(a.wait_minutes) || 0, 0), 9.5) * 60000;
  const started = [];
  for (let input of lines) {
    if (a.newest) input = await newestVideo(input);
    const old = a.skip_if_done && findProject(input);
    if (old) { started.push({ id: old, reused: true }); continue; }
    const r = await fetch(CF_URL + '/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, topic: a.topic, from_min: a.from_min, to_min: a.to_min }) });
    const made = await r.json().catch(() => ({}));
    if (!r.ok) return { status: r.status, body: { error: `${input.slice(0, 80)}: ${made.detail || made.error || `ClipForge said ${r.status}`}` } };
    started.push({ id: made.project }); // ClipForge answers { project, job, count }
  }
  // the videos share one deadline, so the whole call still fits Starnet's connector timeout
  const left = () => Math.max(0, until - Date.now()) / 60000;
  const out = [];
  for (const v of started) {
    const r = await finish(v.id, { ...a, wait_minutes: left() });
    out.push(v.reused ? { ...r, reused: 'This video was clipped before; these are those clips.' } : r);
  }
  return out.length === 1 ? out[0] : { videos: out };
}

// The newest clip-able video for this input, if ClipForge already has one that didn't fail.
function findProject(input) {
  const key = starnet.videoKey(input);
  let best = null;
  for (const id of fs.existsSync(PROJECTS()) ? fs.readdirSync(PROJECTS()) : []) {
    let p;
    try { p = readProject(id); } catch { continue; }
    if (starnet.videoKey(p.input) === key && !['error', 'cancelled'].includes(p.status) && (!best || p.created > best.created)) best = p;
  }
  return best && best.id;
}

// The newest upload of a YouTube channel, via ClipForge's yt-dlp.
function newestVideo(url) {
  let u = url.replace(/\/+$/, '');
  if (/youtube\.com\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)$/.test(u)) u += '/videos';
  return new Promise((resolve, reject) => {
    const p = spawn(PY, ['-m', 'yt_dlp', '--flat-playlist', '--playlist-items', '1', '--print', 'url', u], { cwd: CF_DIR, windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => p.kill(), 60000);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('exit', () => {
      clearTimeout(t);
      const v = out.trim().split(/\r?\n/)[0];
      if (/^https?:\/\//.test(v)) resolve(v);
      else reject(new Error('Could not find the newest video on that channel: ' + (err.trim().split(/\r?\n/).pop() || 'it has no videos')));
    });
  });
}

// "When a video finishes" for Starnet: a small JSON note in a folder a Starnet folder trigger watches.
// Written as .tmp then renamed - Starnet ignores .tmp files, so it never reads half a note.
const DROP_DIR = () => path.join(app.getPath('documents'), 'App Hub', 'Starnet inbox');
// "Clips ready" on Telegram and/or Discord, whichever is switched on.
function tellTelegram(id) {
  const s = hubSettings();
  const tg = s.telegramOn && s.telegramToken && s.telegramChat, dc = s.discordOn && s.discordHook;
  if (!tg && !dc) return;
  const text = telegram.finishedText(readProject(id));
  if (tg) telegram.send(s.telegramToken, s.telegramChat, text).catch((e) => console.error('Telegram message:', e.message));
  if (dc) discord.send(s.discordHook, text).catch((e) => console.error('Discord message:', e.message));
}

function dropForStarnet(id) {
  try {
    const f = path.join(DROP_DIR(), `clipforge-${id}.json`);
    fs.mkdirSync(DROP_DIR(), { recursive: true });
    const note = { event: 'clipforge video finished', ...starnet.summary(readProject(id), path.join(PROJECTS(), id)) };
    fs.writeFileSync(f + '.tmp', JSON.stringify(note, null, 2));
    fs.renameSync(f + '.tmp', f);
  } catch (e) { console.error('Starnet note:', e.message); }
}

// Which key was last used when, and the last 50 calls agents made (Settings > Starnet & agents). Saved a moment
// after a call, not on every one.
let agentLog = keylog.clean(null);
let logTimer = null;
function logCall(c) {
  agentLog = keylog.record(agentLog, { ...c, client: (lastAgent[c.scope] || {}).name });
  clearTimeout(logTimer);
  logTimer = setTimeout(() => { try { apps.save(USER('agent-log.json'), agentLog); } catch (e) { console.error('Agent log:', e.message); } }, 2000);
  if (c.tool) send('agent:call', agentLog.calls[0]);
}

function startAgentApi() {
  try { agentLog = keylog.clean(JSON.parse(fs.readFileSync(USER('agent-log.json'), 'utf8'))); } catch { /* first start */ }
  hubSettings(); // makes the key on first start, so Settings and the config always have one
  for (const f of ['mcp.js', 'mcp-tools.js']) {
    try { fs.copyFileSync(path.join(__dirname, f), USER(f)); } catch (e) { console.error('MCP connector:', e.message); }
  }
  const srv = agentapi.start({ keys: () => keysOf(hubSettings()), handlers: agentHandlers,
    allowed: (a) => !!hubSettings()[AGENT_SWITCH[a] || (appconn.isUserApp(a) ? 'agentApps' : '')], // added apps: the Other Apps switch
    title: (id) => (apps.load(APPS_FILE()).find((x) => x.id === id) || {}).name || null,
    expired: (scope) => { const s = hubSettings(); return keylog.isExpired((s.keyMade || {})[scope], (s.keyDays || {})[scope])
      ? keylog.expiresAt(s.keyMade[scope], s.keyDays[scope]) : null; },
    onCall: logCall,
    onAgent: (name, scope) => {
      lastAgent[scope] = { name: name === 'starnet-harness' ? 'Starnet' : name, at: Date.now() };
      send('agent:seen', lastAgent);
    } });
  srv.on('error', (e) => console.error('App Hub API could not start:', e.message)); // e.g. the port is taken
}

// Opening the .exe again just brings the open window to the front.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
if (WIN) app.setAppUserModelId('com.bryce.apphub'); // notifications show "App Hub", not "electron.app"

app.whenReady().then(() => {
  createWindow(); // first, so the window loads while ClipForge's code is copied
  try { syncClipForge(); } catch (e) { console.error('Could not copy ClipForge:', e.message); }
  startOllama();
  if (cfReady()) updateYtDlp(startClipForge);
  // OmniRoute takes ~30 s to start: begin after the hub and ClipForge are up, so it's ready when you click it.
  // A click before that starts it at once; startMine never starts a second copy.
  setTimeout(() => startMine('my-omniroute'), 20000);
  startAgentApi();
  cfPoll();
  setInterval(cfPoll, 3000);
  setInterval(sleepTabs, 60000);
});
app.on('before-quit', () => { if (server) stopServer(); });
app.on('window-all-closed', () => app.quit());
