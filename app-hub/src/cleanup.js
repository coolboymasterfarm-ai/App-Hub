// Free up disk space: finished ClipForge videos older than N days, and the clip copies App Hub put in Starnet
// agents' folders (<workspaces>\<agent>\clipforge\<video id>\). Pure Node, tested with `node --test`.
const fs = require('fs');
const path = require('path');

const FINISHED = ['done', 'error', 'cancelled']; // a video still being made is never deleted
const dirs = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };

// Every file under dir: [{ key: device+inode, size, links }].
function files(dir, out = []) {
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files(p, out);
    else if (e.isFile()) {
      try { const s = fs.statSync(p, { bigint: true }); out.push({ key: `${s.dev}:${s.ino}`, size: Number(s.size), links: Number(s.nlink) }); } catch { /* gone */ }
    }
  }
  return out;
}

// Bytes really freed by deleting these folders. Starnet's copies are often hard links to the clip itself
// (no extra space), so a file counts only when every link to it is being deleted.
function freedBytes(folders) {
  const seen = new Map();
  for (const f of folders.flatMap((d) => files(d))) {
    const s = seen.get(f.key) || { ...f, found: 0 };
    s.found++;
    seen.set(f.key, s);
  }
  let n = 0;
  for (const s of seen.values()) if (s.found >= s.links) n += s.size;
  return n;
}

// What would be deleted: { videos: [{ id, title, dir }], copies: [{ agent, id, dir }], bytes }.
// days = 0 means every finished video. A Starnet copy goes when it is older than that, or its video goes.
function plan({ projects, workspaces, days, now = Date.now() }) {
  const cutoff = now - Math.max(0, Number(days) || 0) * 86400000;
  const videos = [];
  for (const id of dirs(projects)) {
    let p;
    try { p = JSON.parse(fs.readFileSync(path.join(projects, id, 'project.json'), 'utf8')); } catch { continue; }
    const made = Number(p.created || 0) * 1000; // ClipForge stores seconds
    if (FINISHED.includes(p.status) && made <= cutoff) videos.push({ id, title: p.title || id, dir: path.join(projects, id) });
  }
  const gone = new Set(videos.map((v) => v.id));
  const copies = [];
  for (const agent of workspaces ? dirs(workspaces) : []) {
    const base = path.join(workspaces, agent, 'clipforge');
    for (const id of dirs(base)) {
      const dir = path.join(base, id);
      let old = false;
      try { old = fs.statSync(dir).mtimeMs <= cutoff; } catch { continue; }
      if (old || gone.has(id)) copies.push({ agent, id, dir });
    }
  }
  return { videos, copies, bytes: freedBytes([...videos, ...copies].map((x) => x.dir)) };
}

// Deletes what plan() found (looked up again, so nothing changed in between is touched). Returns { freed, deleted }.
function run(opts) {
  const p = plan(opts);
  let deleted = 0;
  for (const x of [...p.copies, ...p.videos]) {
    try { fs.rmSync(x.dir, { recursive: true, force: true }); deleted++; } catch { /* in use: left for next time */ }
  }
  return { freed: p.bytes, deleted, videos: p.videos.length, copies: p.copies.length };
}

const sizeText = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : Math.round(b / 1e3) + ' KB');

module.exports = { plan, run, freedBytes, sizeText };
