// Bryce's own desktop apps that App Hub opens in a tab ("My Apps"): where each one is on this PC and the
// address its page is on. App Hub starts the app's own program and shows that page. Pure Node, tested.
// Everything is looked up fresh on every click, so an app that updates itself (new version, new port,
// new install folder) still opens.
const fs = require('fs');
const path = require('path');

const exists = (p) => !!p && fs.existsSync(p);
const first = (list) => list.find(exists) || null;
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const readJson = (f) => { try { return JSON.parse(readText(f)); } catch { return {}; } };

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

function myApps(env = process.env) {
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
      name: 'StarNet', icon: 'bot', note: 'Your AI agent crew: belts, schedules and research.',
      exe: first([path.join(dl, 'starnet', 'skynet-desktop.exe'), path.join(local, 'Programs', 'StarNet', 'skynet-desktop.exe')]),
      shortcuts: shortcuts('StarNet', env),
      url: () => { const p = starnetPort(readText(path.join(appdata, 'ai.skynet.harness', 'startup.log'))); return p ? `http://127.0.0.1:${p}/` : null; },
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
  };
}

module.exports = { myApps, starnetPort, shortcuts, findNode, npmBin };
