"""The system check behind Settings > System: everything ClipForge depends
on, tested for real, with what to do about anything that is missing."""
from __future__ import annotations

import shutil
import subprocess
from typing import Any, Dict

from . import ai, config, hyperframes, media, transcribe


def report() -> Dict[str, Any]:
    config.prepare_path()
    rows = []

    def row(name, ok, detail, hint="", fix=""):
        rows.append({"name": name, "ok": bool(ok), "detail": detail, "hint": hint, "fix": fix})

    ff = config.tool("ffmpeg")
    row("ffmpeg", ff, ff or "not found", "Run Install.bat again - it puts ffmpeg in the bin folder.")
    enc = media.nvenc_works()
    row("Video encoder", True, "NVIDIA NVENC (fast)" if enc else "x264 on the CPU",
        "" if enc else "Fine - an NVIDIA GPU would make the final encode faster.")
    dev = transcribe.device()
    gpu = ""
    smi = shutil.which("nvidia-smi")
    if smi:
        try:
            gpu = subprocess.run([smi, "--query-gpu=name,memory.total", "--format=csv,noheader"],
                                 capture_output=True, text=True, timeout=8,
                                 creationflags=config.NOWIN).stdout.strip().splitlines()[0]
        except Exception:
            gpu = ""
    row("Speech to text", True, f"Whisper {transcribe.model_name(dev)} on the {dev.upper()}"
        + (f" ({gpu})" if gpu else ""),
        "" if dev == "cuda" else "Runs on the CPU - slower. With an NVIDIA GPU, update its driver and run Install.bat again.")
    js = config.tool("deno") or shutil.which("node")
    row("YouTube downloads", js, f"JavaScript runtime: {js}" if js else "no deno or node",
        "Run Install.bat again (it adds deno) - YouTube refuses downloads without it.")
    a = ai.status(fresh=True)
    row("AI", a["provider"] != "none",
        f"{a['provider']} · {a['model']}" if a["provider"] != "none" else "none running - the built-in scorer picks clips",
        "Start.bat starts OmniRoute and Ollama. In Ollama, run: ollama pull qwen3:8b")
    if not hyperframes.ready():
        row("HyperFrames", False, "not installed", "Install Node.js 22+, then run Install.bat again.")
    else:
        try:
            checks = hyperframes.doctor()
        except Exception as exc:
            checks = {}
            row("HyperFrames", False, f"doctor failed: {str(exc)[:100]}")
        for name, label in (("Node.js", "Node.js"), ("Chrome", "HyperFrames Chrome"),
                            ("Memory", "Memory"), ("Disk", "Disk space")):
            c = checks.get(name)
            if c:
                row(label, c.get("ok"), c.get("detail", ""), c.get("hint", ""),
                    "chrome" if name == "Chrome" and not c.get("ok") else "")
    free = shutil.disk_usage(config.DATA).free / 1e9
    row("Free space for clips", free > 5, f"{free:.0f} GB free", "Clips and sources need several GB - clear old projects.")
    return {"rows": rows}
