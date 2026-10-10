"""Paths and settings.

Every path is relative to this folder, so ClipForge can be moved anywhere on
the machine - drag the folder, run Start.bat, nothing else to change.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import threading
from pathlib import Path
from typing import Any, Dict, Optional

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PROJECTS = DATA / "projects"
ASSETS = ROOT / "assets"
BIN = ROOT / "bin"
WEB = ROOT / "web"
SETTINGS_FILE = DATA / "settings.json"
WINDOWS = os.name == "nt"
NOWIN = 0x08000000 if WINDOWS else 0          # CREATE_NO_WINDOW: no console flashes

DEFAULTS: Dict[str, Any] = {
    # what gets made
    "clip_count": 5,
    "clip_length": "medium",          # short 15-35s | medium 25-60s | long 45-90s
    # the edit
    "caption_style": "bold",          # see styles.STYLES
    "caption_position": "auto",       # auto (just below the face) | top | middle | bottom
    "hook_style": "card",             # card | slam | type
    "motion_graphics": True,          # stat cards for spoken numbers, hand-drawn underlines
    "flash": True,                    # impact flash on each zoom
    "transitions": "subtle",          # off | subtle | bold - WebGL shader transitions on jump cuts
    "transition_style": "auto",       # auto (rotate) or one of shaders.NAMES
    "look": "none",                   # none | vignette | grain | film (both)
    "accent": "#FFD400",              # the active word / highlights
    "accent2": "#39FF88",             # emphasised words (numbers, names, key terms)
    "hook_title": True,
    "progress_bar": True,
    "remove_silence": True,
    "remove_fillers": True,
    "punch_in": True,
    "layout": "auto",                 # auto = split screen for two-person shots | fill
    "color_polish": True,
    "emojis": True,                   # an emoji pops above key captions
    "sfx": True,                      # whoosh on zooms and the hook, pop on emojis
    "music": True,                    # a track from data/music under the voice (ducked)
    "music_volume": 0.14,
    "watermark": "",                  # e.g. @yourhandle, shown small at the bottom
    # speech to text
    "whisper_model": "auto",          # auto | large-v3-turbo | medium | small | base
    "whisper_device": "auto",         # auto | cuda | cpu
    # AI that picks and titles the moments
    "ai_provider": "auto",            # auto | omniroute | ollama | off
    "omniroute_url": "http://localhost:20128/v1",
    "omniroute_key": "",
    "omniroute_model": "auto",
    "ollama_url": "http://localhost:11434",
    "ollama_model": "",               # blank = the best installed chat model
    # rendering
    "renderer": "auto",               # auto | hyperframes | ass
    "hf_browser_path": "",            # blank = let HyperFrames find Chrome
    "encoder": "auto",                # auto | nvenc | x264
    # downloading
    "cookies_browser": "",            # "" = none, or firefox / chrome / edge
    "max_height": 1080,
}

LENGTHS = {"short": (15, 35), "medium": (25, 60), "long": (45, 90)}

_lock = threading.Lock()


def _read() -> Dict[str, Any]:
    try:
        return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def settings() -> Dict[str, Any]:
    return {**DEFAULTS, **{k: v for k, v in _read().items() if k in DEFAULTS}}


def get(key: str, default: Any = None) -> Any:
    return settings().get(key, DEFAULTS.get(key, default))


def update(patch: Dict[str, Any]) -> Dict[str, Any]:
    """Merge known keys into the saved settings; unknown keys are ignored."""
    with _lock:
        cur = _read()
        for k, v in (patch or {}).items():
            if k in DEFAULTS:
                cur[k] = v
        DATA.mkdir(parents=True, exist_ok=True)
        tmp = SETTINGS_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(cur, indent=2), encoding="utf-8")
        tmp.replace(SETTINGS_FILE)
    return settings()


def clip_bounds() -> tuple:
    return LENGTHS.get(str(get("clip_length")), LENGTHS["medium"])


# ---------------------------------------------------------------- tools

def _exe(name: str) -> str:
    return name + ".exe" if WINDOWS else name


def tool(name: str) -> Optional[str]:
    """A bundled copy in bin/ first, then whatever is on PATH."""
    local = BIN / _exe(name)
    if local.exists():
        return str(local)
    return shutil.which(name)


def ffmpeg() -> str:
    return tool("ffmpeg") or "ffmpeg"


def ffprobe() -> str:
    return tool("ffprobe") or "ffprobe"


def prepare_path() -> None:
    """Put bin/ on PATH for child processes - yt-dlp finds deno there, and
    HyperFrames finds ffmpeg there."""
    if BIN.exists() and str(BIN) not in os.environ.get("PATH", ""):
        os.environ["PATH"] = str(BIN) + os.pathsep + os.environ.get("PATH", "")


def hyperframes_cmd() -> Optional[list]:
    """The pinned HyperFrames in node_modules, else a global one."""
    names = ("hyperframes.cmd", "hyperframes") if WINDOWS else ("hyperframes",)
    for n in names:
        p = ROOT / "node_modules" / ".bin" / n
        if p.exists():
            return [str(p)]
    found = shutil.which("hyperframes")
    return [found] if found else None


def python() -> str:
    return sys.executable
