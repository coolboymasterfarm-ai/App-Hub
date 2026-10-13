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

// What an agent gets back for a video: status and the finished clips, best first, with what an agent needs
// to post them: the ready-to-post caption, why ClipForge picked it, what is said, and the files. best > 0: only those.
function summary(p, folder, best = 0) {
  const at = (f) => (f ? path.join(folder, f) : undefined);
  const s = {
    id: p.id, title: p.title, status: p.status, error: p.error || undefined, folder,
    clips: pickClips(p.clips, best).map((c) => ({
      n: c.n, title: c.title, score: c.score ?? 'picked by you', seconds: Math.round((c.end - c.start) * 10) / 10,
      caption: c.description || undefined, why: c.reason || undefined,
      said: c.text ? (c.text.length > 400 ? c.text.slice(0, 400) + '…' : c.text) : undefined,
      file: at(c.file), cover: at(c.cover), subtitles: at(c.srt),
    })),
  };
  if (!['done', 'error', 'cancelled'].includes(p.status)) s.note = 'Still working. Call the wait_for_video tool with this id later.';
  return s;
}

// Copy the clips (and covers) into <workspaces>\<agent>\clipforge\<video id>\. A hard link when possible (same
// drive, no extra space); a copy otherwise. A clip over Telegram's 20 MB gets a smaller copy made by
// shrink(from, to, seconds, limit) instead. Returns paths relative to the agent's folder, as Starnet tools want them.
async function sendToStarnet(p, folder, agent, best, { ws = workspaces(), shrink = null, limit = SEND_LIMIT } = {}) {
  if (!ws) throw new Error('Starnet was not found on this PC (no Starnet workspaces folder). Open Starnet once, then try again.');
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(agent || ''))) throw new Error('send_to_starnet must be a Starnet agent id, e.g. "agent"');
  const home = path.join(ws, agent);
  if (!fs.existsSync(home)) {
    const ids = fs.readdirSync(ws, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    throw new Error(`No Starnet agent folder "${agent}". Folders in Starnet: ${ids.join(', ') || 'none'}`);
  }
  const rel = path.join('clipforge', p.id);
  fs.mkdirSync(path.join(home, rel), { recursive: true });
  const link = (from, to) => {
    fs.rmSync(to, { force: true }); // a re-rendered clip replaces the old copy
    try { fs.linkSync(from, to); } catch { fs.copyFileSync(from, to); }
  };
  const relOf = (name) => path.join(rel, name).split(path.sep).join('/');
  const files = [];
  for (const c of pickClips(p.clips, best)) {
    const base = `clip${String(c.n).padStart(2, '0')}`;
    const from = path.join(folder, c.file), to = path.join(home, rel, base + '.mp4');
    const out = { n: c.n, title: c.title, caption: c.description || undefined, path: relOf(base + '.mp4') };
    if (fs.statSync(from).size <= limit) link(from, to);
    else if (shrink) {
      fs.rmSync(to, { force: true });
      try { await shrink(from, to, c.end - c.start, limit); out.note = 'made smaller to fit Telegram (20 MB)'; }
      catch (e) { link(from, to); out.note = `over 20 MB, too big for Telegram (could not make it smaller: ${e.message})`; }
    } else { link(from, to); out.note = 'over 20 MB: too big to send on Telegram'; }
    if (c.cover && fs.existsSync(path.join(folder, c.cover))) {
      link(path.join(folder, c.cover), path.join(home, rel, base + '_cover.jpg'));
      out.cover = relOf(base + '_cover.jpg');
    }
    files.push(out);
  }
  return { agent, folder: path.join(home, rel), files };
}

// Video bitrate (kbit/s) so a clip of this length lands under the limit, leaving room for 128k audio and overhead.
const fitKbps = (seconds, limit = SEND_LIMIT) => Math.max(300, Math.floor((limit * 8 * 0.92) / 1000 / Math.max(seconds, 1)) - 128);

// The installed Starnet's shortcut (Tauri's installer names it after the app), so App Hub can open Starnet.
function shortcut(env = process.env) {
  const menus = [env.APPDATA, env.ProgramData].filter(Boolean).map((b) => path.join(b, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
  return [...menus.flatMap((m) => [path.join(m, 'StarNet.lnk'), path.join(m, 'StarNet', 'StarNet.lnk')]),
    ...(env.USERPROFILE ? [path.join(env.USERPROFILE, 'Desktop', 'StarNet.lnk')] : [])].find((f) => fs.existsSync(f)) || null;
}

module.exports = { workspaces, videoKey, pickClips, summary, sendToStarnet, fitKbps, shortcut, SEND_LIMIT };
