"""Getting the source video: a YouTube (or any yt-dlp-supported) link, or a
file the user dropped in."""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from . import config

URL_RE = re.compile(r"^https?://", re.I)


def is_url(s: str) -> bool:
    return bool(URL_RE.match((s or "").strip()))


def _js_runtimes() -> Dict[str, Dict[str, str]]:
    """YouTube now needs a JavaScript runtime to solve its player challenge.
    Deno is the one yt-dlp enables by default; Node 22+ works as well."""
    rt: Dict[str, Dict[str, str]] = {}
    deno = config.tool("deno")
    if deno:
        rt["deno"] = {"path": deno}
    node = shutil.which("node")
    if node:
        rt["node"] = {"path": node}
    return rt or {"deno": {}}


def _opts(dest: Path, hook: Callable, cookies: str) -> Dict[str, Any]:
    h = int(config.get("max_height") or 1080)
    o: Dict[str, Any] = {
        "format": (f"bv*[height<={h}][ext=mp4]+ba[ext=m4a]/bv*[height<={h}]+ba/"
                   f"b[height<={h}]/b"),
        "merge_output_format": "mp4",
        "outtmpl": str(dest / "source.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "progress_hooks": [hook],
        "js_runtimes": _js_runtimes(),
        # yt-dlp-ejs ships with yt-dlp[default]; allow the GitHub copy as a
        # fallback so an incomplete install still downloads
        "remote_components": ["ejs:github"],
        "retries": 5,
        "fragment_retries": 10,
        "concurrent_fragment_downloads": 4,
    }
    ff = config.tool("ffmpeg")
    if ff:
        o["ffmpeg_location"] = str(Path(ff).parent)
    if cookies:
        o["cookiesfrombrowser"] = (cookies,)
    return o


def download(url: str, dest: Path, *, on_progress: Optional[Callable[[float], None]] = None,
             log: Callable[[str], None] = print) -> Dict[str, Any]:
    import yt_dlp

    config.prepare_path()
    dest.mkdir(parents=True, exist_ok=True)

    def hook(d: Dict[str, Any]) -> None:
        if d.get("status") == "downloading" and on_progress:
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            if total:
                on_progress(min(0.99, d.get("downloaded_bytes", 0) / total))

    cookies = str(config.get("cookies_browser") or "").strip()
    attempts = [cookies] if cookies else ["", "firefox"]
    last: Optional[Exception] = None
    for c in attempts:
        try:
            if c:
                log(f"Retrying with your {c} cookies (YouTube asked us to sign in)")
            with yt_dlp.YoutubeDL(_opts(dest, hook, c)) as ydl:
                info = ydl.extract_info(url.strip(), download=True)
            break
        except Exception as exc:          # yt_dlp.utils.DownloadError and friends
            last = exc
            msg = str(exc)
            bot = re.search(r"sign in|confirm you.re not a bot|cookies", msg, re.I)
            if not (bot and c == "" and "firefox" in attempts):
                raise RuntimeError(_friendly(msg)) from exc
    else:
        raise RuntimeError(_friendly(str(last)))

    files = sorted(dest.glob("source.*"), key=lambda p: p.stat().st_size, reverse=True)
    files = [f for f in files if f.suffix.lower() not in (".part", ".ytdl", ".json")]
    if not files:
        raise RuntimeError("the download finished but no video file was written")
    return {"path": str(files[0]), "title": info.get("title") or "Untitled video",
            "duration": float(info.get("duration") or 0),
            "uploader": info.get("uploader") or info.get("channel") or "",
            "thumbnail": info.get("thumbnail") or "", "url": url.strip()}


def _friendly(msg: str) -> str:
    m = msg.replace("ERROR: ", "").strip()
    if re.search(r"javascript|js runtime|challenge", m, re.I):
        return ("YouTube needs a JavaScript runtime to download. Run Install.bat again - "
                "it puts deno in the bin folder. (" + m[:160] + ")")
    if re.search(r"sign in|not a bot", m, re.I):
        return ("YouTube wants a signed-in browser. Log in to YouTube in Firefox, close "
                "Firefox, and try again. (" + m[:160] + ")")
    if re.search(r"private|unavailable|removed", m, re.I):
        return "That video is private, removed or unavailable in your country."
    return m[:400]


def import_file(src: Path, dest: Path) -> Dict[str, Any]:
    """A file the user uploaded: moved into the project as its source."""
    from . import media
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / ("source" + src.suffix.lower())
    if src.resolve() != target.resolve():
        shutil.move(str(src), str(target))
    info = media.probe(target)
    return {"path": str(target), "title": src.stem.replace("_", " ").strip() or "Upload",
            "duration": info["duration"], "uploader": "", "thumbnail": "", "url": ""}
