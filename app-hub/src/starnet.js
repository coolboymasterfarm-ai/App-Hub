// Starnet glue that needs no Electron: where Starnet keeps its agents' folders, and how a finished
// ClipForge video is summed up for an agent and copied into a Starnet agent's folder.
// Starnet only opens/sends files inside an agent's own folder (<workspaces>\<agent id>\), and only
// sends files up to 20 MB through Telegram - so clips are copied there and the big ones flagged.
const fs = require('fs');
const path = require('path');

const SEND_LIMIT = 20 * 1024 * 1024;

// The installed Starnet (Tauri) keeps its data in %APPDATA%\ai.skynet.harness\workspaces; Starnet run from
// source ("node sidecar/index.js") uses %LOCALAPPDATA%\StarNet\workspaces (older: ...\Skynet\workspaces).
function workspaces(env = process.env) {
  const c = [];
  if (env.SKYNET_WORKSPACES) c.push(env.SKYNET_WORKSPACES);
  for (const base of [env.APPDATA, env.LOCALAPPDATA].filter(Boolean)) c.push(path.join(base, 'ai.skynet.harness', 'workspaces'));
  if (env.LOCALAPPDATA) c.push(path.join(env.LOCALAPPDATA, 'StarNet', 'workspaces'), path.join(env.LOCALAPPDATA, 'Skynet', 'workspaces'));
  // the one used most recently wins, if both an installed and a from-source Starnet exist
  const found = c.filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
  found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return found[0] || null;
}

// The same YouTube video under any of its link forms, so a schedule doesn't clip it twice.
function videoKey(input) {
  const s = String(input || '').trim();
  const m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/live\/|\/embed\/)([\w-]{11})/.exec(s);
  return m ? 'yt:' + m[1] : s.toLowerCase();
}

const done = (c) => c.state === 'done' && c.file;

// Best first; clips you made yourself (no score) count as best.
function pickClips(clips, best) {
  const ok = (clips || []).filter(done).sort((a, b) => (b.score ?? 101) - (a.score ?? 101) || a.n - b.n);
  return best > 0 ? ok.slice(0, Math.floor(best)) : ok;
}

// What an agent gets back for a video: status and the finished clips with full file paths.
function summary(p, folder) {
  const s = {
    id: p.id, title: p.title, status: p.status, error: p.error || undefined, folder,
    clips: pickClips(p.clips).map((c) => ({
      n: c.n, title: c.title, score: c.score ?? 'picked by you', seconds: Math.round((c.end - c.start) * 10) / 10,
      file: path.join(folder, c.file), captions: c.srt ? path.join(folder, c.srt) : undefined,
    })),
  };
  if (!['done', 'error', 'cancelled'].includes(p.status)) s.note = 'Still working. Call clipforge_wait_for_video with this id later.';
  return s;
}

// Copy the clips into <workspaces>\<agent>\clipforge\<video id>\. A hard link when possible (same drive,
// no extra space); a copy otherwise. Returns paths relative to the agent's folder, as Starnet tools want them.
function sendToStarnet(p, folder, agent, best, ws = workspaces()) {
  if (!ws) throw new Error('Starnet was not found on this PC (no Starnet workspaces folder). Open Starnet once, then try again.');
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(agent || ''))) throw new Error('send_to_starnet must be a Starnet agent id, e.g. "agent"');
  const home = path.join(ws, agent);
  if (!fs.existsSync(home)) {
    const ids = fs.readdirSync(ws, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    throw new Error(`No Starnet agent folder "${agent}". Folders in Starnet: ${ids.join(', ') || 'none'}`);
  }
  const rel = path.join('clipforge', p.id);
  fs.mkdirSync(path.join(home, rel), { recursive: true });
  const files = [];
  for (const c of pickClips(p.clips, best)) {
    const name = `clip${String(c.n).padStart(2, '0')}.mp4`;
    const to = path.join(home, rel, name);
    fs.rmSync(to, { force: true }); // a re-rendered clip replaces the old copy
    try { fs.linkSync(path.join(folder, c.file), to); } catch { fs.copyFileSync(path.join(folder, c.file), to); }
    const big = fs.statSync(to).size > SEND_LIMIT;
    files.push({ n: c.n, title: c.title, path: path.join(rel, name).split(path.sep).join('/'), ...(big && { note: 'over 20 MB: too big to send on Telegram' }) });
  }
  return { agent, folder: path.join(home, rel), files };
}

module.exports = { workspaces, videoKey, pickClips, summary, sendToStarnet, SEND_LIMIT };
