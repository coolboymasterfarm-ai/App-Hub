// Bryce's own desktop apps that App Hub opens in a tab ("My Apps"): where each one is on this PC and the
// address its page is on. App Hub starts the app's own program and shows that page. Pure Node, tested.
// Everything is looked up fresh on every click, so an app that updates itself (new version, new port,
// new install folder) still opens.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const exists = (p) => !!p && fs.existsSync(p);
const first = (list) => list.find(exists) || null;
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const readJson = (f) => { try { return JSON.parse(readText(f)); } catch { return {}; } };
// The last part of a log that only grows (StarNet's startup.log): the newest lines are all we need.
function tail(f, bytes = 1 << 20) {
  let fd;
  try {
    fd = fs.openSync(f, 'r');
    const size = fs.fstatSync(fd).size, n = Math.min(size, bytes), buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, size - n);
    return buf.toString('utf8');
  } catch { return ''; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

// StarNet's desktop app starts its server on a new port every time and writes it to startup.log.
function starnetPort(log) {
  const ports = String(log).split(/\r?\n/).filter((l) => /spawn_sidecar\b/.test(l) && !/listening=false/.test(l))
    .map((l) => (/\bport=(\d+)/.exec(l) || [])[1]).filter(Boolean);
  return ports.length ? Number(ports[ports.length - 1]) : null;
}

// Start menu / desktop shortcuts an installer makes, newest install wins. main.js reads where they point,
// so an update that installs into a new folder is still found.
function shortcuts(name, env = process.env) {
  const menus = [env.APPDATA, env.ProgramData].filter(Boolean).map((b) => path.join(b, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  return [...menus.flatMap((m) => [path.join(m, name + '.lnk'), path.join(m, name, name + '.lnk')]),
    ...(env.USERPROFILE ? [path.join(env.USERPROFILE, 'Desktop', name + '.lnk')] : [])].filter(exists);
}

// This PC's own Node (OmniRoute needs Node 22+, newer than App Hub's built-in one).
function findNode(env = process.env) {
  const exe = process.platform === 'win32' ? 'node.exe' : 'node';
  const dirs = [env.APPDATA && path.join(env.APPDATA, 'npm'), ...String(env.PATH || env.Path || '').split(path.delimiter),
    path.join(env.ProgramFiles || 'C:\\Program Files', 'nodejs')];
  return first(dirs.filter(Boolean).map((d) => path.join(d.replace(/^"(.*)"$/, '$1'), exe)));
}

// The script an npm package runs, read from its package.json, so an update that moves it still works.
function npmBin(dir, name) {
  const bin = readJson(path.join(dir, 'package.json')).bin;
  const rel = typeof bin === 'string' ? bin : bin && bin[name];
  return rel && exists(path.join(dir, rel)) ? path.join(dir, rel) : null;
}

// A KEY=value line from a .env file.
const envValue = (text, key) => (new RegExp('^\\s*' + key + '\\s*=\\s*"?(\\d+)', 'm').exec(text) || [])[1];

// Apps that ship inside App Hub (Grammar, Agent Dashboard): where they are (resources/ when installed, the repo
// when run from source; main.js sets dir) and the Node that runs them (App Hub's own, as ELECTRON_RUN_AS_NODE).
const BUNDLED = { dir: null, node: process.execPath };

// One bundled Node server: started with App Hub's Node on a fixed port, hidden, page and API at one address.
function bundledApp(b, rel, port, info) {
  const script = b.dir && path.join(b.dir, rel);
  return { ...info, exe: exists(script) ? b.node : null, args: [script], env: { ELECTRON_RUN_AS_NODE: '1', PORT: String(port) },
    shortcuts: [], hidden: true, missing: `${info.name} isn't built. Run Update.bat, then click Try again.`,
    url: () => `http://127.0.0.1:${port}/` };
}

function myApps(env = process.env, b = BUNDLED) {
  const home = env.USERPROFILE || env.HOME || '';
  const appdata = env.APPDATA || '';
  const local = env.LOCALAPPDATA || '';
  const dl = path.join(home, 'Downloads');
  const omniDir = path.join(appdata, 'npm', 'node_modules', 'omniroute');
  const omniBin = npmBin(omniDir, 'omniroute');
  const node = omniBin && findNode(env);
  const omniEnv = readText(path.join(home, '.omniroute', '.env'));
  return {
    starnet: {
      // no tab: StarNet only works fully in its own window (its keys and provider settings need it). Agents still
      // see whether it's running (My Apps connector), and StarNet still connects to App Hub's connectors.
      name: 'StarNet', icon: 'bot', note: 'Your AI agent crew: belts, schedules and research.', tab: false,
      exe: first([path.join(dl, 'starnet', 'skynet-desktop.exe'), path.join(local, 'Programs', 'StarNet', 'skynet-desktop.exe')]),
      shortcuts: shortcuts('StarNet', env),
      url: () => { const p = starnetPort(tail(path.join(appdata, 'ai.skynet.harness', 'startup.log'))); return p ? `http://127.0.0.1:${p}/` : null; },
    },
    freellmapi: {
      name: 'FreeLLMAPI', icon: 'spark', note: 'Free AI models behind one local address.',
      exe: first([path.join(dl, 'freellapi', 'FreeLLMAPI.exe'), path.join(dl, 'freellmapi', 'FreeLLMAPI.exe'),
        path.join(local, 'Programs', 'FreeLLMAPI', 'FreeLLMAPI.exe'), path.join(local, 'Programs', 'freellmapi', 'FreeLLMAPI.exe')]),
      shortcuts: shortcuts('FreeLLMAPI', env),
      url: () => `http://127.0.0.1:${readJson(path.join(appdata, 'FreeLLMAPI', 'config.json')).port || 31415}/`,
    },
    omniroute: {
      // Run its script with Node directly, not omniroute.cmd, so no CMD window ever opens.
      name: 'OmniRoute', icon: 'globe', note: 'Routes your AI subscriptions and keys through one address.',
      exe: node, args: node ? [omniBin, '--no-open'] : [], shortcuts: [], hidden: true,
      missing: omniBin && !node ? "OmniRoute needs Node.js 22 or newer. Install it from nodejs.org, then click Try again." : null,
      url: () => `http://127.0.0.1:${envValue(omniEnv, 'DASHBOARD_PORT') || envValue(omniEnv, 'PORT') || 20128}/`,
    },
    writingassistant: {
      // Static web app: no server to start, just open its index.html from the repo folder.
      name: 'Writing Assistant', icon: 'spark', note: 'Grammar, spelling, style, and tone suggestions via FreeLLM API.',
      exe: null, tab: true, hidden: false,
      url: () => {
        const dir = path.join(b.dir || path.join(__dirname, '..'), 'writing-assistant');
        return exists(path.join(dir, 'index.html')) ? pathToFileURL(path.join(dir, 'index.html')).href : null;
      },
    }

  };
}

// What an agent sees about My Apps: running or not, port and addresses. state: mineState()'s list ({ id: 'my-<app>', ... }).

// What an agent sees about My Apps: running or not, port and addresses. state: mineState()'s list ({ id: 'my-<app>', ... }).
function statusFor(all, state) {
  return Object.entries(all).map(([app, a]) => {
    const s = state.find((x) => x.id === 'my-' + app) || {};
    const url = a.url();
    const port = url ? Number(new URL(url).port) || null : null;
    return { app, name: a.name, installed: !!s.installed, running: !!s.running, port: s.running ? port : null,
      address: s.running ? url : null, ...(app !== 'starnet' && { api: s.running ? url + 'v1' : null }) };
  });
}

module.exports = { myApps, BUNDLED, starnetPort, shortcuts, findNode, npmBin, tail, statusFor };