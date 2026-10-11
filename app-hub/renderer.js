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
let mine = [];              // My Apps: StarNet, FreeLLMAPI, OmniRoute (ClipForge has its own page)
const starting = new Set(); // My Apps being started right now
const tabApp = (id) => mine.find((m) => m.id === id) || apps.find((a) => a.id === id);
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

const order = () => ['home', 'models', 'clipforge', ...mine.map((m) => m.id), ...apps.map((a) => a.id), 'settings'];

function show(id) {
  if (!PAGES[id] && !tabApp(id)) id = 'home';
  page = id;
  const isApp = !PAGES[id];
  const fresh = isApp && !open.has(id); // a new tab needs a sidebar entry; otherwise the .on toggle below is enough
  if (isApp) open.add(id);
  // ClipForge's page stays loaded; tell it to stop polling while it's off screen
  if (cfLoaded) $('cf-frame').contentWindow.postMessage({ cfHidden: id !== 'clipforge' }, cf.url);
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
  if (id.startsWith('my-') && !tabs.has(id)) startMine(id); // its view opens once its program answers
  if (fresh) renderSide();
  paintTab();
  sendRect();
}

// Starts StarNet / FreeLLMAPI / OmniRoute (or finds it running), then opens its page in the tab.
async function startMine(id) {
  if (starting.has(id)) return;
  starting.add(id);
  tabs.delete(id);
  paintTab();
  const r = await hub.startMine(id);
  starting.delete(id);
  if (!r.ok) tabs.set(id, { failed: r.error, mine: true });
  else if (page === id) { tabs.delete(id); hub.show(id); }
  if (page === id) paintTab();
  refreshMine();
}
async function refreshMine() {
  mine = await hub.mineState();
  renderSide();
  if (page === 'home') renderTiles();
}

function closeTab(id) {
  open.delete(id);
  tabs.delete(id);
  hub.closeTab(id);
  if (page === id) show('home'); else renderSide();
}

// The app pages are native views laid over <main>; tell the main process where <main> is.
// Only when it moved: every rect makes the main process lay out the native views again.
let lastRect = '';
function sendRect() {
  const r = $('main').getBoundingClientRect();
  const k = [r.left, r.top, r.width, r.height].join();
  if (k === lastRect) return;
  lastRect = k;
  hub.rect({ x: r.left, y: r.top, width: r.width, height: r.height });
}
new ResizeObserver(sendRect).observe($('main'));

document.querySelectorAll('.nav[data-page]').forEach((n) => { n.onclick = () => show(n.dataset.page); });

function renderSide() {
  $('side-mine').replaceChildren(...mine.map((m) => sideItem(m, el('span', { className: 'app-ico mine' }, icon(m.icon)))));
  const items = apps.map((a) => sideItem(a, avatar(a)));
  $('side-apps').replaceChildren(...(items.length ? items : [el('div', { className: 'side-empty', textContent: 'Add a website or your own app.' })]));
}
function sideItem(a, ico) {
  const close = el('span', { className: 'mini close', title: 'Close tab (Ctrl+W)', role: 'button', ariaLabel: 'Close ' + a.name }, icon('x'));
  close.onclick = (e) => { e.stopPropagation(); closeTab(a.id); };
  const b = el('button', { className: 'nav' + (page === a.id ? ' on' : ''), onclick: () => show(a.id), title: a.url || a.note },
    ico, el('span', { textContent: a.name }),
    open.has(a.id) && el('i', { className: 'open-dot' }), open.has(a.id) && close);
  b.dataset.page = a.id;
  return b;
}

// ---------------------------------------------------------------- app tabs (title bar + error page)

hub.onTabState((s) => { tabs.set(s.id, s); if (s.id === page) paintTab(); });

function paintTab() {
  if (PAGES[page]) return;
  const a = tabApp(page);
  const s = tabs.get(page) || {};
  const wait = starting.has(page);
  $('nav-back').disabled = !s.canBack;
  $('nav-fwd').disabled = !s.canForward;
  $('tb-loading').hidden = !s.loading;
  $('tb-url-text').textContent = s.url ? s.url.replace(/^file:\/\/\/.*\/apps\/[^/]+\//, 'App folder › ') : (a && a.url) || '';
  $('app-error').hidden = !s.failed && !wait;
  $('app-retry').hidden = $('app-edit').hidden = wait;
  if (page.startsWith('my-')) $('app-edit').hidden = true; // My Apps can't be edited or removed
  if (wait && a) {
    $('app-error-title').textContent = `Starting ${a.name}…`;
    $('app-error-text').textContent = 'The first start can take up to a minute.';
  } else if (s.failed && a) {
    $('app-error-title').textContent = `${a.name} didn't load`;
    $('app-error-text').textContent = s.mine ? s.failed : friendly(s.failed);
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
// My Apps: start it again (its address can change, e.g. StarNet picks a new port each start).
$('app-retry').onclick = () => (page.startsWith('my-') ? (hub.closeTab(page), startMine(page)) : hub.nav(page, 'reload'));
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
  refreshMine();
  refreshInstalls();
  hub.hardware().then((hw) => {
    const gpu = hw.gpus[0];
    $('stat-pc-text').textContent = `${hw.ramGB} GB RAM · ${gpu ? gpu.name.replace(/^NVIDIA |GeForce /g, '') : 'no graphics card found'}`;
  }).catch(() => { $('stat-pc-text').textContent = 'Could not check'; });
  if (models) paintAiStat(); // the Models page keeps this up to date
  else hub.models().then((m) => { models = m; paintAiStat(); }).catch(() => {});
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

const MINE_STATUS = (m) => (starting.has(m.id) ? 'Starting…' : m.running ? '● Running' : m.installed ? 'Click to start' : 'Not found on this PC');
function renderTiles() {
  const cfTile = el('button', { className: 'tile', onclick: () => show('clipforge') },
    el('span', { className: 'app-ico cf' }, icon('scissors')),
    el('div', {}, el('b', { textContent: 'ClipForge' }), el('span', { className: 'host', textContent: 'Long videos into short clips' })));
  $('mine-tiles').replaceChildren(cfTile, ...mine.map((m) => el('button', { className: 'tile', onclick: () => show(m.id), title: m.note },
    el('span', { className: 'app-ico mine' }, icon(m.icon)),
    el('div', {}, el('b', { textContent: m.name }), el('span', { className: 'host', textContent: MINE_STATUS(m) })))));
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
  // installers print many lines a second: draw the log at most once a frame
  if (pre && !pre.raf) {
    pre.raf = requestAnimationFrame(() => {
      pre.raf = 0;
      pre.textContent = logs[id].join('\n');
      pre.parentElement.hidden = false;
      pre.scrollTop = pre.scrollHeight;
    });
  }
});

// ---------------------------------------------------------------- ClipForge

let cfLoaded = false;   // the frame shows a running ClipForge
let cfPending = '';     // a project to open once it's ready

hub.onCfState((s) => {
  if (JSON.stringify(s) === JSON.stringify(cf)) return; // nothing changed: don't rebuild cards under the mouse
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
  if (b) name.append(el('div', { className: 'note', id: 'prog-' + key, textContent: b.text || 'starting…' }),
    el('div', { className: 'bar' }, el('i', { id: 'bar-' + key, style: `width:${Math.round((b.pct || 0) * 100)}%` })));
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
  const key = p.kind + ':' + p.id;
  busy.set(key, { text: p.text, pct: p.pct });
  // many events a second during a download: update its row, not the whole page (buttons keep working)
  const t = document.getElementById('prog-' + key), b = document.getElementById('bar-' + key);
  if (t && b) { t.textContent = p.text; b.style.width = Math.round((p.pct || 0) * 100) + '%'; }
  else if (models && page === 'models') renderModels(models);
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

let agent = null, settingsNow = {}, keyShown = false;
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(t).toLocaleString(); };
const seenText = (a) => a && el('span', { className: 'ok-dot' }, `● Connected: ${a.name}, ${ago(a.at)}`);
const CONN_ICON = { all: ['box', ''], clipforge: ['scissors', ' cf'], models: ['chip', ''], apps: ['globe', ''] };
const CONN_NOTE = {
  all: 'Every app below in one connector.',
  clipforge: 'Make clips, wait for them, send them to Starnet, transcripts, edits, HyperFrames styles.',
  models: "This PC's hardware and models: download and switch models.",
  apps: 'The list of apps you added (read only).',
};
// One row per connector: its address and key to paste into Starnet, Reset, and (per app) the on/off switch.
function connRow(c) {
  const [ico, cls] = CONN_ICON[c.scope];
  const reset = async () => {
    if (!confirm(`Make a new key for ${c.title}? Agents using the old one stop reaching it until you paste the new key into them ` +
      '(Starnet: CONNECTED SERVICES → that connector → ✎ EDIT → bearer token → SAVE & RECONNECT).')) return;
    keyShown = true;
    paintAgent(await hub.set({ resetKey: c.scope }));
    copyText(agent.connectors.find((x) => x.scope === c.scope).key, 'New key made and copied - paste it into Starnet');
  };
  const sw = c.sw && el('label', { className: 'sw' }, el('input', { type: 'checkbox', checked: !!settingsNow[c.sw], ariaLabel: `Let agents use ${c.title}`,
    onchange: (e) => hub.set({ [c.sw]: e.target.checked }) }), el('i'));
  return el('div', { className: 'srow' }, el('span', { className: 'sico' + cls }, icon(ico)),
    el('span', { className: 'stext' }, el('b', {}, c.title),
      el('span', {}, CONN_NOTE[c.scope]),
      el('span', { className: 'mono' }, `Starnet id ${c.id} · ${c.url}`),
      el('span', { className: 'mono' }, 'Key ' + (keyShown ? c.key : c.key.slice(0, 8) + '•'.repeat(16))),
      seenText(agent.lastAgent[c.scope])),
    btn('ghost sm', 'Address', () => copyText(c.url, `${c.title} address copied - paste it into the URL box in Starnet`)),
    btn('ghost sm', 'Key', () => copyText(c.key, `${c.title} key copied - paste it into "bearer token" in Starnet`)),
    btn('ghost sm danger', 'Reset', reset), sw);
}
function paintSeen() {
  const last = Object.values(agent.lastAgent).sort((a, b) => b.at - a.at)[0];
  $('agent-seen').replaceChildren(seenText(last)
    || (agent.starnet ? 'Found on this PC, not connected yet. Follow the steps below.' : 'Not found on this PC. Install Starnet, then follow the steps below.'));
}
function paintAgent(info) {
  agent = info.agent;
  settingsNow = info.settings;
  $('agent-show').textContent = keyShown ? 'Hide keys' : 'Show keys';
  $('agent-conns').replaceChildren(...agent.connectors.map(connRow));
  $('agent-drop').textContent = agent.dropDir;
  $('agent-open').hidden = !agent.starnetApp;
  $('agent-url').textContent = `App Hub API: ${agent.url} (running while App Hub is open)`;
  for (const b of document.querySelectorAll('[data-agent]')) b.checked = !!info.settings[b.dataset.agent];
  const tg = info.settings;
  $('tg-state').textContent = tg.telegramToken && tg.telegramChat ? `Bot ${tg.telegramToken} → chat ${tg.telegramChat}`
    : 'Sent by your Telegram bot (the one Starnet uses works) to your chat.';
  $('tg-token').placeholder = tg.telegramToken ? `Saved (${tg.telegramToken}) - paste a new one to change it` : 'Bot token, e.g. 123456789:AAH… (from @BotFather)';
  if (!$('tg-chat').value) $('tg-chat').value = tg.telegramChat || '';
  paintSeen();
}
const copyText = (text, msg) => navigator.clipboard.writeText(text).then(() => toast(msg), () => toast('Could not copy'));
$('agent-show').onclick = () => { keyShown = !keyShown; hub.info().then(paintAgent); };
$('agent-copytimeout').onclick = () => copyText('600000', 'Copied 600000');
$('agent-mcp').onclick = () => copyText(JSON.stringify(agent.mcp, null, 2), 'MCP config copied - paste it into .mcp.json');
$('tg-save').onclick = async () => {
  const r = await hub.set({ telegram: { token: $('tg-token').value, chat: $('tg-chat').value } });
  if (r.error) return toast(r.error, 5000);
  $('tg-token').value = '';
  paintAgent(r);
  toast('Telegram saved. Click Send test to check it.');
};
$('tg-test').onclick = async () => {
  $('tg-test').disabled = true;
  const r = await hub.telegramTest();
  $('tg-test').disabled = false;
  toast(r.ok ? 'Sent - check Telegram' : r.error, r.ok ? 2600 : 6000);
};
document.querySelectorAll('[data-agent]').forEach((b) => { b.onchange = () => hub.set({ [b.dataset.agent]: b.checked }); });
hub.onAgentSeen((seen) => { if (agent) { agent.lastAgent = seen; hub.info().then(paintAgent); } });

async function loadSettings() {
  const info = await hub.info();
  paintAgent(info);
  $('set-login').checked = info.openAtLogin;
  $('set-notify').checked = info.settings.notifications;
  $('set-where').textContent = `ClipForge, its tools and models live in ${info.cfDir}`;
  $('about').textContent = `App Hub ${info.version}`;
  paintSetCf();
  paintClean();
}
function paintSetCf() {
  const n = cf.projects.length;
  $('set-cf').textContent = { ready: `Running · ${n} video${n === 1 ? '' : 's'}`, starting: 'Starting…', stopped: 'Stopped', 'not-installed': 'Not installed yet' }[cf.state] || cf.state;
  $('set-cf-restart').disabled = cf.state === 'not-installed';
}
$('set-login').onchange = (e) => hub.set({ openAtLogin: e.target.checked }).then(() => toast(e.target.checked ? 'App Hub will start with Windows' : 'App Hub won\'t start with Windows'));
$('set-notify').onchange = (e) => hub.set({ notifications: e.target.checked });
$('set-cf-restart').onclick = () => { hub.cfRestart(); cf.state = 'starting'; paintSetCf(); paintCf(); toast('Restarting ClipForge…'); };
// Free up space: shows what the choice would free, then deletes after a confirm.
async function paintClean() {
  const p = await hub.cleanPlan($('clean-days').value);
  const what = [p.videos && `${p.videos} video${p.videos === 1 ? '' : 's'}`, p.copies && `${p.copies} Starnet cop${p.copies === 1 ? 'y' : 'ies'}`].filter(Boolean);
  $('clean-text').textContent = what.length ? `${what.join(' and ')} · frees ${p.size}` : 'Nothing to delete for this choice.';
  $('clean-go').disabled = !what.length;
  return p;
}
$('clean-days').onchange = paintClean;
$('clean-go').onclick = async () => {
  const p = await paintClean();
  if (!p.videos && !p.copies) return;
  if (!confirm(`Delete ${$('clean-text').textContent.split(' · ')[0]} and free ${p.size}? This can't be undone.`)) return;
  const r = await hub.cleanRun($('clean-days').value);
  toast(`Deleted ${r.deleted} folder${r.deleted === 1 ? '' : 's'}, freed ${r.size}`, 4000);
  paintClean();
};

document.querySelectorAll('[data-open]').forEach((b) => {
  b.onclick = async () => { const err = await hub.open(b.dataset.open); if (err) toast(err.includes('exist') ? 'Nothing there yet' : err, 3500); };
});

// ---------------------------------------------------------------- start

(async () => {
  // only the instant calls before the first draw; Home fills in My Apps and installs as they answer
  [apps, cf] = await Promise.all([hub.apps(), hub.cfState()]);
  renderSide();
  show('home');
})();
