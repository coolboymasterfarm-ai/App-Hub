"""Background work with progress the UI can poll.

One worker thread, one job at a time: transcription and rendering each want
the whole GPU/CPU, so running two at once only makes both slower.
"""
from __future__ import annotations

import queue
import threading
import time
import traceback
import uuid
from typing import Any, Callable, Dict, List, Optional

_JOBS: Dict[str, Dict[str, Any]] = {}
_LOCK = threading.Lock()
_Q: "queue.Queue[tuple]" = queue.Queue()
_started = False


class Cancelled(Exception):
    pass


def _worker() -> None:
    while True:
        jid, fn, args = _Q.get()
        job = _JOBS.get(jid)
        if not job or job["state"] == "cancelled":
            continue
        update(jid, state="running", started=time.time())
        try:
            result = fn(jid, *args)
            update(jid, state="done", progress=1.0, result=result, stage="Done",
                   finished=time.time())
        except Cancelled:
            update(jid, state="cancelled", finished=time.time())
        except Exception as exc:                          # surfaced in the UI
            log(jid, traceback.format_exc()[-2000:])
            update(jid, state="error", error=f"{type(exc).__name__}: {exc}",
                   finished=time.time())


def submit(kind: str, fn: Callable, *args, project: str = "") -> str:
    global _started
    if not _started:
        threading.Thread(target=_worker, daemon=True).start()
        _started = True
    jid = uuid.uuid4().hex[:10]
    with _LOCK:
        _JOBS[jid] = {"id": jid, "kind": kind, "project": project, "state": "queued",
                      "progress": 0.0, "stage": "Waiting", "log": [], "created": time.time(),
                      "error": None, "result": None}
    _Q.put((jid, fn, args))
    return jid


def update(jid: str, **kw: Any) -> None:
    with _LOCK:
        if jid in _JOBS:
            _JOBS[jid].update(kw)


def progress(jid: str, value: float, stage: Optional[str] = None) -> None:
    with _LOCK:
        j = _JOBS.get(jid)
        if not j:
            return
        if j["state"] == "cancelled":
            raise Cancelled()
        j["progress"] = round(max(0.0, min(1.0, value)), 4)
        if stage:
            j["stage"] = stage


def log(jid: str, msg: str) -> None:
    with _LOCK:
        j = _JOBS.get(jid)
        if j:
            j["log"].append(f"[{time.strftime('%H:%M:%S')}] {msg}")
            j["log"] = j["log"][-200:]


def cancel(jid: str) -> bool:
    with _LOCK:
        j = _JOBS.get(jid)
        if j and j["state"] in ("queued", "running"):
            j["state"] = "cancelled"
            return True
    return False


def get(jid: str) -> Optional[Dict[str, Any]]:
    with _LOCK:
        j = _JOBS.get(jid)
        return dict(j, log=list(j["log"])) if j else None


def active() -> List[Dict[str, Any]]:
    with _LOCK:
        return [dict(j, log=j["log"][-3:]) for j in _JOBS.values()
                if j["state"] in ("queued", "running")]


def scoped(jid: str, lo: float, hi: float, stage: str) -> Callable[[float], None]:
    """A progress callback that maps 0..1 onto a slice of the whole job."""
    def cb(p: float) -> None:
        progress(jid, lo + (hi - lo) * max(0.0, min(1.0, p)), stage)
    return cb
