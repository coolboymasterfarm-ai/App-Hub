// Bryce's own desktop apps that App Hub opens in a tab ("My Apps"): where each one is on this PC and the
// address its page is on. App Hub starts the app's own program and shows that page. Pure Node, tested.
const fs = require('fs');
const path = require('path');

const first = (list) => list.find((p) => p && fs.existsSync(p)) || null;
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const readJson = (f) => { try { return JSON.parse(readText(f)); } catch { return {}; } };

// StarNet's desktop app starts its server on a new port every time and writes it to startup.log.
function starnetPort(log) {
  const m = [...String(log).matchAll(/spawn_sidecar pid=\d+ port=(\d+) listening=true/g)];
  return m.length ? Number(m[m.length - 1][1]) : null;
}

function myApps(env = process.env) {
  const home = env.USERPROFILE || env.HOME || '';
  const appdata = env.APPDATA || '';
  const local = env.LOCALAPPDATA || '';
  const dl = path.join(home, 'Downloads');
  return {
    starnet: {
      name: 'StarNet', icon: 'bot', note: 'Your AI agent crew: belts, schedules and research.',
      exe: first([path.join(dl, 'starnet', 'skynet-desktop.exe'), path.join(local, 'Programs', 'StarNet', 'skynet-desktop.exe')]),
      url: () => { const p = starnetPort(readText(path.join(appdata, 'ai.skynet.harness', 'startup.log'))); return p ? `http://127.0.0.1:${p}/` : null; },
    },
    freellmapi: {
      name: 'FreeLLMAPI', icon: 'spark', note: 'Free AI models behind one local address.',
      exe: first([path.join(dl, 'freellapi', 'FreeLLMAPI.exe'), path.join(dl, 'freellmapi', 'FreeLLMAPI.exe'),
        path.join(local, 'Programs', 'FreeLLMAPI', 'FreeLLMAPI.exe')]),
      url: () => `http://127.0.0.1:${readJson(path.join(appdata, 'FreeLLMAPI', 'config.json')).port || 31415}/`,
    },
    omniroute: {
      name: 'OmniRoute', icon: 'globe', note: 'Routes your AI subscriptions and keys through one address.',
      exe: first([path.join(appdata, 'npm', 'omniroute.cmd')]), args: ['--no-open'],
      url: () => 'http://127.0.0.1:20128/',
    },
  };
}

module.exports = { myApps, starnetPort };
