"""Everything drawn ON a clip - captions, hook title, emojis, stat cards,
underlines, flashes, progress bar, your watermark (if set) - as
one HyperFrames composition: real HTML/CSS type, animated with GSAP,
rendered to a transparent ProRes 4444 layer that ffmpeg lays over the edit.

build() writes the composition from a Spec; how each caption style moves
lives in styles.py, the word analysis in captions.py. If HyperFrames is
unavailable, subtitles.py draws the same design as an .ass file instead.
"""
from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, List, Mapping, Optional, Tuple

from . import captions, config, hyperframes, styles
from .captions import Words

W, H = 1080, 1920

_CSS = """
@font-face{font-family:'CFMont';src:url('fonts/Montserrat.ttf') format('truetype');font-weight:100 900;font-display:block}
@font-face{font-family:'CFAnton';src:url('fonts/Anton.ttf') format('truetype');font-display:block}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;background:transparent;overflow:hidden}
#root{position:relative;width:1080px;height:1920px;overflow:hidden}
.page{position:absolute;left:70px;right:70px;top:TOPpx;display:flex;flex-wrap:wrap;
  justify-content:center;align-items:center;align-content:center;gap:6px 34px;opacity:0}
.w{position:relative;display:inline-block;font-family:'CFMont',sans-serif;will-change:transform}
.w b{position:relative;z-index:1;font-weight:inherit}
.hook{position:absolute;left:0;right:0;top:170px;display:flex;justify-content:center;opacity:0}
.hookcard{max-width:900px;padding:26px 40px 30px;border-radius:30px;background:#fff;
  color:#0b0b0f;font-family:'CFMont',sans-serif;font-weight:900;font-size:62px;
  line-height:1.06;text-align:center;text-transform:uppercase;letter-spacing:-.01em;
  box-shadow:0 18px 50px rgba(0,0,0,.45);position:relative}
.hookcard i{position:absolute;left:40px;right:40px;bottom:14px;height:9px;border-radius:9px;
  background:ACCENT;transform-origin:left center;transform:scaleX(0)}
.emo{position:absolute;left:0;right:0;display:flex;justify-content:center;opacity:0;
  font-size:128px;line-height:1;
  filter:drop-shadow(0 10px 18px rgba(0,0,0,.45))}
.wm{position:absolute;left:0;right:0;top:1790px;text-align:center;font-family:'CFMont',sans-serif;
  font-weight:700;font-size:34px;color:rgba(255,255,255,.55);text-shadow:0 2px 8px rgba(0,0,0,.6)}
.bar{position:absolute;left:0;top:0;height:12px;width:1080px;background:rgba(0,0,0,.25)}
.bar i{display:block;height:100%;width:100%;background:ACCENT;transform-origin:left center;transform:scaleX(0)}
"""

_MG_CSS = """
.ul{position:absolute;left:-6px;right:-6px;bottom:-18px;height:30px;overflow:visible;z-index:2}
.ul path{fill:none;stroke:ACCENT;stroke-width:8;stroke-linecap:round;stroke-linejoin:round;
  stroke-dasharray:100;stroke-dashoffset:100}
.stat{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;opacity:0}
.stat .num{font-family:'CFAnton',sans-serif;font-size:200px;line-height:.95;color:ACCENT;
  text-shadow:0 0 0 #000,6px 6px 0 #000,-6px -6px 0 #000,6px -6px 0 #000,-6px 6px 0 #000,0 16px 30px rgba(0,0,0,.5)}
.stat .lab{margin-top:6px;padding:8px 22px;border-radius:14px;background:#0b0b0f;color:#fff;
  font-family:'CFMont',sans-serif;font-weight:900;font-size:44px;letter-spacing:.06em;text-transform:uppercase}
.flash{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at 50% 40%,
  rgba(255,250,240,.95) 0%,rgba(255,236,210,.7) 45%,rgba(255,220,190,.45) 100%)}
.hookslam{position:absolute;left:40px;right:40px;top:230px;display:flex;flex-wrap:wrap;justify-content:center;
  gap:0 26px;opacity:0;font-family:'CFAnton',sans-serif;font-size:124px;line-height:1.02;color:#fff;
  text-transform:uppercase;text-align:center;text-shadow:OUTLINE}
.hookslam .acc{color:ACCENT}
.hooktype{position:absolute;left:0;right:0;top:190px;display:flex;justify-content:center;opacity:0}
.hooktype div{max-width:920px;padding:24px 36px;border-radius:22px;background:rgba(10,10,14,.86);
  font-family:'CFMont',sans-serif;font-weight:800;font-size:58px;line-height:1.12;color:#fff;text-align:left;
  box-shadow:0 16px 44px rgba(0,0,0,.45)}
.hooktype i{display:inline-block;width:6px;height:56px;margin-left:6px;vertical-align:-8px;background:ACCENT}
"""


_UL_PATH = "M4 18 C 40 6, 78 26, 118 14 S 176 6, 196 16"

# where captions sit: the top of the caption block on the 1920px frame.
# "auto" means the style's own spot, moved clear of the face when we know
# where the face is.
POSITIONS = {"top": 400, "middle": 860, "bottom": 1400}
SEAM = 960                      # the split-screen seam


@dataclass(frozen=True)
class Spec:
    """Everything that decides how the text on a clip looks."""
    title: str = ""
    style: str = "bold"
    accent: str = "#FFD400"
    accent2: str = "#39FF88"
    hook: bool = True
    hook_style: str = "card"             # card | slam | type
    progress: bool = True
    keywords: Tuple[str, ...] = ()
    emojis: Mapping[str, str] = field(default_factory=dict)   # AI's word -> emoji picks
    use_emoji: bool = False
    watermark: str = ""
    motion: bool = True                  # stat cards + underlines
    position: str = "auto"               # auto | top | middle | bottom
    face_bottom: Optional[float] = None  # the speaker's chin on the 1920 frame
    seam: Tuple[Tuple[float, float], ...] = ()     # split-screen windows (clip time)
    flashes: Tuple[float, ...] = ()      # impact flash times

    @classmethod
    def from_settings(cls, s: Mapping[str, Any], clip: Mapping[str, Any], *, seam=(),
                      flashes=(), face_bottom=None) -> "Spec":
        return cls(title=str(clip.get("title") or ""), style=str(s["caption_style"]),
                   accent=str(s["accent"]), accent2=str(s["accent2"]),
                   hook=bool(s["hook_title"]), hook_style=str(s["hook_style"]),
                   progress=bool(s["progress_bar"]), keywords=tuple(clip.get("keywords") or ()),
                   emojis=dict(clip.get("emojis") or {}), use_emoji=bool(s["emojis"]),
                   watermark=str(s["watermark"] or ""), motion=bool(s["motion_graphics"]),
                   position=str(s["caption_position"]), face_bottom=face_bottom,
                   seam=tuple(tuple(w) for w in seam), flashes=tuple(flashes))

    @property
    def handle(self) -> str:
        return self.watermark.strip()[:40]


@dataclass
class Overlay:
    """A built composition, and when its graphics land (for the sound design:
    a pop per emoji and stat card)."""
    html: str
    pops: List[float]


@dataclass(frozen=True)
class _Layout:
    captions: int        # caption block y
    top: bool            # captions ended up at the top: emojis go under them
    stat_y: int
    hook_room: int       # while the hook shows, top captions step down to here (0 = no)


def _layout(spec: Spec, style: styles.Style) -> _Layout:
    y, pos = POSITIONS.get(spec.position) or style.top, spec.position
    if pos == "auto" and spec.face_bottom and spec.face_bottom + 50 > y:
        # just below the chin; if the face sits low in the frame, go above it
        if spec.face_bottom + 50 <= 1420:
            y = int(spec.face_bottom + 50)
        else:
            y, pos = POSITIONS["top"], "top"
    return _Layout(captions=y, top=pos == "top",
                   stat_y=560 if pos == "middle" else 830, hook_room=600 if pos == "top" else 0)


def _in(t: float, wins) -> bool:
    return any(a <= t < b for a, b in wins)


class _Doc:
    """The composition being written: timed elements + the GSAP timeline."""

    def __init__(self) -> None:
        self.body: List[str] = []
        self.js: List[str] = []

    def el(self, cls: str, id_: str, start: float, dur: float, track: int, inner: str = "",
           style: str = "") -> None:
        st = f' style="{style}"' if style else ""
        self.body.append(f'<div class="clip {cls}" id="{id_}"{st} data-start="{start:.3f}" '
                         f'data-duration="{dur:.3f}" data-track-index="{track}">{inner}</div>')

    def tl(self, *lines: str) -> None:
        self.js.extend(lines)


def build(words: Words, duration: float, spec: Spec) -> Overlay:
    """One HyperFrames composition - everything drawn over the clip: animated
    captions, hook title, emojis, stat cards for spoken numbers, hand-drawn
    underlines, impact flashes, progress bar and (only if you set one) your
    watermark. Nothing names ClipForge or the source channel. (The film look is done in ffmpeg: as overlay
    frames grain makes every PNG incompressible and the render crawls.)"""
    style = styles.get(spec.style)
    duration = max(0.5, float(duration))
    lay = _layout(spec, style)
    hook_end = min(3.2, max(1.6, duration - 0.3)) if spec.hook and spec.title.strip() else 0.0
    doc = _Doc()
    ov = Overlay("", [])

    stats = [m for m in (captions.number_marks(words, not_before=0.4) if spec.motion else [])
             if min(duration - 0.05, m["t"] + 2.0) - m["t"] >= 0.8]
    _captions(doc, ov, words, spec, style, lay, hook_end, stats)
    _stats(doc, ov, stats, duration, spec, lay)
    _flashes(doc, spec.flashes, duration)
    if hook_end:
        _hook(doc, spec, hook_end)
    if spec.progress:
        doc.el("bar", "bar", 0, duration, 3, "<i></i>")
        doc.tl(f'tl.fromTo("#bar i",{{scaleX:0}},{{scaleX:1,duration:{duration:.3f},ease:"none"}},0);')
    _watermark(doc, spec, duration)

    css = (_CSS.replace("TOP", str(lay.captions)) + style.css + _MG_CSS) \
        .replace("OUTLINE", styles.OUTLINE).replace("ACCENT", spec.accent)
    doc.tl(f'tl.set({{}},{{}},{duration:.3f});')
    ov.html = ("<!doctype html>\n<html lang=\"en\"><head><meta charset=\"utf-8\">\n"
               f"<style>{css}</style></head><body>\n"
               f'<div id="root" data-composition-id="cf" data-width="{W}" data-height="{H}" '
               f'data-start="0" data-duration="{duration:.3f}" data-fps="30">\n'
               + "\n".join(doc.body) +
               "\n</div>\n<script src=\"gsap.min.js\"></script>\n<script>\n"
               "const tl = gsap.timeline({paused:true});\n" + "\n".join(doc.js) +
               '\nwindow.__timelines = window.__timelines || {};\nwindow.__timelines["cf"] = tl;\n'
               "</script></body></html>\n")
    ov.pops.sort()
    return ov


def _captions(doc: _Doc, ov: Overlay, words: Words, spec: Spec, style: styles.Style,
              lay: _Layout, hook_end: float, stats) -> None:
    emph = captions.emphasis(words, spec.title, spec.keywords)
    pages = captions.paginate(words, style.page)
    stat_words = {m["i"] for m in stats}
    stat_windows = [(m["t"], m["t"] + 2.0) for m in stats]
    emo = {n: e for n, e in (captions.emoji_marks(words, pages, spec.emojis)
                             if spec.use_emoji and style.emoji else {}).items()
           # a stat card owns that space
           if not any(a - .3 < pages[n]["s"] < b for a, b in stat_windows)}
    # a hand-drawn underline under a key word, now and then (not on a number
    # that already gets a stat card)
    underline: set = set()
    if spec.motion and style.underline:
        last = -99.0
        for i in sorted(emph):
            if i not in stat_words and words[i]["s"] - last >= 4.0 and len(captions.clean(words[i]["w"])) >= 4:
                underline.add(i)
                last = words[i]["s"]

    for n, pg in enumerate(pages):
        ps, pe = pg["s"], pg["e"]
        at_seam = _in((ps + pe) / 2, spec.seam)
        y = SEAM - (70 if style.compact else 100) if at_seam else lay.captions
        if lay.hook_room and not at_seam and ps < hook_end:
            y = lay.hook_room
        if n in emo:
            doc.el("emo", f"e{n}", ps, pe - ps, 4, emo[n], f"top:{y + 240 if lay.top else y - 150}px")
            doc.tl(f'tl.fromTo("#e{n}",{{opacity:0,scale:.3,rotation:-25,y:30}},'
                   f'{{opacity:1,scale:1,rotation:0,y:0,duration:.32,ease:"back.out(2.6)"}},{ps:.3f});',
                   f'tl.to("#e{n}",{{y:-10,duration:{max(.1, pe - ps - .45):.3f},ease:"sine.inOut"}},{ps + .32:.3f});',
                   f'tl.set("#e{n}",{{opacity:0}},{pe:.3f});')
            ov.pops.append(ps)
        beats = [styles.Beat(i, words[i]["s"], max(words[i]["e"], words[i]["s"] + 0.12), ps, pe,
                             i in emph, spec.accent, spec.accent2) for i in pg["idx"]]
        spans = "".join(f'<span class="w" id="w{b.i}">{style.decor(b)}'
                        + (f'<svg class="ul" viewBox="0 0 200 30" preserveAspectRatio="none">'
                           f'<path pathLength="100" d="{_UL_PATH}"/></svg>' if b.i in underline else "")
                        + f'<b>{html.escape(captions.display(words[b.i]["w"], style.upper))}</b></span>'
                        for b in beats)
        doc.el("page", f"p{n}", ps, pe - ps, 1, spans, f"top:{y}px")
        doc.tl(*style.enter(f"#p{n}", n, ps, pe), f'tl.set("#p{n}",{{opacity:0}},{pe:.3f});')
        for b in beats:
            doc.tl(*style.word(b))
            if b.i in underline:
                doc.tl(f'tl.fromTo("{b.sel} .ul path",{{strokeDashoffset:100}},'
                       f'{{strokeDashoffset:0,duration:.38,ease:"power2.inOut"}},{b.on + .05:.3f});')


def _stats(doc: _Doc, ov: Overlay, stats, duration: float, spec: Spec, lay: _Layout) -> None:
    """A spoken number counts up on a card above the captions."""
    for k, m in enumerate(stats):
        t0 = m["t"]
        t1 = min(duration - 0.05, t0 + 2.0)
        lab = f'<div class="lab">{html.escape(m["label"])}</div>' if m["label"] else ""
        doc.el("stat", f"st{k}", t0, t1 - t0, 6,
               f'<div class="num" id="sn{k}">{html.escape(m["prefix"])}0{html.escape(m["suffix"])}</div>{lab}',
               f"top:{250 if _in(t0, spec.seam) else lay.stat_y}px")
        doc.tl(f'tl.fromTo("#st{k}",{{opacity:0,y:40,scale:.85}},{{opacity:1,y:0,scale:1,duration:.3,ease:"back.out(1.8)"}},{t0:.3f});')
        steps = 14
        for f in range(steps + 1):
            v = m["val"] * (1 - (1 - f / steps) ** 3)                 # ease-out count
            txt = m["prefix"] + captions.fmt_num(v, m["dec"]) + m["suffix"]
            doc.tl(f'tl.set("#sn{k}",{{textContent:{json.dumps(txt)}}},{t0 + 0.6 * f / steps:.3f});')
        doc.tl(f'tl.to("#st{k}",{{scale:1.07,duration:.09,ease:"power3.out"}},{t0 + .6:.3f});',
               f'tl.to("#st{k}",{{scale:1,duration:.2,ease:"power2.out"}},{t0 + .69:.3f});',
               f'tl.to("#st{k}",{{opacity:0,y:-30,duration:.22,ease:"power2.in"}},{t1 - .22:.3f});')
        ov.pops.append(t0)


def _flashes(doc: _Doc, flashes, duration: float) -> None:
    """A quick burst of light on each zoom (the whoosh lands with it)."""
    for k, t in enumerate(f for f in flashes if 0 < f < duration - 0.3):
        doc.el("flash", f"fl{k}", max(0, t - .05), .4, 7)
        doc.tl(f'tl.to("#fl{k}",{{opacity:.55,duration:.04,ease:"power4.in"}},{max(0, t - .04):.3f});',
               f'tl.to("#fl{k}",{{opacity:0,duration:.22,ease:"power3.out"}},{t:.3f});')


def _hook(doc: _Doc, spec: Spec, end: float) -> None:
    t = spec.title.strip()
    if spec.hook_style == "slam":
        ws = t.upper().split()
        acc = max(range(len(ws)), key=lambda j: len(re.sub(r"\W", "", ws[j]))) if ws else -1
        inner = "".join(f'<span class="{"acc" if j == acc else ""}">{html.escape(x)}</span>'
                        for j, x in enumerate(ws))
        size = 124 if len(t) <= 26 else 104 if len(t) <= 40 else 88
        doc.el("hookslam", "hook", 0, end, 2, inner, f"font-size:{size}px")
        doc.tl('tl.fromTo("#hook",{opacity:0,scale:1.6},{opacity:1,scale:1,duration:.42,ease:"expo.out"},0.05);')
        for j, (sx, sy) in enumerate([(10, -6), (-7, 4), (4, -2), (0, 0)]):     # a three-frame landing shake
            doc.tl(f'tl.to("#hook",{{x:{sx},y:{sy},duration:.033,ease:"power2.out"}},{0.47 + j * .033:.3f});')
    elif spec.hook_style == "type":
        doc.el("hooktype", "hook", 0, end, 2, '<div><span id="hookt"></span><i id="hookc"></i></div>')
        doc.tl('tl.fromTo("#hook",{opacity:0,y:-20},{opacity:1,y:0,duration:.25,ease:"power2.out"},0.05);')
        per = min(0.045, 1.2 / max(1, len(t)))
        for c in range(1, len(t) + 1):
            doc.tl(f'tl.set("#hookt",{{textContent:{json.dumps(t[:c])}}},{0.2 + c * per:.3f});')
        blink = 0.2 + len(t) * per
        while blink < end - .3:
            doc.tl(f'tl.set("#hookc",{{opacity:0}},{blink + .27:.3f});tl.set("#hookc",{{opacity:1}},{blink + .53:.3f});')
            blink += .53
    else:
        doc.el("hook", "hook", 0, end, 2, f'<div class="hookcard">{html.escape(t)}<i></i></div>')
        doc.tl('tl.fromTo("#hook",{opacity:0,y:-40,scale:.9},{opacity:1,y:0,scale:1,duration:.38,ease:"back.out(1.9)"},0.05);',
               'tl.to("#hook .hookcard i",{scaleX:1,duration:.5,ease:"power3.out"},0.35);')
    doc.tl(f'tl.to("#hook",{{opacity:0,y:-24,duration:.25,ease:"power2.in"}},{end - 0.28:.3f});')


def _watermark(doc: _Doc, spec: Spec, duration: float) -> None:
    """Your own @handle, small at the bottom - only if you set one."""
    if spec.handle:
        doc.el("wm", "wm", 0, duration, 5, html.escape(spec.handle))


def render(ov: Overlay, work: Path, out: Path, duration: float) -> Optional[str]:
    """Render to a transparent .mov. Returns an error message, or None."""
    fonts = {f"fonts/{f}": config.ASSETS / "fonts" / f for f in ("Montserrat.ttf", "Anton.ttf")}
    return hyperframes.render(hyperframes.project(work / "hf", ov.html, fonts), out, duration)
