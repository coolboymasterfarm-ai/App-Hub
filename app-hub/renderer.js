// Renderer process for App Hub: tabs, the Home tiles, Add app, and the Models page.
const api = window.electronAPI;
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids);
  return e;
}

let apps = [];        // the user's own apps
let open = [];        // ids of user apps with an open tab
let current = 'home';
let cfReady = false;

// ---------------------------------------------------------------- tabs

function renderTabs() {
  const fixed = [['home', 'Home'], ['clipforge', 'ClipForge'], ['models', 'AI Models']];
  const tabs = fixed.map(([id, name]) => el('button', { className: 'tab' + (current === id ? ' active' : ''), textContent: name, onclick: () => show(id) }));
  for (const id of open) {
    const a = apps.find((x) => x.id === id);
    if (!a) continue;
    const x = el('span', { className: 'x', textContent: '×', title: 'Close tab' });
    x.onclick = (e) => { e.stopPropagation(); closeTab(id); };
    tabs.push(el('button', { className: 'tab' + (current === id ? ' active' : ''), onclick: () => show(id) }, a.name, x));
  }
  $('tabs').replaceChildren(...tabs);
}

function show(id) {
  if (id === 'clipforge' && !cfReady) { id = 'home'; $('installs').scrollIntoView(); }
  current = id;
  const fixed = ['home', 'clipforge', 'models'].includes(id);
  if (!fixed && !open.includes(id)) open.push(id);
  for (const v of document.querySelectorAll('.view')) v.classList.remove('active');
  $((fixed ? id : 'app') + '-view').classList.add('active');
  if (id === 'clipforge' && !$('clipforge-frame').src) { api.startClipForge(); $('clipforge-frame').src = 'clipforge-tab.html'; }
  if (id === 'models') loadModels();
  api.showTab(fixed ? null : id); // native app views sit on top of the page, so hide them for hub pages
  renderTabs();
}

function closeTab(id) {
  open = open.filter((x) => x !== id);
  api.closeTab(id);
  if (current === id) show('home'); else renderTabs();
}

api.onSwitchTab((tab) => show(tab));

// ---------------------------------------------------------------- home

function renderHome() {
  const tiles = [el('div', { className: 'app-tile', onclick: () => show('clipforge') },
    el('div', { className: 'app-tile-icon', textContent: '🎬' }), el('div', { className: 'app-tile-name', textContent: 'ClipForge' }))];
  for (const a of apps) {
    const rm = el('button', { className: 'remove', textContent: '×', title: 'Remove app' });
    rm.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Remove "${a.name}" from App Hub?`)) return;
      const r = await api.removeApp(a.id);
      if (!r.ok) return alert(r.error);
      apps = r.apps;
      open = open.filter((x) => x !== a.id);
      if (current === a.id) show('home');
      renderHome(); renderTabs();
    };
    tiles.push(el('div', { className: 'app-tile', title: a.url, onclick: () => show(a.id) },
      rm, el('div', { className: 'app-tile-icon', textContent: '🌐' }), el('div', { className: 'app-tile-name', textContent: a.name })));
  }
  tiles.push(el('div', { className: 'app-tile', onclick: openAdd },
    el('div', { className: 'app-tile-icon', textContent: '+' }), el('div', { className: 'app-tile-name', textContent: 'Add App' })));
  $('apps-grid').replaceChildren(...tiles);
}

function openAdd() {
  $('add-name').value = ''; $('add-url').value = ''; $('add-error').textContent = '';
  $('add-dialog').showModal();
}
function setFolder(dir) {
  if (!dir) return;
  $('add-url').value = dir;
  if (!$('add-name').value.trim()) $('add-name').value = dir.split(/[\\/]/).filter(Boolean).pop().slice(0, 40);
  $('add-error').textContent = '';
}
$('add-folder').onclick = async () => setFolder(await api.pickFolder());
const drop = $('add-drop');
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const f = e.dataTransfer.files[0];
  if (f) setFolder(api.pathForFile(f));
};
$('add-cancel').onclick = () => $('add-dialog').close();
$('add-form').onsubmit = async (e) => {
  e.preventDefault();
  const r = await api.addApp($('add-name').value, $('add-url').value);
  if (!r.ok) { $('add-error').textContent = r.error; return; }
  apps = r.apps;
  $('add-dialog').close();
  renderHome();
};

// ---------------------------------------------------------------- one-click installs

let installs = [];
const logs = {}; // app id -> output lines

function renderInstalls() {
  const missing = installs.filter((x) => !x.installed);
  $('installs').hidden = !missing.length;
  const busyNow = installs.some((x) => x.installing);
  $('install-all').disabled = busyNow;
  $('install-list').replaceChildren(...missing.map((x) => {
    const btn = el('button', { className: 'btn', textContent: x.installing ? 'Installing…' : 'Install', disabled: busyNow });
    btn.onclick = () => install(x.id);
    const lines = logs[x.id] || [];
    return el('div', { className: 'inst' },
      el('div', { className: 'inst-row' }, el('div', {}, el('b', { textContent: x.name }), el('div', { className: 'muted', textContent: x.note })), btn),
      el('div', { className: 'last', id: 'last-' + x.id, textContent: lines[lines.length - 1] || '' }),
      el('details', { hidden: !lines.length }, el('summary', { textContent: 'Show details' }), el('pre', { id: 'log-' + x.id, textContent: lines.join('\n') })));
  }));
}

async function refreshStatus() {
  installs = await api.installState();
  cfReady = installs.find((x) => x.id === 'clipforge').installed;
  renderInstalls();
}

async function install(id) {
  logs[id] = [];
  const x = installs.find((i) => i.id === id);
  if (x) x.installing = true;
  renderInstalls();
  const r = await api.install(id);
  await refreshStatus();
  if (current === 'models') loadModels();
  if (!r.ok) alert(r.error);
  return r.ok;
}

$('install-all').onclick = async () => {
  // Ollama first: ClipForge's setup and its AI both look for it.
  for (const x of installs.filter((i) => !i.installed)) if (!(await install(x.id))) break;
};

api.onInstallLog(({ id, line }) => {
  (logs[id] = logs[id] || []).push(line);
  if (logs[id].length > 500) logs[id].shift();
  const last = $('last-' + id), pre = $('log-' + id);
  if (last) last.textContent = line;
  if (pre) { pre.textContent = logs[id].join('\n'); pre.parentElement.hidden = false; pre.scrollTop = pre.scrollHeight; }
});

// ---------------------------------------------------------------- models

const FIT = { gpu: 'Fast (GPU)', cpu: 'Works (CPU)', slow: 'Slow', no: "Won't fit" };
const busy = new Map(); // "kind:id" -> { text, pct }

function modelRow(m, data) {
  const key = m.kind + ':' + m.id;
  const b = busy.get(key);
  const name = el('td', {}, el('b', { textContent: m.id }));
  if (m.recommended) name.append(el('span', { className: 'badge rec', textContent: 'Recommended' }));
  if (m.inUse) name.append(el('span', { className: 'badge use', textContent: 'In use' }));
  name.append(el('div', { className: 'muted', textContent: m.note }));
  if (b) name.append(el('div', { className: 'muted', textContent: b.text || '' }), el('div', { className: 'bar' }, el('i', { style: `width:${Math.round((b.pct || 0) * 100)}%` })));

  const actions = el('td', { className: 'actions' });
  const canGet = m.kind === 'ollama' ? data.ollama : data.cfReady;
  if (m.installed) {
    if (!m.inUse) actions.append(el('button', { className: 'btn', textContent: 'Use in ClipForge', onclick: () => act(api.useModel, m) }));
    actions.append(el('button', { className: 'btn ghost', textContent: 'Delete', onclick: () => confirm(`Delete ${m.id}? (${m.size} GB freed)`) && act(api.deleteModel, m) }));
  } else {
    const dl = el('button', { className: 'btn' + (m.recommended ? '' : ' ghost'), textContent: b ? 'Downloading…' : 'Download', disabled: !!b || !canGet });
    dl.title = canGet ? '' : (m.kind === 'ollama' ? 'Install or start Ollama first' : 'Run the ClipForge setup first (Home tab)');
    dl.onclick = () => download(m, data);
    actions.append(dl);
  }
  return el('tr', {}, name, el('td', { textContent: m.size + ' GB' }),
    el('td', {}, el('span', { className: 'badge fit-' + m.fit, textContent: FIT[m.fit] })), actions);
}

let last = null;
function renderModels(data) {
  last = data;
  const { hw } = data;
  const gpus = hw.gpus.length ? hw.gpus.map((g) => `${g.name}${g.vramGB ? ` (${g.vramGB} GB)` : ''}`).join(', ') : 'None found (CPU only)';
  const box = (label, value) => el('div', {}, el('span', { className: 'muted', textContent: label }), el('b', { textContent: value }));
  $('hw').replaceChildren(box('Processor', `${hw.cpu} · ${hw.cores} threads`), box('Memory (RAM)', hw.ramGB + ' GB'),
    box('Graphics', gpus), box('Free disk', hw.diskGB == null ? 'Unknown' : hw.diskGB + ' GB'));
  $('ollama-banner').hidden = data.ollama;
  $('whisper-auto').textContent = data.whisperAuto ? 'ClipForge currently picks the speech model automatically (turbo on an NVIDIA GPU, small on the CPU). Click "Use" to pin one.' : '';
  $('chat').replaceChildren(...data.chat.map((m) => modelRow(m, data)));
  $('whisper').replaceChildren(...data.whisper.map((m) => modelRow(m, data)));
}

async function loadModels() {
  try { renderModels(await api.models()); } catch (e) { $('hw').replaceChildren(el('div', { textContent: 'Could not check this PC: ' + e.message })); }
}

async function act(fn, m) {
  const r = await fn(m.kind, m.id);
  if (!r.ok) alert(r.error);
  loadModels();
}

async function download(m, data) {
  const need = m.size * 1.1;
  if (data.hw.diskGB != null && data.hw.diskGB < need && !confirm(`Only ${data.hw.diskGB} GB free and ${m.id} needs about ${m.size} GB. Try anyway?`)) return;
  if (m.fit === 'no' && !confirm(`${m.id} is too big for this PC and will probably not run. Download anyway?`)) return;
  busy.set(m.kind + ':' + m.id, { text: 'starting…', pct: 0 });
  renderModels(data);
  const r = await api.download(m.kind, m.id);
  busy.delete(m.kind + ':' + m.id);
  if (!r.ok) alert(`Download of ${m.id} failed: ${r.error}`);
  else if (m.recommended && !data[m.kind === 'ollama' ? 'chat' : 'whisper'].some((x) => x.inUse)) await api.useModel(m.kind, m.id);
  loadModels();
}

api.onProgress((p) => {
  if (!busy.has(p.kind + ':' + p.id) || p.text === 'done' || p.text === 'failed') return;
  busy.set(p.kind + ':' + p.id, { text: p.text, pct: p.pct });
  if (last && current === 'models') renderModels(last);
});

$('refresh').onclick = loadModels;
$('ollama-btn').onclick = async () => {
  $('ollama-btn').disabled = true;
  $('ollama-btn').textContent = 'Installing… (progress on Home)';
  await install('ollama');
  $('ollama-btn').disabled = false;
  $('ollama-btn').textContent = 'Install Ollama';
  setTimeout(loadModels, 3000); // give "ollama serve" a moment to come up
};

// ---------------------------------------------------------------- start

(async () => {
  apps = await api.apps();
  await refreshStatus();
  renderHome();
  show('home');
})();
