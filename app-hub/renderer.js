// App Hub page: sidebar, pages (Home, ClipForge, AI Models, Settings, the user's apps), dialogs.
// `hub` is the preload API (window.hub); the page reaches it as a global.
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter((k) => k != null && k !== false));
  return e;
}
const icon = (name) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'i');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#i-' + name);
  s.append(u);
  return s;
};
const btn = (cls, label, onclick, ico, extra = {}) => el('button', { className: 'btn ' + cls, onclick, ...extra }, ico && icon(ico), label);
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t.h);
  t.h = setTimeout(() => t.classList.remove('show'), ms);
}

const PAGES = { home: 'Home', clipforge: 'ClipForge', models: 'AI Models', settings: 'Settings' };
let apps = [];
const open = new Set();     // user apps with a live tab
const tabs = new Map();     // app id -> last tab:state
let page = null;
let cf = { state: 'starting', projects: [], url: '' };
let models = null;          // last AI models overview

// ---------------------------------------------------------------- avatars

const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
function avatar(a) {
  if (a.icon) {
    const img = el('img', { src: a.icon, alt: '' });
    const box = el('span', { className: 'app-ico fav' }, img);
    img.onerror = () => box.replaceWith(letter(a)); // a favicon that won't load falls back to the letter
    return box;
  }
  return letter(a);
}
function letter(a) {
  const ic = el('span', { className: 'app-ico', textContent: (a.name.trim()[0] || '?').toUpperCase() });
  ic.style.background = `hsl(${hue(a.name)} 55% 42%)`;
  return ic;
}
function host(url) {
  try { const u = new URL(url); return u.protocol === 'file:' ? 'App folder' : u.host; } catch { return url; }
}

// ---------------------------------------------------------------- navigation

const order = () => ['home', 'clipforge', 'models', ...apps.map((a) => a.id), 'settings'];

function show(id) {
  if (!PAGES[id] && !apps.some((a) => a.id === id)) id = 'home';
  page = id;
  const isApp = !PAGES[id];
  if (isApp) open.add(id);
  for (const p of document.querySelectorAll('.page')) p.classList.toggle('on', p.id === 'page-' + (isApp ? 'app' : id));
  for (const n of document.querySelectorAll('.nav')) n.classList.toggle('on', n.dataset.page === id);
  $('tb-title').hidden = isApp;
  $('tb-nav').hidden = !isApp;
  $('tb-title').textContent = PAGES[id] || '';
  if (id === 'home') loadHome();
  if (id === 'models') loadModels();
  if (id === 'settings') loadSettings();
  if (id === 'clipforge') paintCf();
  hub.show(id);
  renderSide();
  paintTab();
  sendRect();
}

function closeTab(id) {
  open.delete(id);
  tabs.delete(id);
  hub.closeTab(id);
  if (page === id) show('home'); else renderSide();
}

// The app pages are native views laid over <main>; tell the main process where <main> is.
function sendRect() {
  const r = $('main').getBoundingClientRect();
  hub.rect({ x: r.left, y: r.top, width: r.width, height: r.height });
}
new ResizeObserver(sendRect).observe($('main'));
window.addEventListener('resize', sendRect);

document.querySelectorAll('.nav[data-page]').forEach((n) => { n.onclick = () => show(n.dataset.page); });

function renderSide() {
  const items = apps.map((a) => {
    const close = el('span', { className: 'mini close', title: 'Close tab (Ctrl+W)', role: 'button', ariaLabel: 'Close ' + a.name }, icon('x'));
    close.onclick = (e) => { e.stopPropagation(); closeTab(a.id); };
    const b = el('button', { className: 'nav' + (page === a.id ? ' on' : ''), onclick: () => show(a.id), title: a.url },
      avatar(a), el('span', { textContent: a.name }),
      open.has(a.id) && el('i', { className: 'open-dot' }), open.has(a.id) && close);
    b.dataset.page = a.id;
    return b;
  });
  $('side-apps').replaceChildren(...(items.length ? items : [el('div', { className: 'side-empty', textContent: 'Add a website or your own app.' })]));
}

// ---------------------------------------------------------------- app tabs (title bar + error page)

hub.onTabState((s) => { tabs.set(s.id, s); if (s.id === page) paintTab(); });

function paintTab() {
  if (PAGES[page]) return;
  const a = apps.find((x) => x.id === page);
  const s = tabs.get(page) || {};
  $('nav-back').disabled = !s.canBack;
  $('nav-fwd').disabled = !s.canForward;
  $('tb-loading').hidden = !s.loading;
  $('tb-url-text').textContent = s.url ? s.url.replace(/^file:\/\/\/.*\/apps\/[^/]+\//, 'App folder › ') : (a ? a.url : '');
  $('app-error').hidden = !s.failed;
  if (s.failed && a) {
    $('app-error-title').textContent = `${a.name} didn't load`;
    $('app-error-text').textContent = friendly(s.failed);
  }
}
// Chromium's load errors, in words people use.
function friendly(err) {
  const say = [[/NAME_NOT_RESOLVED|ADDRESS_INVALID/, "That address couldn't be found. Check it for typos."],
    [/CONNECTION_REFUSED|CONNECTION_RESET|EMPTY_RESPONSE|UNSAFE_PORT/, 'Nothing is answering at that address. If it is an app on this PC, make sure it is running.'],
    [/INTERNET_DISCONNECTED|NETWORK_CHANGED/, "You're offline. Check your internet connection."],
    [/TIMED_OUT/, 'It took too long to answer. Try again in a moment.'],
    [/CERT|SSL/, "The site's security certificate isn't valid, so App Hub didn't open it."],
    [/FILE_NOT_FOUND/, "The app's files are missing. Edit the app and choose its folder again."]];
  const hit = say.find(([re]) => re.test(err));
  return (hit ? hit[1] : "The page couldn't load.") + ` (${err})`;
}

$('nav-back').onclick = () => hub.nav(page, 'back');
$('nav-fwd').onclick = () => hub.nav(page, 'forward');
$('nav-reload').onclick = () => hub.nav(page, 'reload');
$('nav-ext').onclick = () => hub.nav(page, 'external');
$('app-retry').onclick = () => hub.nav(page, 'reload');
$('app-edit').onclick = () => openDialog(apps.find((a) => a.id === page));

// ---------------------------------------------------------------- keyboard shortcuts (sent from any page by the main process)

hub.onShortcut((a) => {
  const ids = order();
  if (a.startsWith('go:')) { const id = ids[+a.slice(3) - 1]; if (id) show(id); }
  else if (a === 'next' || a === 'prev') show(ids[(ids.indexOf(page) + (a === 'next' ? 1 : ids.length - 1)) % ids.length]);
  else if (a === 'settings') show('settings');
  else if (a === 'close' && !PAGES[page]) closeTab(page);
  else if (a === 'reload') {
    if (!PAGES[page]) hub.nav(page, 'reload');
    else if (page === 'clipforge' && cf.state === 'ready') $('cf-frame').src = $('cf-frame').src;
    else if (page === 'models') loadModels();
  } else if ((a === 'back' || a === 'forward') && !PAGES[page]) hub.nav(page, a);
});

// ---------------------------------------------------------------- Add / edit app dialog

let editing = null; // the app being edited, or null when adding
function openDialog(a = null) {
  editing = a;
  $('dlg-title').textContent = a ? 'Edit app' : 'Add app';
  $('app-save').textContent = a ? 'Save' : 'Add app';
  $('app-name').value = a ? a.name : '';
  $('app-url').value = a ? a.url : '';
  $('app-error-msg').textContent = '';
  hub.cover(true); // native app views would paint over the dialog
  $('app-dialog').showModal();
  $('app-name').focus();
}
$('app-dialog').addEventListener('close', () => hub.cover(false));
$('app-cancel').onclick = () => $('app-dialog').close();
$('side-add').onclick = () => openDialog();
$('q-add').onclick = () => openDialog();

function setFolder(dir) {
  if (!dir) return;
  $('app-url').value = dir;
  if (!$('app-name').value.trim()) $('app-name').value = dir.split(/[\\/]/).filter(Boolean).pop().slice(0, 40);
  $('app-error-msg').textContent = '';
}
$('app-folder').onclick = async () => setFolder(await hub.pickFolder());
const drop = $('app-drop');
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) setFolder(hub.pathForFile(f));
};

$('app-form').onsubmit = async (e) => {
  e.preventDefault();
  $('app-save').disabled = true;
  const r = editing
    ? await hub.editApp(editing.id, $('app-name').value, $('app-url').value)
    : await hub.addApp($('app-name').value, $('app-url').value);
  $('app-save').disabled = false;
  if (!r.ok) { $('app-error-msg').textContent = r.error; return; }
  const added = !editing && r.apps[r.apps.length - 1];
  apps = r.apps;
  $('app-dialog').close();
  renderSide();
  if (page === 'home') renderTiles();
  if (added) { toast(`${added.name} added`); show(added.id); }
  else if (editing && page === editing.id) { tabs.delete(editing.id); show(editing.id); }
};

async function removeApp(a) {
  if (!confirm(`Remove "${a.name}" from App Hub?`)) return;
  const r = await hub.removeApp(a.id);
  if (!r.ok) return toast(r.error, 4000);
  apps = r.apps;
  open.delete(a.id);
  if (page === a.id) show('home'); else { renderSide(); renderTiles(); }
  toast(`${a.name} removed`);
}

hub.onAppsChanged((list) => { apps = list; renderSide(); if (page === 'home') renderTiles(); }); // e.g. a favicon arrived

// ---------------------------------------------------------------- Home

function loadHome() {
  const h = new Date().getHours();
  $('hello').textContent = h < 5 ? 'Up late?' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  $('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  renderTiles();
  paintCfStat();
  refreshInstalls();
  hub.hardware().then((hw) => {
    const gpu = hw.gpus[0];
    $('stat-pc-text').textContent = `${hw.ramGB} GB RAM · ${gpu ? gpu.name.replace(/^NVIDIA |GeForce /g, '') : 'no graphics card found'}`;
  }).catch(() => { $('stat-pc-text').textContent = 'Could not check'; });
  hub.models().then((m) => { models = m; paintAiStat(); }).catch(() => {});
}

function paintAiStat() {
  if (!models) return;
  const chat = models.chat.find((m) => m.inUse) || models.chat.find((m) => m.installed);
  $('stat-ai-text').textContent = !models.ollama ? 'Ollama is not running'
    : chat ? `Using ${chat.id}` : 'No chat model yet · pick one';
}

function paintCfStat() {
  const n = cf.projects.length;
  $('stat-cf-text').textContent = { ready: n ? `${n} video${n === 1 ? '' : 's'} · ready` : 'Ready for your first video',
    starting: 'Starting…', stopped: 'Stopped · open to restart', 'not-installed': 'Not installed yet' }[cf.state] || cf.state;
  const recent = cf.state === 'ready' ? cf.projects.slice(0, 4) : [];
  $('recent-sec').hidden = !recent.length;
  const LABEL = { done: 'Ready', error: 'Failed', cancelled: 'Stopped' };
  $('recent').replaceChildren(...recent.map((p) => {
    const thumb = el('div', { className: 'thumb' },
      el('span', { className: 'badge' }, el('i', { className: 'state ' + (p.status === 'done' ? 'ok' : p.status === 'error' ? 'bad' : p.status === 'cancelled' ? '' : 'run') }),
        LABEL[p.status] || 'Working…'));
    if (p.thumb) thumb.style.backgroundImage = `url("${cf.url}/files/${p.id}/${encodeURI(p.thumb)}")`;
    return el('button', { className: 'rcard', onclick: () => openProject(p.id) }, thumb,
      el('div', { className: 'meta' }, el('b', { textContent: p.title }), el('span', { textContent: p.clips ? `${p.clips} clips` : 'No clips yet' })));
  }));
}

function renderTiles() {
  const tiles = apps.map((a) => {
    const edit = el('span', { className: 'mini', title: 'Edit', role: 'button', ariaLabel: 'Edit ' + a.name }, icon('edit'));
    edit.onclick = (e) => { e.stopPropagation(); openDialog(a); };
    const rm = el('span', { className: 'mini', title: 'Remove', role: 'button', ariaLabel: 'Remove ' + a.name }, icon('trash'));
    rm.onclick = (e) => { e.stopPropagation(); removeApp(a); };
    return el('button', { className: 'tile', onclick: () => show(a.id), title: a.url },
      el('div', { className: 'acts' }, edit, rm), avatar(a),
      el('div', {}, el('b', { textContent: a.name }), el('span', { className: 'host', textContent: host(a.url) })));
  });
  const add = el('button', { className: 'tile add', onclick: () => openDialog() },
    el('span', { className: 'app-ico' }, icon('plus')), el('b', { textContent: 'Add app' }));
  $('tiles').replaceChildren(...tiles, add);
}

$('q-clip').onclick = () => show('clipforge');
$('stat-cf').onclick = () => show('clipforge');
$('recent-all').onclick = () => show('clipforge');
$('stat-ai').onclick = () => show('models');
$('stat-pc').onclick = () => show('models');

// ---------------------------------------------------------------- one-click installs

let installs = [];
const logs = {}; // app id -> output lines
const INST_ICON = { ollama: ['ai', 'bot'], clipforge: ['cf', 'scissors'] };

function renderInstalls() {
  const missing = installs.filter((x) => !x.installed);
  $('installs').hidden = !missing.length;
  const busyNow = installs.some((x) => x.installing);
  $('install-all').disabled = busyNow;
  $('install-list').replaceChildren(...missing.map((x) => {
    const [cls, ic] = INST_ICON[x.id] || ['', 'box'];
    const lines = logs[x.id] || [];
    return el('div', { className: 'inst' },
      el('span', { className: 'inst-ico ' + cls }, icon(ic)),
      el('div', { className: 'inst-body' },
        el('b', { textContent: x.name }), el('div', { className: 'muted small', textContent: x.note }),
        el('div', { className: 'last', id: 'last-' + x.id, textContent: lines[lines.length - 1] || '' }),
        el('details', { hidden: !lines.length }, el('summary', { textContent: 'Show details' }), el('pre', { id: 'log-' + x.id, textContent: lines.join('\n') }))),
      btn(x.installing ? 'ghost' : 'pri', x.installing ? 'Installing…' : 'Install', () => install(x.id), x.installing ? null : 'down', { disabled: busyNow }));
  }));
}

async function refreshInstalls() {
  installs = await hub.installState();
  renderInstalls();
}

async function install(id) {
  logs[id] = [];
  const x = installs.find((i) => i.id === id);
  if (x) x.installing = true;
  renderInstalls();
  const r = await hub.install(id);
  await refreshInstalls();
  if (page === 'models') loadModels();
  if (r.ok) toast(`${x ? x.name : 'App'} is installed`);
  else alert(r.error);
  return r.ok;
}

$('install-all').onclick = async () => {
  // one by one, Ollama first: ClipForge's setup and its AI both look for it
  for (const x of installs.filter((i) => !i.installed)) if (!(await install(x.id))) break;
};

hub.onInstallLog(({ id, line }) => {
  (logs[id] = logs[id] || []).push(line);
  if (logs[id].length > 500) logs[id].shift();
  const last = $('last-' + id), pre = $('log-' + id);
  if (last) last.textContent = line;
  if (pre) { pre.textContent = logs[id].join('\n'); pre.parentElement.hidden = false; pre.scrollTop = pre.scrollHeight; }
});

// ---------------------------------------------------------------- ClipForge

let cfLoaded = false;   // the frame shows a running ClipForge
let cfPending = '';     // a project to open once it's ready

hub.onCfState((s) => {
  const wasReady = cf.state === 'ready';
  cf = s;
  if (wasReady && s.state !== 'ready') cfLoaded = false; // it went away; reload the frame when it's back
  paintCf();
  if (page === 'home') paintCfStat();
  if (page === 'settings') paintSetCf();
});
hub.onCfOpen((pid) => openProject(pid));

function openProject(pid) {
  cfPending = '#/p/' + pid;
  show('clipforge');
}

function paintCf() {
  const dot = $('cf-dot');
  dot.className = 'state ' + ({ ready: 'ok', starting: 'run', stopped: 'bad' }[cf.state] || '');
  const ready = cf.state === 'ready';
  $('cf-cover').hidden = ready;
  if (ready && page === 'clipforge' && (!cfLoaded || cfPending)) {
    // a new hash on the same page only changes the route inside ClipForge, no reload
    $('cf-frame').src = cf.url + '/' + cfPending;
    cfLoaded = true;
    cfPending = '';
  }
  if (ready) return;
  const acts = $('cf-cover-acts');
  const T = {
    starting: ['Starting ClipForge…', 'The first start can take about 20 seconds.', []],
    stopped: ['ClipForge stopped', 'It may have closed with an error. Restart it, or open its log in Settings.',
      [btn('pri', 'Restart ClipForge', () => { hub.cfRestart(); cf.state = 'starting'; paintCf(); }, 'redo'), btn('ghost', 'Open log', () => hub.open('log'), 'info')]],
    'not-installed': ['ClipForge isn\'t installed yet', 'It installs inside App Hub in about 5–15 minutes, with no CMD windows.',
      [btn('pri', 'Install ClipForge', async () => { show('home'); await install('clipforge'); }, 'down')]],
  }[cf.state] || ['ClipForge', '', []];
  $('cf-cover-title').textContent = T[0];
  $('cf-cover-text').textContent = T[1];
  acts.replaceChildren(...T[2]);
}

// ---------------------------------------------------------------- AI Models

const FIT = { gpu: 'Fast on GPU', cpu: 'Works on CPU', slow: 'Slow here', no: "Won't fit" };
const busy = new Map(); // "kind:id" -> { text, pct }

function modelRow(m, data) {
  const key = m.kind + ':' + m.id;
  const b = busy.get(key);
  const name = el('div', {},
    el('div', { className: 'name' }, el('b', { textContent: m.id }),
      m.recommended && el('span', { className: 'badge rec' }, icon('spark'), 'Recommended'),
      m.inUse && el('span', { className: 'badge use' }, icon('check'), 'In use')),
    el('div', { className: 'note', textContent: m.note }));
  if (b) name.append(el('div', { className: 'note', textContent: b.text || 'starting…' }),
    el('div', { className: 'bar' }, el('i', { style: `width:${Math.round((b.pct || 0) * 100)}%` })));
  const acts = el('div', { className: 'acts' });
  const canGet = m.kind === 'ollama' ? data.ollama : data.cfReady;
  if (m.installed) {
    if (!m.inUse) acts.append(btn('ghost sm', 'Use', () => act(hub.useModel, m), 'check', { title: 'Use in ClipForge' }));
    acts.append(btn('ghost sm danger', '', () => confirm(`Delete ${m.id}? (${m.size} GB freed)`) && act(hub.deleteModel, m), 'trash', { title: 'Delete', ariaLabel: 'Delete ' + m.id }));
  } else {
    acts.append(btn((m.recommended ? 'pri' : 'ghost') + ' sm', b ? 'Downloading…' : 'Download', () => download(m), b ? null : 'down', {
      disabled: !!b || !canGet,
      title: canGet ? '' : m.kind === 'ollama' ? 'Install or start Ollama first' : 'Install ClipForge first (Home)',
    }));
  }
  return el('div', { className: 'model' + (m.recommended ? ' rec' : '') }, name,
    el('span', { className: 'size', textContent: m.size + ' GB' }),
    el('span', { className: 'fitcol' }, el('span', { className: 'badge fit-' + m.fit, textContent: FIT[m.fit] })), acts);
}

function renderModels(data) {
  models = data;
  const { hw } = data;
  const gpus = hw.gpus.length ? hw.gpus.map((g) => `${g.name}${g.vramGB ? ` · ${g.vramGB} GB` : ''}`).join(', ') : 'None found (CPU only)';
  const box = (ic, label, value) => el('div', { className: 'hwc' }, el('span', { className: 'ico' }, icon(ic)),
    el('div', {}, el('span', { textContent: label }), el('b', { textContent: value, title: value })));
  $('hw').replaceChildren(box('cpu', 'Processor', `${hw.cpu} · ${hw.cores} threads`), box('ram', 'Memory', hw.ramGB + ' GB'),
    box('gpu', 'Graphics', gpus), box('disk', 'Free disk', hw.diskGB == null ? 'Unknown' : hw.diskGB + ' GB'));
  $('ollama-banner').hidden = data.ollama;
  $('whisper-auto').textContent = data.whisperAuto
    ? 'ClipForge picks automatically (turbo on an NVIDIA GPU, small on the CPU) until you choose one'
    : 'Whisper turns speech into word-timed captions';
  $('chat').replaceChildren(...data.chat.map((m) => modelRow(m, data)));
  $('whisper').replaceChildren(...data.whisper.map((m) => modelRow(m, data)));
  // the one-click "best setup for this PC"
  const picks = [data.chat.find((m) => m.recommended), data.whisper.find((m) => m.recommended)].filter(Boolean);
  const todo = picks.filter((m) => !m.installed || !m.inUse);
  const settingUp = picks.some((m) => busy.has(m.kind + ':' + m.id));
  $('rec').replaceChildren(
    el('div', { className: 'txt' }, el('h2', { textContent: todo.length ? 'Best setup for this PC' : "You're all set" }),
      el('p', { textContent: todo.length ? 'One click downloads these and switches ClipForge to them.' : 'ClipForge is using the best models for this PC.' }),
      el('div', { className: 'picks' }, ...picks.map((m) => el('span', { className: 'pick' }, icon(m.kind === 'ollama' ? 'bot' : 'mic'),
        `${m.id} · ${m.size} GB`, m.installed && m.inUse && el('span', { className: 'ok' }, icon('check')))))),
    todo.length ? btn('pri', settingUp ? 'Setting up…' : 'Set up recommended', setupRecommended, settingUp ? null : 'spark',
      { disabled: settingUp || todo.some((m) => !(m.kind === 'ollama' ? data.ollama : data.cfReady)) }) : null);
}

async function loadModels() {
  try { renderModels(await hub.models()); } catch (e) { $('hw').replaceChildren(el('div', { className: 'muted', textContent: 'Could not check this PC: ' + e.message })); }
}

async function act(fn, m) {
  const r = await fn(m.kind, m.id);
  if (!r.ok) alert(r.error);
  loadModels();
}

async function download(m, quiet) {
  const free = models && models.hw.diskGB;
  if (!quiet && free != null && free < m.size * 1.1 && !confirm(`Only ${free} GB free and ${m.id} needs about ${m.size} GB. Try anyway?`)) return false;
  if (!quiet && m.fit === 'no' && !confirm(`${m.id} is too big for this PC and will probably not run. Download anyway?`)) return false;
  busy.set(m.kind + ':' + m.id, { text: 'starting…', pct: 0 });
  if (models) renderModels(models);
  const r = await hub.download(m.kind, m.id);
  busy.delete(m.kind + ':' + m.id);
  if (!r.ok) alert(`Download of ${m.id} failed: ${r.error}`);
  else if (m.recommended && !(m.kind === 'ollama' ? models.chat : models.whisper).some((x) => x.inUse)) await hub.useModel(m.kind, m.id);
  await loadModels();
  return r.ok;
}

async function setupRecommended() {
  for (const m of [models.chat.find((x) => x.recommended), models.whisper.find((x) => x.recommended)].filter(Boolean)) {
    if (!m.installed && !(await download(m, true))) return;
    await hub.useModel(m.kind, m.id);
  }
  await loadModels();
  toast('ClipForge is set up with the best models for this PC');
}

hub.onProgress((p) => {
  if (!busy.has(p.kind + ':' + p.id) || p.text === 'done' || p.text === 'failed') return;
  busy.set(p.kind + ':' + p.id, { text: p.text, pct: p.pct });
  if (models && page === 'models') renderModels(models);
});

$('refresh').onclick = loadModels;
$('ollama-btn').onclick = async () => {
  $('ollama-btn').disabled = true;
  $('ollama-btn').textContent = 'Installing…';
  await install('ollama');
  $('ollama-btn').disabled = false;
  $('ollama-btn').textContent = 'Install Ollama';
  setTimeout(loadModels, 3000); // give "ollama serve" a moment to come up
};

// ---------------------------------------------------------------- Settings

let agent = null, keyShown = false;
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(t).toLocaleString(); };
function paintSeen() {
  const a = agent.lastAgent;
  $('agent-seen').innerHTML = '';
  $('agent-seen').append(a
    ? Object.assign(document.createElement('span'), { className: 'ok-dot', textContent: `● Connected: ${a.name}, ${ago(a.at)}` })
    : agent.starnet ? 'Found on this PC, not connected yet. Follow the steps below.' : 'Not found on this PC. Install Starnet, then follow the steps below.');
}
function paintAgent(info) {
  agent = info.agent;
  $('agent-key').textContent = keyShown ? agent.key : agent.key.slice(0, 8) + '•'.repeat(24);
  $('agent-show').textContent = keyShown ? 'Hide' : 'Show';
  $('agent-mcpurl').textContent = agent.mcpUrl;
  $('agent-drop').textContent = agent.dropDir;
  $('agent-url').textContent = `App Hub API: ${agent.url} (running while App Hub is open)`;
  for (const b of document.querySelectorAll('[data-agent]')) b.checked = !!info.settings[b.dataset.agent];
  paintSeen();
}
const copyText = (text, msg) => navigator.clipboard.writeText(text).then(() => toast(msg), () => toast('Could not copy'));
$('agent-show').onclick = () => { keyShown = !keyShown; hub.info().then(paintAgent); };
$('agent-copy').onclick = () => copyText(agent.key, 'Key copied - paste it into "bearer token" in Starnet');
$('agent-copyurl').onclick = () => copyText(agent.mcpUrl, 'Address copied - paste it into the URL box in Starnet');
$('agent-copytimeout').onclick = () => copyText('600000', 'Copied 600000');
$('agent-mcp').onclick = () => copyText(JSON.stringify(agent.mcp, null, 2), 'MCP config copied - paste it into .mcp.json');
$('agent-new').onclick = async () => {
  if (!confirm('Reset the key? Starnet and other agents stop reaching App Hub until you paste the new key into them ' +
    '(Starnet: CONNECTED SERVICES → App Hub → ✎ EDIT → bearer token → SAVE & RECONNECT).')) return;
  keyShown = true;
  paintAgent(await hub.set({ newAgentKey: true }));
  copyText(agent.key, 'New key made and copied - paste it into Starnet');
};
document.querySelectorAll('[data-agent]').forEach((b) => { b.onchange = () => hub.set({ [b.dataset.agent]: b.checked }); });
hub.onAgentSeen((a) => { if (agent) { agent.lastAgent = a; paintSeen(); } });

async function loadSettings() {
  const info = await hub.info();
  paintAgent(info);
  $('set-login').checked = info.openAtLogin;
  $('set-notify').checked = info.settings.notifications;
  $('set-where').textContent = `ClipForge, its tools and models live in ${info.cfDir}`;
  $('about').textContent = `App Hub ${info.version}`;
  paintSetCf();
}
function paintSetCf() {
  const n = cf.projects.length;
  $('set-cf').textContent = { ready: `Running · ${n} video${n === 1 ? '' : 's'}`, starting: 'Starting…', stopped: 'Stopped', 'not-installed': 'Not installed yet' }[cf.state] || cf.state;
  $('set-cf-restart').disabled = cf.state === 'not-installed';
}
$('set-login').onchange = (e) => hub.set({ openAtLogin: e.target.checked }).then(() => toast(e.target.checked ? 'App Hub will start with Windows' : 'App Hub won\'t start with Windows'));
$('set-notify').onchange = (e) => hub.set({ notifications: e.target.checked });
$('set-cf-restart').onclick = () => { hub.cfRestart(); cf.state = 'starting'; paintSetCf(); paintCf(); toast('Restarting ClipForge…'); };
document.querySelectorAll('[data-open]').forEach((b) => {
  b.onclick = async () => { const err = await hub.open(b.dataset.open); if (err) toast(err.includes('exist') ? 'Nothing there yet' : err, 3500); };
});

// ---------------------------------------------------------------- start

(async () => {
  [apps, cf, installs] = await Promise.all([hub.apps(), hub.cfState(), hub.installState()]);
  renderSide();
  show('home');
})();
