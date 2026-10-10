"""Running HyperFrames: writing a project folder and calling its CLI.

Everything that talks to the `hyperframes` executable lives here - the
caption overlay (overlay.py), the shader transitions (shaders.py) and the
system check (server.py) only hand over HTML and read back a file or a
report.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

from . import config

_CONFIG = {"$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
           "paths": {"blocks": "compositions", "components": "compositions/components",
                     "assets": "assets"}}


def ready() -> bool:
    return config.hyperframes_cmd() is not None


def env() -> Dict[str, str]:
    e = {**os.environ, "HYPERFRAMES_NO_TELEMETRY": "1", "HYPERFRAMES_NO_UPDATE_CHECK": "1"}
    chrome = str(config.get("hf_browser_path") or "").strip()
    if chrome:
        e["HYPERFRAMES_BROWSER_PATH"] = chrome
    return e


def project(proj: Path, index_html: str, files: Mapping[str, Path] = {}) -> Path:
    """A fresh project folder: the composition, GSAP, and `files`
    (name inside the project -> file to copy there)."""
    shutil.rmtree(proj, ignore_errors=True)
    proj.mkdir(parents=True)
    (proj / "index.html").write_text(index_html, encoding="utf-8")
    (proj / "hyperframes.json").write_text(json.dumps(_CONFIG), encoding="utf-8")
    (proj / "meta.json").write_text(json.dumps({"id": "cf", "name": proj.name}), encoding="utf-8")
    shutil.copy2(config.ASSETS / "js" / "gsap.min.js", proj / "gsap.min.js")
    for name, src in files.items():
        (proj / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, proj / name)
    return proj


def render(proj: Path, out: Path, duration: float, fmt: str = "mov", fps: int = 30) -> Optional[str]:
    """`hyperframes render` a project folder to `out` (mov = transparent
    ProRes 4444, mp4 = opaque). Returns an error message, or None."""
    cmd = config.hyperframes_cmd()
    if not cmd:
        return "HyperFrames is not installed (run Install.bat)"
    config.prepare_path()
    out = out.resolve()                   # the CLI runs inside proj: absolute or it lands there
    out.unlink(missing_ok=True)
    quality = ["-q", "high"] if fmt == "mp4" else []
    try:
        r = subprocess.run([*cmd, "render", "--format", fmt, *quality, "-o", str(out),
                            "--fps", str(fps), "--quiet", str(proj)],
                           cwd=str(proj), capture_output=True, text=True,
                           timeout=int(300 + duration * 20), env=env(),
                           creationflags=config.NOWIN)
    except subprocess.TimeoutExpired:
        return "HyperFrames took too long"
    except OSError as exc:
        return f"HyperFrames could not start: {exc}"
    if r.returncode != 0 or not out.exists() or out.stat().st_size < 1000:
        tail = (r.stderr or r.stdout or "").strip().splitlines()[-6:]
        return "HyperFrames failed: " + " | ".join(tail)[:600]
    return None


def doctor() -> Dict[str, Dict[str, Any]]:
    """`hyperframes doctor`, as {check name: {ok, detail, hint}}."""
    r = subprocess.run([*config.hyperframes_cmd(), "doctor", "--json"], capture_output=True,
                       text=True, timeout=90, env=env(), creationflags=config.NOWIN)
    return {c["name"]: c for c in json.loads(r.stdout or "{}").get("checks", [])}


def ensure_browser() -> str:
    """Download the Chrome build HyperFrames renders with (if missing)."""
    r = subprocess.run([*config.hyperframes_cmd(), "browser", "ensure"], capture_output=True,
                       text=True, timeout=900, env=env(), creationflags=config.NOWIN)
    if r.returncode:
        raise RuntimeError("could not download Chrome - check your internet connection")
    return (r.stdout or r.stderr or "")[-500:]
