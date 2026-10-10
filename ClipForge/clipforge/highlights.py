"""Finding the moments worth clipping.

Two stages, like a human editor skimming then watching:
1. A fast scorer walks every sentence-aligned window of the right length and
   rates it on things that make short-form work - a hook in the first line,
   questions, numbers, laughter, raised energy, a good speaking pace, not
   starting mid-thought ("and", "but", "so"). The best ~30 survive.
2. The AI (OmniRoute or local Ollama) reads those candidates like a producer:
   scores virality, trims the start/end to whole sentences, and writes a hook
   title and a caption. No AI? Stage 1's ranking and titles are used as-is.
"""
from __future__ import annotations

import math
import re
from typing import Any, Callable, Dict, List, Optional

from . import ai, config

Words = List[Dict[str, Any]]

_HOOK = re.compile(r"\b(never|always|secret|truth|crazy|insane|worst|best|nobody|everyone|"
                   r"why|how|what if|imagine|listen|here's|the problem|the reason|mistake|"
                   r"actually|honestly|literally|wild|shocking|biggest|million|billion|"
                   r"money|died|dead|love|hate|scared|afraid|fight|kill|lie|lied|wrong|"
                   r"stop|don't|you have to|you need|nobody tells|real reason)\b", re.I)
_EMO = re.compile(r"\b(haha|hahaha|laugh|lol|oh my god|omg|holy|damn|dude|bro|wow|what\?|"
                  r"no way|are you serious|come on|shit|fuck|fucking|hell)\b", re.I)
_WEAK_START = re.compile(r"^(and|but|so|or|because|cause|which|then|also|plus|like|um|uh|"
                         r"yeah|right|okay|ok)\b", re.I)
_END = re.compile(r"[.?!]['\"]?$")


def sentences(words: Words) -> List[Dict[str, Any]]:
    """Group words into sentences: end punctuation, a long pause, or 25 s."""
    out: List[Dict[str, Any]] = []
    start = 0
    for i, w in enumerate(words):
        nxt = words[i + 1] if i + 1 < len(words) else None
        gap = (nxt["s"] - w["e"]) if nxt else 99
        if _END.search(w["w"]) or gap > 1.0 or w["e"] - words[start]["s"] > 25 or not nxt:
            seg = words[start:i + 1]
            out.append({"i0": start, "i1": i, "s": seg[0]["s"], "e": seg[-1]["e"],
                        "text": " ".join(x["w"] for x in seg)})
            start = i + 1
    return out


def _zs(energy: List[float], hop: float, s: float, e: float, mu: float, sd: float) -> float:
    a, b = int(s / hop), max(int(s / hop) + 1, int(e / hop))
    seg = energy[a:b]
    if not seg or sd <= 0:
        return 0.0
    return (sum(seg) / len(seg) - mu) / sd


def _score(sents, a: int, b: int, energy, hop, mu, sd, lo, hi) -> Dict[str, float]:
    first = sents[a]["text"]
    body = " ".join(x["text"] for x in sents[a:b + 1])
    s, e = sents[a]["s"], sents[b]["e"]
    dur = e - s
    nwords = len(body.split())
    f: Dict[str, float] = {}
    f["hook"] = min(2.0, len(_HOOK.findall(first)) * 0.8) + (0.8 if "?" in first else 0)
    f["weak_start"] = -1.5 if _WEAK_START.search(first) else 0.0
    f["questions"] = min(1.5, body.count("?") * 0.5)
    f["numbers"] = min(1.0, len(re.findall(r"\d", body)) * 0.25)
    f["emotion"] = min(1.5, len(_EMO.findall(body)) * 0.5) + min(1.0, len(_HOOK.findall(body)) * 0.12)
    f["energy"] = max(-1.0, min(1.5, _zs(energy, hop, s, e, mu, sd))) if energy else 0.0
    wps = nwords / max(dur, 1e-6)
    f["pace"] = 0.8 if 2.2 <= wps <= 3.8 else (0.0 if 1.6 <= wps <= 4.5 else -1.0)
    ideal = (lo + hi) / 2
    f["length"] = 0.6 - abs(dur - ideal) / (hi - lo)
    f["ends_clean"] = 0.5 if _END.search(sents[b]["text"]) else -0.5
    f["total"] = sum(f.values())
    return f


def _overlap(a, b) -> float:
    inter = max(0.0, min(a["end"], b["end"]) - max(a["start"], b["start"]))
    return inter / max(1e-6, min(a["end"] - a["start"], b["end"] - b["start"]))


def _nms(cands: List[Dict[str, Any]], key: str, limit: int, max_ov: float = 0.3):
    keep: List[Dict[str, Any]] = []
    for c in sorted(cands, key=lambda c: c[key], reverse=True):
        if all(_overlap(c, k) <= max_ov for k in keep):
            keep.append(c)
            if len(keep) >= limit:
                break
    return keep


def _title_from(text: str) -> str:
    """A fallback hook title: the punchiest short sentence, trimmed."""
    parts = [p.strip() for p in re.split(r"(?<=[.?!])\s+", text) if p.strip()]
    parts = [p for p in parts if 3 <= len(p.split()) <= 12] or parts
    best = max(parts, key=lambda p: len(_HOOK.findall(p)) * 2 + ("?" in p) - len(p) / 80)
    best = re.sub(r"(,\s*)?\b(like|you know|i mean|um|uh|kind of|sort of)\b,", "", best, flags=re.I)
    words = re.sub(r"^(and|but|so|or|because|like|um|uh|yeah|okay)\b[, ]*", "", best,
                   flags=re.I).split()[:8]
    t = " ".join(words).rstrip(",;:.")
    return (t[:1].upper() + t[1:]) if t else "Watch this"


def _topic_terms(topic: str) -> set:
    return {t for t in re.findall(r"[a-z0-9']+", (topic or "").lower())
            if len(t) > 2 and t not in _TOPIC_STOP}


_TOPIC_STOP = set("the and for about with that this clips clip moments moment funny best "
                  "where when what who how any some from into only find make".split())


def candidates(words: Words, energy: List[float], hop: float = 0.5,
               limit: int = 30, topic: str = "") -> List[Dict[str, Any]]:
    lo, hi = config.clip_bounds()
    sents = sentences(words)
    terms = _topic_terms(topic)
    mu = sum(energy) / len(energy) if energy else 0.0
    sd = math.sqrt(sum((x - mu) ** 2 for x in energy) / len(energy)) if energy else 0.0
    out = []
    for a in range(len(sents)):
        for b in range(a, len(sents)):
            dur = sents[b]["e"] - sents[a]["s"]
            if dur > hi:
                break
            if dur < lo:
                continue
            f = _score(sents, a, b, energy, hop, mu, sd, lo, hi)
            if terms:
                body = " ".join(x["text"] for x in sents[a:b + 1]).lower()
                hits = sum(body.count(t) for t in terms)
                f["topic"] = min(3.0, hits * 0.75) - 1.0
                f["total"] += f["topic"]
            out.append({"a": a, "b": b, "start": sents[a]["s"], "end": sents[b]["e"],
                        "heur": f["total"], "features": f})
    picked = _nms(out, "heur", limit)
    if picked:
        top, bot = max(c["heur"] for c in picked), min(c["heur"] for c in picked)
        for c in picked:                              # 0..100 for display and blending
            c["heur_pct"] = 100 * (c["heur"] - bot) / (top - bot) if top > bot else 60.0
    for c in picked:
        c["sents"] = sents
    return picked


_SYSTEM = """You are a senior short-form video producer (TikTok, Reels, Shorts) choosing \
clips from a long video transcript. A great clip hooks in the first 3 seconds, makes \
sense with no context, has one clear idea, payoff or punchline, and ends on a strong \
line - not mid-thought. Be a harsh judge: most candidates are average (40-65). Reserve \
85+ for moments people would share.
Reply with JSON only."""

_USER = """Rate each candidate. Its sentences are numbered; you may tighten it by choosing \
the first and last sentence to keep (drop weak openers and trailing filler) - keep at \
least {lo:.0f} seconds.

{topic}For each candidate return:
- id: the candidate id
- hook, flow, value, trend: 0-100 each. hook = do the first 3 seconds stop the scroll \
(bold claim, question, conflict, promised payoff); flow = does it make sense alone and end \
on a satisfying line; value = does it teach, move or entertain; trend = would people \
share, argue or comment
- score: 0-100 overall viral potential
- start_sentence, end_sentence: the numbers to keep
- title: a scroll-stopping hook title shown on screen, max 8 words, no emojis, no hashtags, \
not clickbait lies - use the speaker's actual claim
- reason: one short sentence on why it works (or doesn't)
- description: a post caption, one sentence plus 3-5 relevant hashtags (never name the show,
  channel or app it came from - it gets posted on other accounts)
- keywords: 3-6 words from the clip worth highlighting in the captions (exact words)
- emojis: up to 3 objects {{"word": exact word from the clip, "emoji": one fitting emoji}}

Return {{"clips": [ ... ]}}.

{blocks}"""


def _block(c: Dict[str, Any]) -> str:
    s = c["sents"]
    lines = [f"### candidate {c['id']} ({c['end'] - c['start']:.0f}s)"]
    for k in range(c["a"], c["b"] + 1):
        lines.append(f"[{k}] ({s[k]['e'] - s[k]['s']:.1f}s) {s[k]['text']}")
    return "\n".join(lines)


def _judge(batch: List[Dict[str, Any]], log: Callable[[str], None],
           topic: str = "") -> Dict[int, Dict[str, Any]]:
    lo, _ = config.clip_bounds()
    tp = (f"The creator wants clips about: \"{topic.strip()}\". A clip that is not about "
          "that scores under 35 whatever else it has.\n\n") if topic.strip() else ""
    prompt = _USER.format(lo=lo, topic=tp, blocks="\n\n".join(_block(c) for c in batch))
    text, who = ai.chat(_SYSTEM, prompt, want_json=True, max_tokens=420 * len(batch) + 400)
    data = ai.parse_json(text)
    items = data.get("clips") if isinstance(data, dict) else data
    out: Dict[int, Dict[str, Any]] = {}
    for it in items or []:
        try:
            out[int(it.get("id"))] = it
        except (TypeError, ValueError, AttributeError):
            continue
    log(f"AI ({who}) rated {len(out)}/{len(batch)} candidates")
    return out


def _apply(c: Dict[str, Any], verdict: Dict[str, Any]) -> None:
    lo, hi = config.clip_bounds()
    s = c["sents"]
    try:
        a = int(verdict.get("start_sentence", c["a"]))
        b = int(verdict.get("end_sentence", c["b"]))
    except (TypeError, ValueError):
        a, b = c["a"], c["b"]
    a, b = max(c["a"], min(a, c["b"])), max(c["a"], min(b, c["b"]))
    # only take the trim if it still leaves a real clip
    if b >= a and lo * 0.8 <= s[b]["e"] - s[a]["s"] <= hi:
        c["a"], c["b"], c["start"], c["end"] = a, b, s[a]["s"], s[b]["e"]
    try:
        c["ai"] = max(0.0, min(100.0, float(verdict.get("score"))))
    except (TypeError, ValueError):
        pass
    for k in ("title", "reason", "description"):
        v = str(verdict.get(k) or "").strip()
        if v:
            c[k] = v
    sub = {}
    for k in ("hook", "flow", "value", "trend"):
        try:
            sub[k] = int(max(0, min(99, float(verdict.get(k)))))
        except (TypeError, ValueError):
            pass
    if len(sub) == 4:
        c["scores"] = sub
    kws = verdict.get("keywords")
    if isinstance(kws, list):
        c["keywords"] = [str(k).strip()[:30] for k in kws if str(k).strip()][:6]
    emo = verdict.get("emojis")
    if isinstance(emo, list):
        c["emojis"] = {str(e.get("word", "")).strip().lower()[:30]: str(e.get("emoji", ""))[:4]
                       for e in emo[:3] if isinstance(e, dict) and e.get("word") and e.get("emoji")}


def _heur_scores(f: Dict[str, float]) -> Dict[str, int]:
    """Hook/flow/value/trend from the built-in features, when no AI rated it."""
    sq = lambda x: int(max(5, min(95, 50 + 22 * x)))          # noqa: E731
    return {"hook": sq(f["hook"] + f["weak_start"]),
            "flow": sq(f["ends_clean"] * 2 + f["length"]),
            "value": sq(f["emotion"] + f["numbers"] + f["questions"] - 0.8),
            "trend": sq(f["energy"] + f["pace"] + f.get("topic", 0))}


def find(words: Words, energy: List[float], *, count: Optional[int] = None, topic: str = "",
         on_progress: Optional[Callable[[float], None]] = None,
         log: Callable[[str], None] = print) -> List[Dict[str, Any]]:
    count = int(count or config.get("clip_count") or 5)
    if len(words) < 20:
        raise RuntimeError("there is almost no speech in this part of the video - nothing to clip")
    cands = candidates(words, energy, limit=max(12, count * 5), topic=topic)
    if not cands:
        raise RuntimeError("the video is shorter than the clip length you chose")
    for i, c in enumerate(cands):
        c["id"] = i
    log(f"{len(cands)} candidate moments found")

    source = "heuristic"
    if ai.status(fresh=True)["provider"] != "none":
        size = 6
        batches = [cands[i:i + size] for i in range(0, len(cands), size)]
        for n, batch in enumerate(batches):
            try:
                verdicts = _judge(batch, log, topic)
            except Exception as exc:
                log(f"AI judging failed ({str(exc)[:160]}) - using the built-in scorer")
                break
            for c in batch:
                if c["id"] in verdicts:
                    _apply(c, verdicts[c["id"]])
            if on_progress:
                on_progress((n + 1) / len(batches))
        if any("ai" in c for c in cands):
            source = "ai"
    else:
        log("No AI is running (OmniRoute / Ollama) - using the built-in scorer")

    for c in cands:
        c["score"] = (0.65 * c["ai"] + 0.35 * c["heur_pct"]) if "ai" in c else c["heur_pct"] * 0.9
        text = " ".join(x["text"] for x in c["sents"][c["a"]:c["b"] + 1])
        c["text"] = text
        c.setdefault("title", _title_from(text))
        c.setdefault("description", "")
        c.setdefault("reason", "")
        c.setdefault("scores", _heur_scores(c["features"]))

    best = _nms(cands, "score", count, max_ov=0.15)
    best.sort(key=lambda c: c["score"], reverse=True)
    return [{"n": n + 1, "start": round(c["start"], 3), "end": round(c["end"], 3),
             "title": c["title"][:80], "description": c["description"][:500],
             "reason": c["reason"][:300], "score": round(c["score"]),
             "source": source if "ai" in c else "heuristic", "text": c["text"],
             "scores": c["scores"], "keywords": c.get("keywords", []),
             "emojis": c.get("emojis", {})}
            for n, c in enumerate(best)]


if __name__ == "__main__":        # self-check on synthetic speech
    import random
    random.seed(1)
    ws, t = [], 0.0
    for k in range(400):
        w = random.choice(["the", "money", "why", "never", "we", "went", "there", "crazy"])
        if k % 9 == 8:
            w += "."
        ws.append({"w": w, "s": t, "e": t + 0.3})
        t += 0.38
    res = find(ws, [], count=3, log=lambda m: None)
    lo, hi = config.clip_bounds()
    assert res and all(lo <= r["end"] - r["start"] <= hi for r in res), res
    assert all(_overlap(a, b) <= 0.15 for a in res for b in res if a is not b)
    print("ok", [(r["start"], r["end"], r["title"]) for r in res])


def title_ideas(text: str, current: str = "", n: int = 5) -> Dict[str, Any]:
    """Alternative hook titles for one clip: from the AI when one is running,
    otherwise the punchiest lines of the clip itself."""
    text = (text or "").strip()[:4000]
    if ai.status()["provider"] != "none":
        try:
            reply, who = ai.chat(
                "You write scroll-stopping on-screen hook titles for short-form video. Reply with JSON only.",
                f"Clip transcript:\n{text}\n\nCurrent title: {current}\n\nWrite {n} different hook "
                "titles, max 8 words each, no emojis or hashtags, true to what is said. Mix styles: a "
                "bold claim, a question, a curiosity gap, a number, a quote. "
                'Return {"titles": ["...", ...]}.', want_json=True, max_tokens=500)
            data = ai.parse_json(reply)
            ts = data.get("titles") if isinstance(data, dict) else data
            ts = [str(t).strip().strip('"') for t in ts or [] if str(t).strip()][:n]
            if ts:
                return {"titles": ts, "source": who}
        except Exception:
            pass
    parts = [p.strip() for p in re.split(r"(?<=[.?!])\s+", text) if 3 <= len(p.split()) <= 14]
    parts.sort(key=lambda p: len(_HOOK.findall(p)) * 2 + ("?" in p) - len(p) / 80, reverse=True)
    out = []
    for p in parts:
        t = _title_from(p)
        if t and t != current and t not in out:
            out.append(t)
        if len(out) >= n:
            break
    return {"titles": out, "source": "built-in"}
