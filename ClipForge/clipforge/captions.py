"""The words of a clip, as captions: which words go on screen together,
which ones matter, and what the numbers and emojis are. Pure text work -
no HTML, no rendering (overlay.py and subtitles.py draw it).

Words are on the clip's own clock: [{"w", "s", "e"}].
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

Words = List[Dict[str, Any]]
PAGE = (3, 17, 0.4)            # default page limits: words, characters, pause
SUBTITLE_PAGE = (6, 30, 0.55)  # a readable subtitle line (clean style, .srt)

STOP = set("""a an the and or but so if of to in on at by for with from as is
are was were be been am i you he she it we they me him her us them my your his
its our their this that these those there here what which who whom whose when
where why how not no yes do does did done have has had just like really very
can could would should will shall may might must than then too also about into
over out up down off again more most some any all each every both few other
such own same only don't i'm it's that's you're we're they're i've you've
can't won't didn't doesn't isn't wasn't aren't gonna wanna got get""".split())


def clean(w: str) -> str:
    return re.sub(r"[^\w'%$.,!?-]", "", w).strip()


def emphasis(words: List[Dict[str, Any]], title: str = "", keywords=()) -> set:
    """Indices of words worth colouring: numbers, money, words from the hook
    title, and long uncommon words. Capped so a caption never turns into a
    wall of colour - a quarter of the words at most."""
    title_words = {re.sub(r"\W", "", t.lower()) for t in title.split() if len(t) > 3}
    picked = {re.sub(r"\W", "", k.lower()) for k in keywords}
    scored = []
    for i, w in enumerate(words):
        bare = re.sub(r"\W", "", w["w"].lower())
        if not bare or bare in STOP:
            continue
        s = 0.0
        if re.search(r"\d", bare) or "$" in w["w"] or "%" in w["w"]:
            s += 3
        if bare in title_words:
            s += 2
        if bare in picked:
            s += 3                                  # the AI chose it
        if len(bare) >= 7:
            s += 1
        if w["w"][:1].isupper() and i > 0 and not words[i - 1]["w"].endswith((".", "?", "!")):
            s += 1                                  # a name mid-sentence
        if s >= 2:
            scored.append((s, i))
    scored.sort(reverse=True)
    return {i for _, i in scored[: max(1, len(words) // 4)]}


EMOJI = {
    "money": "💰", "cash": "💵", "dollars": "💵", "rich": "🤑", "million": "💸", "billion": "💸",
    "fire": "🔥", "hot": "🔥", "love": "❤️", "heart": "❤️", "laugh": "😂", "funny": "😂",
    "hilarious": "🤣", "crazy": "🤯", "insane": "🤯", "mind": "🧠", "brain": "🧠", "think": "🤔",
    "idea": "💡", "secret": "🤫", "truth": "💯", "real": "💯", "win": "🏆", "winning": "🏆",
    "champion": "🏆", "fight": "🥊", "punch": "👊", "kill": "💀", "dead": "💀", "died": "💀",
    "death": "💀", "scared": "😱", "afraid": "😨", "shocked": "😱", "wow": "😮", "sad": "😢",
    "cry": "😭", "crying": "😭", "angry": "😡", "mad": "😡", "hate": "😤", "work": "💼",
    "job": "💼", "business": "📈", "growth": "📈", "stock": "📈", "time": "⏰", "clock": "⏰",
    "fast": "⚡", "speed": "⚡", "power": "⚡", "strong": "💪", "gym": "🏋️", "muscle": "💪",
    "food": "🍔", "eat": "🍽️", "eating": "🍽️", "pizza": "🍕", "beer": "🍺", "drink": "🍻",
    "drinks": "🍻", "drunk": "🥴", "coffee": "☕", "cigarettes": "🚬", "smoke": "🚬",
    "smoking": "🚬", "weed": "🌿", "car": "🚗", "cars": "🚗", "plane": "✈️", "travel": "✈️",
    "world": "🌍", "earth": "🌍", "space": "🚀", "rocket": "🚀", "moon": "🌙", "sun": "☀️",
    "phone": "📱", "internet": "🌐", "computer": "💻", "ai": "🤖", "robot": "🤖", "game": "🎮",
    "music": "🎵", "song": "🎵", "movie": "🎬", "book": "📚", "school": "🏫", "learn": "📚",
    "doctor": "🩺", "sick": "🤒", "health": "🩺", "sleep": "😴", "tired": "😴", "dog": "🐶",
    "cat": "🐱", "baby": "👶", "kids": "🧒", "wife": "💍", "married": "💍", "girlfriend": "💕",
    "police": "🚓", "cops": "🚓", "jail": "🚔", "prison": "🔒", "gun": "🔫", "war": "⚔️",
    "god": "🙏", "pray": "🙏", "lucky": "🍀", "gold": "🥇", "diamond": "💎", "house": "🏠",
    "home": "🏠", "party": "🎉", "birthday": "🎂", "gift": "🎁", "shit": "💩", "stupid": "🤦",
    "dumb": "🤦", "genius": "🧠", "question": "❓", "why": "🤔", "no": "🙅", "stop": "🛑",
    "wrong": "❌", "right": "✅", "yes": "✅", "number": "🔢", "first": "🥇", "best": "🏆",
    "worst": "👎", "bad": "👎", "good": "👍", "great": "👌", "perfect": "👌", "boom": "💥",
    "explode": "💥", "bomb": "💣", "water": "💧", "ocean": "🌊", "cold": "🥶", "ice": "🧊",
}


def emoji_marks(words: List[Dict[str, Any]], pages: List[Dict[str, Any]],
                chosen: Optional[Dict[str, str]] = None, gap: float = 2.5) -> Dict[int, str]:
    """page number -> emoji: at most one per caption page, a few seconds
    apart, AI picks first then the built-in list."""
    chosen = {k.lower(): v for k, v in (chosen or {}).items()}
    out: Dict[int, str] = {}
    last = -99.0
    for n, pg in enumerate(pages):
        if pg["s"] - last < gap:
            continue
        for i in pg["idx"]:
            bare = re.sub(r"[^\w']", "", words[i]["w"].lower())
            e = chosen.get(bare) or EMOJI.get(bare)
            if e:
                out[n] = e
                last = pg["s"]
                break
    return out


def paginate(words: List[Dict[str, Any]], limits: Tuple[int, int, float] = PAGE) -> List[Dict[str, Any]]:
    """Group words into caption pages - what is on screen at once.

    limits = (most words, most characters, longest pause in seconds) - short
    pages for the punchy styles (one glance, one beat), a subtitle line for the
    calm ones. A page always breaks at the end of a sentence and at a real
    pause, so a caption never straddles two thoughts."""
    max_words, max_chars, gap = limits
    pages: List[List[int]] = []
    cur: List[int] = []
    for i, w in enumerate(words):
        text = clean(w["w"])
        if not text:
            continue
        if cur:
            prev = words[cur[-1]]
            chars = sum(len(clean(words[j]["w"])) + 1 for j in cur) + len(text)
            # the word that ends a sentence rides with it rather than sitting
            # alone on the next page - an orphaned "dollars." reads as a glitch
            ends = text.endswith((".", "?", "!")) and max_words > 1
            if (len(cur) >= max_words + (1 if ends else 0)
                    or chars > max_chars + (10 if ends else 0)
                    or w["s"] - prev["e"] > gap
                    or prev["w"].rstrip().endswith((".", "?", "!"))):
                pages.append(cur)
                cur = []
        cur.append(i)
    if cur:
        pages.append(cur)

    out = []
    for n, idx in enumerate(pages):
        s = max(0.0, words[idx[0]]["s"] - 0.05)
        e = words[idx[-1]]["e"] + 0.3
        if n + 1 < len(pages):
            e = min(e, words[pages[n + 1][0]]["s"] - 0.05)
        e = max(e, s + 0.2)
        out.append({"s": s, "e": e, "idx": idx})
    # pages must not overlap - the next one starts where this one stops
    for a, b in zip(out, out[1:]):
        if a["e"] > b["s"]:
            a["e"] = b["s"]
    return out


def display(w: str, upper: bool) -> str:
    """A word as shown: tidy punctuation; loud styles are uppercase with no
    trailing comma or full stop."""
    t = clean(w)
    return t.upper().rstrip(",.") if upper else t


_UNITS = set("""year years day days month months week weeks hour hours minute minutes second
seconds people times percent dollars pounds miles kids followers subscribers views episodes
books fights rounds grams calories reps sets pushups steps points goals games wins""".split())
_NUM_RE = re.compile(r"^(\$)?(\d[\d,]*(?:\.\d+)?)(%|k|K|x)?$")


def number_marks(words: List[Dict[str, Any]], gap: float = 6.0,
                 not_before: float = 0.0) -> List[Dict[str, Any]]:
    """Spoken numbers worth a stat card: '$10,000', '90%', '3 million
    people'. At most one every `gap` seconds; 0/1 and years are skipped."""
    out: List[Dict[str, Any]] = []
    last = -99.0
    for i, w in enumerate(words):
        m = _NUM_RE.match(clean(w["w"]).rstrip(".,!?"))
        if not m or w["s"] < not_before or w["s"] - last < gap:
            continue
        raw = m.group(2).replace(",", "")
        try:
            val = float(raw)
        except ValueError:
            continue
        if val < 2 or (1900 <= val <= 2100 and not m.group(1)):
            continue
        prefix, suffix = m.group(1) or "", m.group(3) or ""
        label = ""
        for nxt in words[i + 1:i + 3]:
            b = re.sub(r"[^\w']", "", nxt["w"].lower())
            if b in ("percent", "per"):
                suffix = suffix or "%"
                continue
            if b in ("million", "billion", "thousand", "grand", "k"):
                suffix += {"million": "M", "billion": "B", "thousand": "K", "grand": "K", "k": "K"}[b]
                continue
            if b in ("dollars", "bucks"):
                prefix = prefix or "$"
                continue
            # a label only when it names what was counted ("30 days", "5 kids")
            if b in _UNITS or (b.isalpha() and b.endswith("s") and len(b) > 3 and b not in STOP):
                label = b
            break
        if not (prefix or suffix or label or val >= 100):
            continue                          # a bare "15" is not a stat worth a card
        out.append({"i": i, "t": w["s"], "val": val, "dec": 1 if "." in raw else 0,
                    "prefix": prefix, "suffix": suffix, "label": label})
        last = w["s"]
    return out


def fmt_num(v: float, dec: int) -> str:
    return f"{v:,.{dec}f}"


# where the captions sit (top of the caption block, on the 1920px frame);
# "auto" is the usual spot just below the face
def _srt_time(t: float) -> str:
    ms = int(round(max(0.0, t) * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def srt(words: Words) -> str:
    """Subtitle file for the edited clip (for YouTube / uploads that take one)."""
    return "\n".join(f"{n}\n{_srt_time(pg['s'])} --> {_srt_time(pg['e'])}\n"
                     + " ".join(clean(words[i]["w"]) for i in pg["idx"]) + "\n"
                     for n, pg in enumerate(paginate(words, SUBTITLE_PAGE), 1))
