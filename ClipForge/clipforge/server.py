"""The local web app: http://127.0.0.1:8765 (only reachable from this PC)."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Body, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import ai, config, doctor, download, edit, hyperframes, jobs, media, pipeline, shaders, styles, transcribe

app = FastAPI(title="ClipForge")
config.PROJECTS.mkdir(parents=True, exist_ok=True)
(config.DATA / "music").mkdir(exist_ok=True)
app.mount("/files", StaticFiles(directory=str(config.PROJECTS)), name="files")

VIDEO_EXT = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".flv", ".wmv", ".ts", ".mpg", ".mpeg"}


@app.get("/")
def index():
    return FileResponse(config.WEB / "index.html", headers={"Cache-Control": "no-store"})


@app.get("/api/status")
def status(fresh: bool = False) -> Dict[str, Any]:
    config.prepare_path()
    return {"ai": ai.status(fresh=fresh), "whisper": {"device": transcribe.device()},
            "ffmpeg": bool(config.tool("ffmpeg")), "hyperframes": hyperframes.ready(),
            "deno": bool(config.tool("deno") or shutil.which("node")),
            "encoder": "nvenc" if media.nvenc_works() else "x264",
            "music": len([p for p in (config.DATA / "music").glob("*")
                          if p.suffix.lower() in edit.MUSIC_EXT]),
            "jobs": jobs.active()}


@app.get("/api/doctor")
def doctor_report() -> Dict[str, Any]:
    return doctor.report()


@app.post("/api/doctor/fix-chrome")
def fix_chrome():
    if not hyperframes.ready():
        raise HTTPException(400, "HyperFrames is not installed - run Install.bat")

    def run(jid):
        jobs.progress(jid, 0.1, "Downloading Chrome for HyperFrames")
        jobs.log(jid, hyperframes.ensure_browser())
    return {"job": jobs.submit("fix", run)}


@app.get("/api/options")
def options():
    """The choice lists the UI shows - defined once, here, by the modules that own them."""
    return {"caption_styles": [[k, v.label] for k, v in styles.STYLES.items()],
            "transitions": [["auto", "Mix them up"], *shaders.NAMES.items()]}


@app.get("/api/settings")
def get_settings():
    return config.settings()


@app.post("/api/settings")
def set_settings(patch: Dict[str, Any] = Body(...)):
    s = config.update(patch)
    ai.status(fresh=True)
    return s




def _span(a: Any, b: Any) -> Optional[List[float]]:
    """Minutes from the form -> seconds, or None for the whole video."""
    try:
        lo = max(0.0, float(a or 0)) * 60
        hi = float(b) * 60 if str(b or "").strip() else 0.0
    except ValueError:
        raise HTTPException(400, "The time range must be minutes, like 12 or 12.5")
    if not lo and not hi:
        return None
    if hi and hi - lo < 60:
        raise HTTPException(400, "The time range must be at least a minute long")
    return [lo, hi or None]


@app.post("/api/projects")
def new_project(body: Dict[str, Any] = Body(...)):
    """One link/path per line - several lines make several projects."""
    topic = str(body.get("topic") or "")
    span = _span(body.get("from_min"), body.get("to_min"))
    lines = [x.strip().strip('"') for x in str(body.get("input") or "").splitlines() if x.strip()]
    if not lines:
        raise HTTPException(400, "Paste a YouTube link (or the full path of a video on this PC)")
    made = []
    for value in lines[:25]:
        if download.is_url(value):
            made.append(("url", value, ""))
            continue
        f = Path(value)
        if f.is_file() and f.suffix.lower() in VIDEO_EXT:
            made.append(("path", str(f), f.stem))
        else:
            raise HTTPException(400, f"Not a link or a video file: {value[:80]}")
    started = [pipeline.start(pipeline.create(k, v, n, topic, span)) for k, v, n in made]
    return {**started[0], "count": len(started)}


@app.post("/api/upload")
def upload(file: UploadFile = File(...), topic: str = Form(""), from_min: str = Form(""),
           to_min: str = Form("")):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in VIDEO_EXT:
        raise HTTPException(400, f"{ext or 'that file'} is not a video ClipForge can read")
    p = pipeline.create("upload", "", Path(file.filename).stem, topic, _span(from_min, to_min))
    d = pipeline.pdir(p["id"])
    tmp = d / ("upload" + ext)
    with open(tmp, "wb") as fh:
        shutil.copyfileobj(file.file, fh, 8 << 20)
    p["input"] = str(tmp)
    return pipeline.start(p)


@app.get("/api/projects")
def projects():
    return pipeline.listing()


def _load(pid: str) -> Dict[str, Any]:
    try:
        return pipeline.load(pid)
    except (ValueError, OSError):
        raise HTTPException(404, "no such project")


@app.get("/api/projects/{pid}")
def project(pid: str):
    p = _load(pid)
    for c in p["clips"]:
        c.pop("plan", None)
    return p


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    _load(pid)
    if any(j["project"] == pid for j in jobs.active()):
        raise HTTPException(409, "stop the job first")
    pipeline.delete(pid)
    return {"ok": True}


@app.post("/api/projects/{pid}/retry")
def retry(pid: str):
    return pipeline.start(_load(pid))


@app.post("/api/projects/{pid}/clips/{n}")
def rerender(pid: str, n: int, patch: Dict[str, Any] = Body(default={})):
    p = _load(pid)
    if not any(c["n"] == n for c in p["clips"]):
        raise HTTPException(404, "no such clip")
    jid = jobs.submit("rerender", pipeline.rerender, pid, n, patch, project=pid)
    return {"job": jid}


@app.post("/api/projects/{pid}/clips/{n}/titles")
def title_ideas(pid: str, n: int):
    from . import highlights
    c = next((c for c in _load(pid)["clips"] if c["n"] == n), None)
    if not c:
        raise HTTPException(404, "no such clip")
    return highlights.title_ideas(c.get("text", ""), c.get("title", ""))


@app.post("/api/projects/{pid}/rerender_all")
def rerender_all(pid: str):
    p = _load(pid)
    ids = [jobs.submit("rerender", pipeline.rerender, pid, c["n"], {}, project=pid)
           for c in p["clips"]]
    return {"jobs": ids}


@app.get("/api/projects/{pid}/zip")
def download_all(pid: str):
    p = _load(pid)
    if not any(c.get("file") for c in p["clips"]):
        raise HTTPException(404, "no finished clips yet")
    safe = re.sub(r"[^\w\- ]", "", p["title"])[:60].strip() or "clips"
    return FileResponse(pipeline.bundle(pid), filename=f"{safe} - clips.zip")


@app.post("/api/projects/{pid}/open")
def open_folder(pid: str):
    return _open(pipeline.pdir(pid) / "clips")


@app.post("/api/music/open")
def open_music():
    return _open(config.DATA / "music")


def _open(d: Path):
    d.mkdir(parents=True, exist_ok=True)
    if sys.platform == "win32":
        os.startfile(str(d))                              # noqa: S606 - local folder
    elif sys.platform == "darwin":
        subprocess.Popen(["open", str(d)])
    else:
        subprocess.Popen(["xdg-open", str(d)], stderr=subprocess.DEVNULL)
    return {"ok": True}


@app.get("/api/jobs/{jid}")
def job(jid: str):
    j = jobs.get(jid)
    if not j:
        raise HTTPException(404, "no such job (the app was restarted)")
    j.pop("result", None)
    return j


@app.post("/api/jobs/{jid}/cancel")
def cancel(jid: str):
    return {"ok": jobs.cancel(jid)}


def main() -> None:
    import argparse
    import socket
    import uvicorn
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=0,
                    help="port to listen on (0 = first free port, printed as CLIPFORGE_PORT)")
    ap.add_argument("--open-browser", action="store_true",
                    help="open the UI in the system browser (omit when embedded in App Hub)")
    a = ap.parse_args()
    port = a.port
    if port == 0:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        sock.close()
    for pid in pipeline.recover():
        print(f"  Picking up where it stopped: {pid}")
    print(f"CLIPFORGE_PORT={port}", flush=True)
    print(f"\n  ClipForge is running:  http://127.0.0.1:{port}\n  Close this window to stop it.\n")
    if a.open_browser:
        import threading
        import webbrowser

        def _open() -> None:
            import time
            time.sleep(0.6)
            webbrowser.open(f"http://127.0.0.1:{port}")

        threading.Thread(target=_open, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
