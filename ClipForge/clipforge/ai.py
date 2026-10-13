"""The AI that reads the transcript.

OmniRoute first - it is an OpenAI-compatible router on this PC (default
http://localhost:20128/v1) that sends each request to whichever model it has
available, cloud or local. Then Ollama directly. If neither answers, the clip
finder uses its own scoring, so the app still works with no AI at all.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

from . import config


class NoAI(RuntimeError):
    pass


_CACHE: Dict[str, Any] = {"t": 0.0, "v": None}

# chat models worth using, best first; anything else installed is a fallback
_PREFER = ["qwen3", "qwen2.5", "llama3.3", "llama3.1", "gemma3", "gemma2",
           "mistral-small", "mistral", "llama3.2", "phi4", "phi3"]
_SKIP = re.compile(r"embed|bge|nomic|minilm|whisper|llava|vision|-vl|moondream|clip", re.I)


def _omni_url() -> str:
    return str(config.get("omniroute_url") or "http://localhost:20128/v1").rstrip("/")


def _omni_headers() -> Dict[str, str]:
    key = str(config.get("omniroute_key") or "").strip()
    return {"Authorization": f"Bearer {key}"} if key else {}


def omniroute_status() -> Dict[str, Any]:
    try:
        r = requests.get(_omni_url() + "/models", headers=_omni_headers(), timeout=3)
        if r.status_code == 401:
            return {"ok": False, "error": "OmniRoute wants an API key (Settings > AI)"}
        r.raise_for_status()
        ids = [m.get("id") for m in (r.json().get("data") or []) if m.get("id")]
        return {"ok": True, "models": ids[:200]}
    except Exception as exc:
        return {"ok": False, "error": "not running" if "onnect" in str(exc) else str(exc)[:120]}


def ollama_status() -> Dict[str, Any]:
    base = str(config.get("ollama_url") or "http://localhost:11434").rstrip("/")
    try:
        r = requests.get(base + "/api/tags", timeout=3)
        r.raise_for_status()
        models = r.json().get("models") or []
        names = [m.get("name") for m in models if m.get("name")]
        return {"ok": True, "models": names, "pick": _pick_ollama(models)}
    except Exception as exc:
        return {"ok": False, "error": "not running" if "onnect" in str(exc) else str(exc)[:120]}


def _pick_ollama(models: List[Dict[str, Any]]) -> Optional[str]:
    forced = str(config.get("ollama_model") or "").strip()
    names = [m.get("name", "") for m in models]
    if forced and forced in names:
        return forced
    chat = [m for m in models if not _SKIP.search(m.get("name", ""))]
    if not chat:
        return None
    for fam in _PREFER:
        fits = [m for m in chat if m.get("name", "").lower().startswith(fam)]
        if fits:
            # the largest of the preferred family that is not absurd for a desktop
            fits.sort(key=lambda m: m.get("size") or 0)
            ok = [m for m in fits if (m.get("size") or 0) < 26e9] or fits
            return ok[-1]["name"]
    return chat[0]["name"]


def status(fresh: bool = False) -> Dict[str, Any]:
    if not fresh and _CACHE["v"] and time.time() - _CACHE["t"] < 20:
        return _CACHE["v"]
    pref = str(config.get("ai_provider") or "auto")
    om = omniroute_status() if pref in ("auto", "omniroute") else {"ok": False, "error": "off"}
    ol = ollama_status() if pref in ("auto", "ollama") else {"ok": False, "error": "off"}
    provider, model = "none", ""
    if pref != "off":
        if om.get("ok"):
            provider, model = "omniroute", str(config.get("omniroute_model") or "auto")
        elif ol.get("ok") and ol.get("pick"):
            provider, model = "ollama", ol["pick"]
    v = {"provider": provider, "model": model, "omniroute": om, "ollama": ol}
    _CACHE.update(t=time.time(), v=v)
    return v


def chat(system: str, user: str, *, want_json: bool = True, timeout: int = 240,
         max_tokens: int = 2000) -> Tuple[str, str]:
    """(reply text, "provider/model"). Tries OmniRoute, then Ollama."""
    st = status()
    order: List[str] = []
    if st["omniroute"].get("ok"):
        order.append("omniroute")
    if st["ollama"].get("ok") and st["ollama"].get("pick"):
        order.append("ollama")
    if not order:
        raise NoAI("no AI is reachable (OmniRoute and Ollama are both off)")
    last: Optional[Exception] = None
    for p in order:
        try:
            if p == "omniroute":
                return _omniroute(system, user, want_json, timeout, max_tokens)
            return _ollama(system, user, want_json, timeout, st["ollama"]["pick"])
        except Exception as exc:
            last = exc
    raise NoAI(f"the AI did not answer: {last}")


def _omniroute(system, user, want_json, timeout, max_tokens) -> Tuple[str, str]:
    model = str(config.get("omniroute_model") or "auto")
    body: Dict[str, Any] = {"model": model, "temperature": 0.5, "max_tokens": max_tokens,
                            "messages": [{"role": "system", "content": system},
                                         {"role": "user", "content": user}]}
    if want_json:
        body["response_format"] = {"type": "json_object"}
    r = requests.post(_omni_url() + "/chat/completions", json=body,
                      headers=_omni_headers(), timeout=timeout)
    if r.status_code == 400 and want_json:           # a model that refuses json mode
        body.pop("response_format", None)
        r = requests.post(_omni_url() + "/chat/completions", json=body,
                          headers=_omni_headers(), timeout=timeout)
    r.raise_for_status()
    d = r.json()
    text = (d.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    return text, "omniroute/" + str(d.get("model") or model)


def _ollama(system, user, want_json, timeout, model) -> Tuple[str, str]:
    base = str(config.get("ollama_url") or "http://localhost:11434").rstrip("/")
    body: Dict[str, Any] = {"model": model, "stream": False, "think": False,
                            "messages": [{"role": "system", "content": system},
                                         {"role": "user", "content": user}],
                            "options": {"temperature": 0.5, "num_ctx": 8192},
                            "keep_alive": "15m"}      # stay loaded between a video's calls and the next video
    if want_json:
        body["format"] = "json"
    r = requests.post(base + "/api/chat", json=body, timeout=timeout)
    if r.status_code == 400:              # an Ollama/model that rejects the think flag
        body.pop("think")
        r = requests.post(base + "/api/chat", json=body, timeout=timeout)
    r.raise_for_status()
    return (r.json().get("message") or {}).get("content") or "", "ollama/" + model


def parse_json(text: str) -> Any:
    """JSON out of a model reply: tolerates code fences, <think> blocks,
    chatter around the object, and trailing commas."""
    t = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t.strip(), flags=re.M)
    starts = [i for i in (t.find("{"), t.find("[")) if i >= 0]
    if not starts:
        raise ValueError("no JSON in the reply")
    i = min(starts)
    closer = "}" if t[i] == "{" else "]"
    j = t.rfind(closer)
    chunk = t[i:j + 1]
    try:
        return json.loads(chunk)
    except ValueError:
        return json.loads(re.sub(r",\s*([}\]])", r"\1", chunk))
