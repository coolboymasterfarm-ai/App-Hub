"""ffmpeg / ffprobe, run safely."""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional

from . import config

Progress = Optional[Callable[[float], None]]


class FFmpegError(RuntimeError):
    def __init__(self, msg: str, log: str = ""):
        super().__init__(msg)
        self.log = log


# path -> ((modified time, size), probe result). Every clip of a video probes the same source file.
_PROBED: Dict[str, tuple] = {}


def probe(path: Path | str) -> Dict:
    try:
        st = os.stat(path)
        stamp = (st.st_mtime_ns, st.st_size)
    except OSError:
        stamp = None
    hit = _PROBED.get(str(path))
    if stamp and hit and hit[0] == stamp:
        return dict(hit[1])
    info = _probe(path)
    if stamp:
        if len(_PROBED) > 64:
            _PROBED.clear()
        _PROBED[str(path)] = (stamp, info)
    return dict(info)


def _probe(path: Path | str) -> Dict:
    r = subprocess.run([config.ffprobe(), "-v", "error", "-print_format", "json",
                        "-show_format", "-show_streams", str(path)],
                       capture_output=True, text=True, creationflags=config.NOWIN)
    if r.returncode != 0:
        raise FFmpegError(f"ffprobe could not read {path}", r.stderr)
    d = json.loads(r.stdout or "{}")
    v = next((s for s in d.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in d.get("streams", []) if s.get("codec_type") == "audio"), None)
    fps = 30.0
    rate = v.get("avg_frame_rate") or v.get("r_frame_rate") or "30/1"
    try:
        n, dd = rate.split("/")
        fps = float(n) / float(dd) if float(dd) else 30.0
    except (ValueError, ZeroDivisionError):
        pass
    return {"duration": float(d.get("format", {}).get("duration") or v.get("duration") or 0),
            "width": int(v.get("width") or 0), "height": int(v.get("height") or 0),
            "fps": fps or 30.0, "has_audio": a is not None}


class _Watchdog:
    """Kills a process that shows no sign of life for `limit` seconds."""

    def __init__(self, proc: subprocess.Popen, limit: float):
        self.proc, self.limit, self.fired = proc, limit, False
        self.pet()
        threading.Thread(target=self._watch, daemon=True).start()

    def pet(self) -> None:
        self.last = time.monotonic()

    def _watch(self) -> None:
        while self.proc.poll() is None:
            if time.monotonic() - self.last > self.limit:
                self.fired = True
                self.proc.kill()
                return
            time.sleep(1)


def run(args: List[str], *, duration: float = 0.0, on_progress: Progress = None,
        cwd: Optional[str] = None, stall: Optional[int] = None) -> None:
    """Run ffmpeg. stderr is drained on its own thread - read only stdout and
    the stderr pipe fills, ffmpeg blocks writing to it, and the render hangs."""
    cmd = [config.ffmpeg(), "-hide_banner", "-nostdin", "-y", "-loglevel", "error"]
    if on_progress and duration > 0:
        cmd += ["-progress", "pipe:1", "-nostats"]
    cmd += args
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            text=True, bufsize=1, cwd=cwd, creationflags=config.NOWIN,
                            encoding="utf-8", errors="replace")
    err: List[str] = []

    def drain():
        for line in proc.stderr:
            err.append(line)
            del err[:-300]

    t = threading.Thread(target=drain, daemon=True)
    t.start()
    # a watchdog: an ffmpeg that stops making progress would otherwise hold the
    # one job queue forever (every later video would sit at "Waiting")
    dog = _Watchdog(proc, stall or (300 if on_progress and duration > 0 else 900))
    try:
        for line in proc.stdout:
            dog.pet()
            if on_progress and duration > 0 and line.startswith("out_time_ms="):
                try:
                    on_progress(min(1.0, int(line.split("=")[1]) / 1e6 / duration))
                except ValueError:
                    pass
    except BaseException:                 # cancelled from the UI: stop ffmpeg too
        proc.kill()
        proc.wait()
        raise
    proc.wait()
    t.join(timeout=5)
    if dog.fired:
        raise FFmpegError(f"ffmpeg made no progress for {dog.limit:.0f} s and was stopped")
    if proc.returncode != 0:
        log = "".join(err)
        raise FFmpegError("ffmpeg failed: " + (log.strip().splitlines() or ["?"])[-1][:300], log)


def energy(path: Path | str, hop: float = 0.5) -> List[float]:
    """Loudness (RMS, dB) every `hop` seconds, streamed - a three-hour file
    never sits in memory."""
    import numpy as np
    rate = 8000
    cmd = [config.ffmpeg(), "-v", "error", "-i", str(path), "-vn", "-ac", "1",
           "-ar", str(rate), "-f", "s16le", "-"]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            creationflags=config.NOWIN)
    step = int(rate * hop) * 2
    out: List[float] = []
    while True:
        buf = proc.stdout.read(step)
        if not buf:
            break
        x = np.frombuffer(buf[: len(buf) // 2 * 2], dtype=np.int16).astype(np.float32)
        rms = float(np.sqrt(np.mean(x * x))) if x.size else 0.0
        out.append(20 * np.log10(max(rms, 1.0) / 32768.0))
    proc.wait()
    return out


def thumbnail(video: Path, out: Path, at: float = 1.0) -> None:
    run(["-ss", f"{at:.2f}", "-i", str(video), "-frames:v", "1",
         "-vf", "scale=360:-2", "-q:v", "4", str(out)])


def has_encoder(name: str) -> bool:
    r = subprocess.run([config.ffmpeg(), "-hide_banner", "-encoders"], capture_output=True,
                       text=True, creationflags=config.NOWIN)
    return name in (r.stdout or "")


_NVENC: Optional[bool] = None


def nvenc_works() -> bool:
    """Listed is not the same as working (no NVIDIA GPU, old driver) - try a
    one-frame encode once and remember the answer."""
    global _NVENC
    if _NVENC is None:
        _NVENC = False
        if has_encoder("h264_nvenc"):
            r = subprocess.run([config.ffmpeg(), "-v", "error", "-f", "lavfi", "-i",
                                "color=black:s=256x256:d=0.1", "-c:v", "h264_nvenc",
                                "-f", "null", "-"], capture_output=True,
                               creationflags=config.NOWIN)
            _NVENC = r.returncode == 0
    return _NVENC


def video_encoder_args() -> List[str]:
    want = str(config.get("encoder") or "auto")
    if want in ("auto", "nvenc") and nvenc_works():
        return ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19",
                "-b:v", "0", "-maxrate", "20M", "-bufsize", "40M", "-profile:v", "high"]
    # the cap keeps grain / busy footage from ballooning (platforms re-encode anyway)
    return ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-maxrate", "20M",
            "-bufsize", "40M", "-profile:v", "high"]
