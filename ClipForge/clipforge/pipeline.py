"""Link or file in, finished clips out. Each project is a folder in
data/projects/<id>/ with project.json, the source, the transcript and clips/.
"""
from __future__ import annotations

import json
import re
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from . import captions, config, cover, download, edit, highlights, jobs, media, transcribe

_LOCK = threading.Lock()


def pdir(pid: str) -> Path:
    if not re.fullmatch(r"[a-z0-9]{6,20}", pid or ""):
        raise ValueError("bad project id")
    return config.PROJECTS / pid


def _retry(fn: Callable[[], Any]) -> Any:
    """Windows refuses to open or replace a file for a moment while anything
    else holds it (antivirus, the search indexer), so try for a few seconds."""
    for wait in (0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2):
        try:
            return fn()
        except PermissionError:
            time.sleep(wait)
    return fn()


def load(pid: str) -> Dict[str, Any]:
    f = pdir(pid) / "project.json"
    with _LOCK:                                   # never read half-way through a save
        return json.loads(_retry(lambda: f.read_text(encoding="utf-8")))


def save(p: Dict[str, Any]) -> None:
    with _LOCK:
        d = pdir(p["id"])
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / "project.tmp"
        tmp.write_text(json.dumps(p, indent=1), encoding="utf-8")
        _retry(lambda: tmp.replace(d / "project.json"))


def create(kind: str, value: str, name: str = "", topic: str = "",
           span: Optional[List[float]] = None) -> Dict[str, Any]:
    """span: only look for clips between these two times (seconds), or None."""
    pid = time.strftime("%y%m%d") + uuid.uuid4().hex[:6]
    p = {"id": pid, "title": name or value[:80], "kind": kind, "input": value,
         "created": time.time(), "status": "queued", "source": None, "clips": [],
         "error": None, "topic": (topic or "").strip()[:200], "span": span}
    save(p)
    return p


def listing() -> List[Dict[str, Any]]:
    out = []
    if config.PROJECTS.exists():
        for f in config.PROJECTS.glob("*/project.json"):
            try:
                p = json.loads(f.read_text(encoding="utf-8"))
                out.append({k: p.get(k) for k in ("id", "title", "status", "created", "error",
                                                  "thumb")} | {"clips": len(p["clips"])})
            except (OSError, ValueError, KeyError):
                continue
    return sorted(out, key=lambda p: p["created"] or 0, reverse=True)


def delete(pid: str) -> None:
    shutil.rmtree(pdir(pid), ignore_errors=True)


# ------------------------------------------------------------------ jobs

FINISHED = ("done", "error", "cancelled")       # a project in any other state has work left


def start(p: Dict[str, Any]) -> Dict[str, Any]:
    """Queue a project's processing job (picks up wherever it stopped)."""
    p.update(status="queued", error=None)
    save(p)                                   # saved before the worker can load it
    return {"project": p["id"], "job": jobs.submit("process", process, p["id"], project=p["id"])}


def process(jid: str, pid: str) -> Dict[str, Any]:
    """The whole job, one stage after another. Every stage keeps its result
    (the download, the transcript, the picked clips, each finished clip), so
    a retry or a restart carries on instead of starting over."""
    p = load(pid)
    say = lambda m: jobs.log(jid, m)                        # noqa: E731

    def stage(status: str, at: float, label: str) -> None:
        p["status"] = status
        save(p)
        jobs.progress(jid, at, label)

    try:
        if not p.get("source"):
            stage("downloading", 0.01, "Getting the video")
            _source(jid, p, say)
        words = _transcript(jid, p, say, stage)
        if not p["clips"]:
            stage("finding", 0.45, "Finding the best moments")
            _moments(jid, p, words, say)
        stage("rendering", 0.52, "Editing")
        n = len(p["clips"])
        for k, c in enumerate(p["clips"]):
            if c.get("state") != "done" or not c.get("file"):
                _render_one(jid, p, c, words, 0.52 + 0.48 * k / n, 0.52 + 0.48 * (k + 1) / n,
                            f"Editing clip {k + 1} of {n}")
        p["status"] = "done"
        save(p)
        return {"project": pid, "clips": n}
    except jobs.Cancelled:
        p["status"] = "cancelled"
        save(p)
        raise
    except Exception as exc:
        p["status"], p["error"] = "error", f"{exc}"[:500]
        save(p)
        raise


def _source(jid: str, p: Dict[str, Any], say: Callable[[str], None]) -> None:
    """The video, into the project folder: downloaded, copied from a path on
    this PC, or the upload that is already there."""
    d = pdir(p["id"])
    if p["kind"] == "url":
        say(f"Downloading {p['input']}")
        src = download.download(p["input"], d, log=say,
                                on_progress=jobs.scoped(jid, 0.01, 0.15, "Downloading"))
    else:
        f = Path(p["input"].strip().strip('"'))
        if p["kind"] == "path":                      # the user's own file stays where it is
            say(f"Copying {f.name}")
            shutil.copy2(f, d / ("in" + f.suffix.lower()))
            f = d / ("in" + f.suffix.lower())
        src = {**download.import_file(f, d), "title": p["title"]}
    p.update(source=src, title=src["title"])
    try:
        media.thumbnail(Path(src["path"]), d / "thumb.jpg", at=min(30.0, src["duration"] / 3 or 1))
        p["thumb"] = "thumb.jpg"
    except media.FFmpegError:
        pass
    save(p)
    say(f"Source: {src['title']} ({src['duration'] / 60:.1f} min)")


def _transcript(jid: str, p: Dict[str, Any], say, stage) -> List[Dict[str, Any]]:
    tf = pdir(p["id"]) / "transcript.json"
    if tf.exists():
        tr = json.loads(tf.read_text(encoding="utf-8"))
    else:
        stage("transcribing", 0.15, "Transcribing")
        tr = transcribe.transcribe(Path(p["source"]["path"]), log=say,
                                   on_progress=jobs.scoped(jid, 0.15, 0.45, "Transcribing"))
        tf.write_text(json.dumps(tr), encoding="utf-8")
    say(f"{len(tr['words'])} words transcribed")
    return tr["words"]


def _moments(jid: str, p: Dict[str, Any], words: List[Dict[str, Any]], say) -> None:
    """Pick the clips - within the time range and on the topic, if given."""
    energy = media.energy(Path(p["source"]["path"]))
    if p.get("span"):
        a, b = float(p["span"][0] or 0), float(p["span"][1] or 1e9)
        words = [w for w in words if a <= w["s"] and w["e"] <= b]
        say(f"Only looking between {a / 60:.1f} and {min(b, float(p['source']['duration'] or b)) / 60:.1f} min")
    if p.get("topic"):
        say(f"Looking for clips about: {p['topic']}")
    found = highlights.find(words, energy, topic=p.get("topic", ""), log=say,
                            on_progress=jobs.scoped(jid, 0.46, 0.52, "AI is picking clips"))
    for c in found:
        c.update(state="queued", file=None, thumb=None)
    p["clips"] = found
    save(p)
    say("Picked: " + "; ".join(f"#{c['n']} {c['title']} ({c['score']})" for c in found))


def _render_one(jid: str, p: Dict[str, Any], c: Dict[str, Any], words, lo: float, hi: float,
                stage: str) -> None:
    d = pdir(p["id"])
    (d / "clips").mkdir(exist_ok=True)
    c["state"] = "rendering"
    save(p)
    jobs.log(jid, f"{stage}: \"{c['title']}\" ({c['end'] - c['start']:.0f}s)")
    work = d / "work" / str(c["n"])
    ver = int(c.get("ver", 0)) + 1
    out = d / "clips" / f"clip{c['n']:02d}_v{ver}.mp4"
    try:
        r = edit.render(Path(p["source"]["path"]), c, words, work, out,
                        on_progress=jobs.scoped(jid, lo, hi, stage),
                        log=lambda m: jobs.log(jid, m))
    except jobs.Cancelled:
        c["state"] = "queued" if not c.get("file") else "done"
        raise
    except Exception as exc:
        c["state"], c["error"] = "error", str(exc)[:300]
        jobs.log(jid, f"Clip {c['n']} failed: {exc}")
        save(p)
        return
    old = {k: c.get(k) for k in _FILES}
    c.update(_companions(jid, p, c, r, out, work), file=f"clips/{out.name}", state="done",
             split=bool(r["split"]), duration=r["duration"], renderer=r["renderer"], plan=r["plan"],
             ver=ver, error=None, rendered=time.time())
    save(p)
    for f in set(old.values()) - {c.get(k) for k in _FILES} - {None}:   # the previous version
        (d / f).unlink(missing_ok=True)
    shutil.rmtree(work, ignore_errors=True)


_FILES = ("file", "thumb", "srt", "cover")      # what a rendered clip is made of on disk


def _companions(jid: str, p: Dict[str, Any], c: Dict[str, Any], r: Dict[str, Any], out: Path,
                work: Path) -> Dict[str, Optional[str]]:
    """The files that go with a clip - subtitles, a thumbnail for the UI, a
    cover image. Each is a nice-to-have: one failing doesn't fail the clip."""
    got: Dict[str, Optional[str]] = {}
    for key, path, make in (
            ("srt", out.with_suffix(".srt"),
             lambda f: f.write_text(captions.srt(r["words"]), encoding="utf-8")),
            ("thumb", out.with_suffix(".jpg"),
             lambda f: media.thumbnail(out, f, at=min(2.0, r["duration"] / 2))),
            ("cover", out.with_name(out.stem + "_cover.jpg"),
             lambda f: cover.make(Path(p["source"]["path"]), c, r["plan"], work, f))):
        try:
            make(path)
            got[key] = f"clips/{path.name}"
        except Exception as exc:
            got[key] = None
            jobs.log(jid, f"No {key} for clip {c['n']}: {str(exc)[:120]}")
    return got


def rerender(jid: str, pid: str, n: int, patch: Dict[str, Any]) -> Dict[str, Any]:
    p = load(pid)
    c = next(c for c in p["clips"] if c["n"] == n)
    dur = float(p["source"]["duration"] or 1e9)
    for k in ("title", "description"):
        if k in patch:
            c[k] = str(patch[k])[:200 if k == "title" else 500]
    if "start" in patch or "end" in patch:
        s = max(0.0, float(patch.get("start", c["start"])))
        e = min(dur, float(patch.get("end", c["end"])))
        if e - s < 3:
            raise ValueError("a clip has to be at least 3 seconds long")
        c["start"], c["end"] = round(s, 3), round(e, 3)
    tf = pdir(pid) / "transcript.json"
    tr = json.loads(tf.read_text(encoding="utf-8"))
    if str(patch.get("caption_text") or "").strip():
        # a fix to the words goes into the transcript itself, so every
        # re-render (and any other clip over the same moment) gets it
        tr["words"] = fix_words(tr["words"], c["start"], c["end"], str(patch["caption_text"]))
        tf.write_text(json.dumps(tr), encoding="utf-8")
        jobs.log(jid, "Caption text updated")
    words = tr["words"]
    c["text"] = " ".join(w["w"] for w in words if c["start"] <= w["s"] < c["end"])
    _render_one(jid, p, c, words, 0.0, 1.0, f"Re-editing clip {n}")
    if c["state"] == "error":
        raise RuntimeError(c.get("error") or "render failed")
    return {"project": pid, "clip": n}


def fix_words(words: List[Dict[str, Any]], start: float, end: float,
              text: str) -> List[Dict[str, Any]]:
    """Swap the words between start and end for the user's corrected text,
    keeping the timing: unchanged words keep theirs, a replaced run shares
    out the old run's time by word length, a new word borrows its neighbour's."""
    import difflib
    inside = [i for i, w in enumerate(words) if start - 0.05 <= w["s"] < end]
    if not inside:
        return words
    old = [words[i] for i in inside]
    new = text.split()[:2000]
    key = lambda t: re.sub(r"[^\w']", "", t.lower())          # noqa: E731
    sm = difflib.SequenceMatcher(a=[key(w["w"]) for w in old], b=[key(t) for t in new], autojunk=False)
    out: List[Dict[str, Any]] = []
    for op, a0, a1, b0, b1 in sm.get_opcodes():
        if op == "equal":
            out += [{**old[a0 + k], "w": new[b0 + k]} for k in range(a1 - a0)]
        elif op == "delete":
            continue
        else:
            if a1 > a0:
                s0, s1 = old[a0]["s"], old[a1 - 1]["e"]
            else:                                   # an inserted word: squeeze it in after the last one
                s0 = out[-1]["e"] if out else old[0]["s"]
                s1 = old[a0]["s"] if a0 < len(old) else s0 + 0.3
                if s1 - s0 < 0.12:
                    s1 = s0 + 0.12
            toks = new[b0:b1]
            weights = [max(1, len(key(t))) for t in toks]
            tot, t = float(sum(weights)), s0
            for tok, wt in zip(toks, weights):
                d = (s1 - s0) * wt / tot
                out.append({"w": tok, "s": round(t, 3), "e": round(t + d, 3), "p": 1.0})
                t += d
    return words[:inside[0]] + out + words[inside[-1] + 1:]


def new_clip(pid: str, start: float, end: float, title: str = "") -> Dict[str, Any]:
    """A clip the user picked by hand (from the transcript), checked but not
    saved yet - make_clip adds it inside a job."""
    from .highlights import _title_from
    p = load(pid)
    words = json.loads((pdir(pid) / "transcript.json").read_text(encoding="utf-8"))["words"]
    dur = float((p.get("source") or {}).get("duration") or 1e9)
    s, e = max(0.0, float(start)), min(dur, float(end))
    if e - s < 3:
        raise ValueError("a clip has to be at least 3 seconds long")
    if e - s > 180:
        raise ValueError("keep a clip under 3 minutes")
    text = " ".join(w["w"] for w in words if s <= w["s"] < e)
    return {"start": round(s, 3), "end": round(e, 3),
         "title": (title or "").strip()[:80] or _title_from(text) or "My clip", "description": "",
         "reason": "Picked by you", "score": None, "source": "manual", "text": text,
         "scores": None, "keywords": [], "emojis": {}, "state": "queued", "file": None, "thumb": None}


def make_clip(jid: str, pid: str, clip: Dict[str, Any]) -> Dict[str, Any]:
    """Job: add a hand-picked clip and render it. Done on the job thread, after
    any job already running, because a running job saves its own copy of the
    project when it finishes and would drop a clip added in the meantime."""
    p = load(pid)
    n = max((c["n"] for c in p["clips"]), default=0) + 1
    p["clips"].append({"n": n, **clip})
    save(p)
    return rerender(jid, pid, n, {})


def delete_clip(pid: str, n: int) -> None:
    p = load(pid)
    c = next((c for c in p["clips"] if c["n"] == n), None)
    if c is None:
        raise KeyError(n)
    p["clips"] = [x for x in p["clips"] if x["n"] != n]
    save(p)
    for k in _FILES:
        if c.get(k):
            (pdir(pid) / c[k]).unlink(missing_ok=True)


def recover() -> List[str]:
    """After a restart nothing is running: every project with work left is
    queued again and carries on where it stopped. Returns their ids."""
    resumed = []
    for item in reversed(listing()):                # oldest first
        if item["status"] in FINISHED:
            continue
        try:
            p = load(item["id"])
        except (OSError, ValueError):
            continue
        for c in p["clips"]:
            if c.get("state") == "rendering":
                c["state"] = "done" if c.get("file") else "queued"
        start(p)
        resumed.append(p["id"])
    return resumed


def bundle(pid: str) -> Path:
    """Every finished clip + its subtitles + a text file of titles and post
    captions, in one zip (stored, not compressed - video does not shrink)."""
    import zipfile
    p = load(pid)
    d = pdir(pid)
    out = d / "clips.zip"
    notes = []
    with zipfile.ZipFile(out, "w", zipfile.ZIP_STORED) as z:
        for c in p["clips"]:
            if not c.get("file"):
                continue
            safe = re.sub(r'[\\/:*?"<>|]', "", c["title"])[:50].strip() or "clip"
            name = f"{c['n']:02d} {safe}"
            z.write(d / c["file"], name + ".mp4")
            for key, ext in (("srt", ".srt"), ("cover", " cover.jpg")):
                if c.get(key) and (d / c[key]).exists():
                    z.write(d / c[key], name + ext)
            score = "picked by you" if c.get("score") is None else f"score {c['score']}"
            notes.append(f"#{c['n']}  {c['title']}  ({score})\n{c.get('description', '')}\n")
        z.writestr("captions.txt", "\n".join(notes))
    return out
