"""Speech to text with word timings, on the GPU when there is one.

faster-whisper runs Whisper through CTranslate2. On an NVIDIA card it uses
large-v3-turbo (fast and accurate); without one it falls back to `small` on
the CPU. If the GPU path fails to load (missing cuDNN, old driver) it drops to
the CPU by itself rather than failing the job.
"""
from __future__ import annotations

import glob
import os
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from . import config

_DLL_DONE = False


def _cuda_dlls() -> None:
    """The nvidia-cublas/cudnn pip wheels put their DLLs in site-packages, which
    Windows does not search - point it there before CTranslate2 loads."""
    global _DLL_DONE
    if _DLL_DONE or not config.WINDOWS:
        return
    _DLL_DONE = True
    for base in sys.path:
        for d in glob.glob(os.path.join(base, "nvidia", "*", "bin")):
            try:
                os.add_dll_directory(d)
            except (OSError, AttributeError):
                pass
            os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


def device() -> str:
    want = str(config.get("whisper_device") or "auto")
    if want in ("cpu", "cuda"):
        return want
    try:
        _cuda_dlls()
        import ctranslate2
        return "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:
        return "cpu"


def model_name(dev: str) -> str:
    want = str(config.get("whisper_model") or "auto")
    if want != "auto":
        return want
    return "large-v3-turbo" if dev == "cuda" else "small"


def _load(dev: str):
    from faster_whisper import WhisperModel
    name = model_name(dev)
    root = config.DATA / "models" / "whisper"
    root.mkdir(parents=True, exist_ok=True)
    if dev == "cuda":
        return WhisperModel(name, device="cuda", compute_type="float16",
                            download_root=str(root)), name
    return WhisperModel(name, device="cpu", compute_type="int8",
                        cpu_threads=max(2, (os.cpu_count() or 4) - 1),
                        download_root=str(root)), name


def transcribe(path: Path, *, on_progress: Optional[Callable[[float], None]] = None,
               log: Callable[[str], None] = print) -> Dict[str, Any]:
    dev = device()
    try:
        model, name = _load(dev)
    except Exception as exc:
        if dev != "cuda":
            raise
        log(f"GPU speech model would not load ({str(exc)[:120]}) - using the CPU")
        dev = "cpu"
        model, name = _load(dev)
    log(f"Transcribing with Whisper {name} on the {dev.upper()}")

    def run(model):
        kw = dict(word_timestamps=True, vad_filter=True,
                  vad_parameters={"min_silence_duration_ms": 500},
                  beam_size=5 if dev == "cuda" else 2,
                  condition_on_previous_text=False)
        if dev == "cuda":
            from faster_whisper import BatchedInferencePipeline
            return BatchedInferencePipeline(model=model).transcribe(
                str(path), batch_size=16, **kw)
        return model.transcribe(str(path), **kw)

    try:
        segs, info = run(model)
        words, segments = _collect(segs, info, on_progress)
    except Exception as exc:
        # cuDNN problems often only surface on the first real inference
        if dev != "cuda":
            raise
        log(f"GPU transcription failed ({str(exc)[:120]}) - retrying on the CPU")
        dev = "cpu"
        model, name = _load(dev)
        segs, info = run(model)
        words, segments = _collect(segs, info, on_progress)
    return {"language": getattr(info, "language", "en"), "model": name, "device": dev,
            "duration": float(getattr(info, "duration", 0) or 0),
            "words": words, "segments": segments}


def _collect(segs, info, on_progress) -> tuple:
    total = float(getattr(info, "duration", 0) or 0)
    words: List[Dict[str, Any]] = []
    segments: List[Dict[str, Any]] = []
    for s in segs:
        segments.append({"s": round(s.start, 3), "e": round(s.end, 3), "text": s.text.strip()})
        for w in (s.words or []):
            t = w.word.strip()
            if not t:
                continue
            words.append({"w": t, "s": round(w.start, 3), "e": round(max(w.end, w.start + 0.02), 3),
                          "p": round(float(w.probability or 0), 3)})
        if on_progress and total:
            on_progress(min(0.999, s.end / total))
    words.sort(key=lambda w: w["s"])
    return words, segments
