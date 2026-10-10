"""The caption styles.

Each style is one entry in STYLES: its CSS, how a caption page comes on,
and what happens to each word as it is spoken. overlay.py knows nothing
about individual styles - it asks the style.

The motion of most follows a HyperFrames registry caption component
(caption-highlight, caption-pill-karaoke, caption-neon-glow,
caption-glitch-rgb, caption-kinetic-slam, caption-emoji-pop,
caption-particle-burst), rebuilt for a 1080x1920 clip and a real transcript.

Word callbacks get a Beat and return GSAP lines; page callbacks get the page
selector and its start/end. All times are seconds on the clip's clock.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Callable, List, Tuple

from .captions import PAGE, SUBTITLE_PAGE

OUTLINE = ("0 0 0 #000,5px 5px 0 #000,-5px -5px 0 #000,5px -5px 0 #000,-5px 5px 0 #000,"
           "0 6px 0 #000,0 -6px 0 #000,6px 0 0 #000,-6px 0 0 #000,0 12px 22px rgba(0,0,0,.55)")
_BOX_OUTLINE = ("0 0 0 #000,4px 4px 0 #000,-4px -4px 0 #000,4px -4px 0 #000,-4px 4px 0 #000,"
                "0 5px 0 #000,0 -5px 0 #000,5px 0 0 #000,-5px 0 0 #000,0 10px 20px rgba(0,0,0,.5)")
_GLITCH_REST = "0 5px 18px rgba(0,0,0,.52)"
_NEON_REST = ("rgba(160,255,250,.55)", "0 4px 16px rgba(0,0,0,.75),0 0 3px rgba(0,0,0,.8)")


Enter = Callable[[str, int, float, float], List[str]]   # (page selector, page number, start, end)


@dataclass(frozen=True)
class Beat:
    """One word being spoken."""
    i: int            # word index (also its element id: #w{i})
    on: float         # starts being said
    off: float        # stops (at least 0.12 s after on)
    ps: float         # its page appears
    pe: float         # its page goes
    key: bool         # an emphasised word
    accent: str       # the active-word colour
    accent2: str      # the key-word colour

    @property
    def sel(self) -> str:
        return f"#w{self.i}"

    @property
    def base(self) -> str:
        return self.accent2 if self.key else "#ffffff"


def _pop_in(p: str, n: int, ps: float, pe: float) -> List[str]:
    return [f'tl.fromTo("{p}",{{opacity:0,scale:.86,y:18}},'
            f'{{opacity:1,scale:1,y:0,duration:.14,ease:"back.out(2.2)"}},{ps:.3f});']


def _rise(dy: int, dur: str) -> "Enter":
    return lambda p, n, ps, pe: [f'tl.fromTo("{p}",{{opacity:0,y:{dy}}},'
                                 f'{{opacity:1,y:0,duration:{dur},ease:"power2.out"}},{ps:.3f});']


@dataclass(frozen=True)
class Style:
    label: str
    css: str
    word: Callable[[Beat], List[str]]
    enter: "Enter" = _pop_in
    decor: Callable[[Beat], str] = lambda b: ""        # extra markup inside a word
    page: Tuple[int, int, float] = PAGE                # pagination limits
    top: int = 1150                                    # default caption y
    upper: bool = True
    compact: bool = False                              # smaller type: sits closer to a seam
    emoji: bool = True                                 # emojis pop above its pages
    underline: bool = True                             # hand-drawn underline on key words


# ---------------------------------------------------------------- word motion

def _bold(b: Beat) -> List[str]:
    return [f'tl.set("{b.sel}",{{color:"{b.base}"}},{b.ps:.3f});',
            f'tl.to("{b.sel}",{{color:"{b.accent}",scale:1.08,duration:.08,ease:"power2.out"}},{b.on:.3f});',
            f'tl.to("{b.sel}",{{color:"{b.base}",scale:1,duration:.1,ease:"power2.in"}},{b.off:.3f});']


def _box(b: Beat) -> List[str]:
    return [f'tl.set("{b.sel}",{{color:"{b.base}"}},{b.ps:.3f});',
            f'tl.to("{b.sel} .bx",{{opacity:1,scale:1,duration:.09,ease:"back.out(2.5)"}},{b.on:.3f});',
            f'tl.to("{b.sel}",{{color:"#0b0b0f",textShadow:"0 0 0 rgba(0,0,0,0)",duration:.06}},{b.on:.3f});',
            f'tl.set("{b.sel} .bx",{{opacity:0,scale:.6}},{b.off:.3f});',
            f'tl.set("{b.sel}",{{color:"{b.base}",textShadow:"{_BOX_OUTLINE}"}},{b.off:.3f});']


def _highlight(b: Beat) -> List[str]:
    return [f'tl.to("{b.sel} .hl",{{opacity:1,scaleX:1,duration:.15,ease:"power2.out"}},{b.on:.3f});',
            f'tl.to("{b.sel} .hl",{{opacity:0,scaleX:1.02,duration:.1,ease:"power2.in"}},{b.off:.3f});',
            f'tl.set("{b.sel} .hl",{{scaleX:0}},{b.off + .1:.3f});']


def _pop(b: Beat) -> List[str]:
    lit = [b.accent, "#FF76FF", "#B2F7FF"][b.i % 3] if b.key else "#ffffff"
    return [f'tl.to("{b.sel}",{{color:"{lit}",scale:1.1,duration:.07,ease:"power2.out"}},{b.on:.3f});',
            f'tl.to("{b.sel}",{{scale:1,duration:.12,ease:"power2.out"}},{b.on + .07:.3f});']


def _karaoke(b: Beat) -> List[str]:
    lit = "#e0115f" if b.key else "#0b0b0f"
    return [f'tl.to("{b.sel}",{{color:"{lit}",duration:{max(.06, min(.3, b.off - b.on)):.3f},ease:"none"}},{b.on:.3f});']


def _neon(b: Beat) -> List[str]:
    c = "#FF0099" if b.key else "#00FFF0"
    return [f'tl.to("{b.sel}",{{color:"{c}",textShadow:"0 0 10px {c}, 0 0 35px {c}, 0 0 90px {c}",duration:.06}},{b.on:.3f});',
            f'tl.to("{b.sel}",{{color:"{_NEON_REST[0]}",textShadow:"{_NEON_REST[1]}",duration:.06}},{b.off:.3f});']


def _glitch(b: Beat) -> List[str]:
    r = ((b.i * 9301 + 49297) % 233280) / 233280.0           # seeded, deterministic
    trav, mag = -(8 + r * 8), 5 + r * 7
    split = f"{mag:.1f}px 0 #ff003c, -{mag:.1f}px 0 #00e5ff, {_GLITCH_REST}"
    js = [f'tl.to("{b.sel}",{{x:{trav:.1f},textShadow:"{split}",color:"{b.base}",duration:.05,ease:"none"}},{b.on:.3f});',
          f'tl.to("{b.sel}",{{x:0,textShadow:"{_GLITCH_REST}",duration:.12,ease:"power3.out"}},{b.on + .05:.3f});']
    if b.key and b.off + .3 < b.pe:                         # an aftershock on key words
        js += [f'tl.to("{b.sel}",{{x:{-trav / 2:.1f},textShadow:"{split}",duration:.045,ease:"none"}},{b.off + .08:.3f});',
               f'tl.to("{b.sel}",{{x:0,textShadow:"{_GLITCH_REST}",duration:.075,ease:"power3.out"}},{b.off + .125:.3f});']
    return js


def _slam(b: Beat) -> List[str]:
    return [f'tl.set("{b.sel}",{{color:"{b.accent if b.key else "#ffffff"}"}},{b.ps:.3f});']


def _burst(b: Beat) -> List[str]:
    js = [f'tl.to("{b.sel}",{{color:"{b.accent}",scale:1.12,duration:.1,ease:"power2.out"}},{b.on:.3f});',
          f'tl.to("{b.sel}",{{color:"{b.base}",scale:1,duration:.1}},{b.off:.3f});']
    if b.key:
        for k in range(10):
            ang = 2 * math.pi * k / 10 + (b.i % 5) * 0.3
            dist = 110 + (k * 37 % 60)
            dx, dy = math.cos(ang) * dist, math.sin(ang) * dist * 0.8
            pt = f"{b.sel} .pt:nth-child({k + 1})"
            js += [f'tl.fromTo("{pt}",{{x:0,y:0,opacity:0,scale:1}},'
                   f'{{x:{dx:.0f},y:{dy:.0f},opacity:1,duration:.14,ease:"power3.out"}},{b.on:.3f});',
                   f'tl.to("{pt}",{{opacity:0,scale:.3,duration:.45,ease:"power1.in"}},{b.on + .14:.3f});']
    return js


def _clean(b: Beat) -> List[str]:
    return [f'tl.to("{b.sel}",{{color:"{b.accent if b.key else "#ffffff"}",duration:.08}},{b.on:.3f});']


def _burst_decor(b: Beat) -> str:
    colors = [b.accent, b.accent2, "#ff5ec8", "#5ec8ff"]
    return "".join(f'<i class="pt" style="background:{colors[k % 4]}"></i>' for k in range(10)) if b.key else ""


# ---------------------------------------------------------------- page motion

def _squeeze(p: str, n: int, ps: float, pe: float) -> List[str]:
    return [f'tl.fromTo("{p}",{{opacity:0,scaleX:.8}},{{opacity:1,scaleX:1,duration:.133,ease:"power3.out"}},{ps:.3f});',
            f'tl.to("{p}",{{scaleX:.75,opacity:.8,duration:.1,ease:"power2.in"}},{max(ps, pe - .1):.3f});']


def _flicker(p: str, n: int, ps: float, pe: float) -> List[str]:
    return [f'tl.fromTo("{p}",{{opacity:0}},{{opacity:1,duration:.05,ease:"steps(1)"}},{ps:.3f});',
            f'tl.fromTo("{p}",{{x:-8}},{{x:0,duration:.14,ease:"power3.out"}},{ps + .05:.3f});']


_SLAM_IN = [("{y:90,opacity:0}", '{y:0,opacity:1,duration:.22,ease:"back.out(1.7)"}'),
            ("{x:-140,opacity:0}", '{x:0,opacity:1,duration:.2,ease:"expo.out"}'),
            ("{x:140,opacity:0}", '{x:0,opacity:1,duration:.2,ease:"expo.out"}'),
            ("{scale:1.9,opacity:0}", '{scale:1,opacity:1,duration:.24,ease:"back.out(2.2)"}')]


def _slam_in(p: str, n: int, ps: float, pe: float) -> List[str]:
    frm, to = _SLAM_IN[n % 4]                             # alternate directions page by page
    return [f'tl.fromTo("{p}",{frm},{to},{ps:.3f});']


def _burst_in(p: str, n: int, ps: float, pe: float) -> List[str]:
    return [f'tl.fromTo("{p}",{{opacity:0,scale:.8}},{{opacity:1,scale:1,duration:.2,ease:"back.out(1.5)"}},{ps:.3f});']


# ---------------------------------------------------------------- the styles

STYLES = {
    "bold": Style("Bold - big words, the spoken one pops", f"""
.w{{font-weight:900;font-size:92px;line-height:1.02;color:#fff;letter-spacing:-.01em;text-shadow:{OUTLINE}}}
""", _bold),
    "box": Style("Box - the spoken word on a colour block", f"""
.w{{font-weight:900;font-size:88px;line-height:1.08;color:#fff;letter-spacing:-.01em;text-shadow:{_BOX_OUTLINE}}}
.bx{{position:absolute;left:-14px;right:-14px;top:-6px;bottom:-6px;border-radius:18px;
  background:ACCENT;opacity:0;transform:scale(.6);z-index:0}}
""", _box, decor=lambda b: '<i class="bx"></i>'),
    "highlight": Style("Highlight - red sweep behind each word", """
.page{gap:10px 16px}
.w{font-weight:900;font-size:84px;line-height:1.12;color:#fff;letter-spacing:-.01em;padding:0 10px;
  text-shadow:0 6px 18px rgba(0,0,0,.45),0 0 3px rgba(0,0,0,.6)}
.hl{position:absolute;left:0;right:0;top:4px;bottom:2px;border-radius:12px;z-index:0;opacity:0;
  background:linear-gradient(135deg,#ff1745 0%,#df1238 100%);transform:scaleX(0);transform-origin:left center}
""", _highlight, enter=_rise(10, ".12"), decor=lambda b: '<i class="hl"></i>'),
    "pop": Style("Pop - outlined words that squeeze in", """
.page{gap:6px 22px}
.w{font-weight:900;font-size:90px;line-height:1.08;color:#fff;letter-spacing:-.03em;
  -webkit-text-stroke:7px #000;paint-order:stroke fill;filter:drop-shadow(0 8px 14px rgba(0,0,0,.45))}
""", _pop, enter=_squeeze),
    "karaoke": Style("Karaoke - pill that fills word by word", """
.page{left:90px;right:90px;gap:4px 16px;padding:18px 30px 22px;border-radius:26px;background:#e7e5e7;
  box-shadow:0 14px 40px rgba(0,0,0,.35);width:auto}
.w{font-weight:800;font-size:64px;line-height:1.16;color:#a3a1a4;letter-spacing:-.01em}
""", _karaoke, enter=_rise(14, ".16"), page=(5, 26, 0.5), top=1230, upper=False,
        compact=True, underline=False),
    "neon": Style("Neon - words light up with a glow", f"""
.page{{gap:8px 26px}}
.w{{font-weight:900;font-size:92px;line-height:1.05;color:{_NEON_REST[0]};letter-spacing:.03em;
  text-shadow:{_NEON_REST[1]}}}
""", _neon, enter=_flicker),
    "glitch": Style("Glitch - RGB split on every word", f"""
.page{{gap:6px 30px}}
.w{{font-weight:900;font-size:88px;line-height:1.06;color:#fff;letter-spacing:-.01em;
  text-shadow:{_GLITCH_REST}}}
""", _glitch, enter=_rise(10, ".12")),
    "slam": Style("Slam - one huge word at a time", f"""
.page{{left:40px;right:40px}}
.w{{font-family:'CFAnton',sans-serif;font-size:190px;line-height:1;color:#fff;letter-spacing:.01em;
  text-shadow:{OUTLINE}}}
""", _slam, enter=_slam_in, page=(1, 99, 0.3), top=1110, emoji=False, underline=False),
    "burst": Style("Burst - key words explode with particles", f"""
.page{{gap:6px 30px}}
.w{{font-weight:900;font-size:88px;line-height:1.05;color:#fff;letter-spacing:-.01em;text-shadow:{OUTLINE}}}
.pt{{position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;
  opacity:0;z-index:0}}
""", _burst, enter=_burst_in, decor=_burst_decor),
    "clean": Style("Clean - calm subtitle line", """
.page{gap:6px 18px}
.w{font-weight:800;font-size:66px;line-height:1.14;color:rgba(255,255,255,.62);
  text-shadow:0 3px 14px rgba(0,0,0,.85),0 0 3px rgba(0,0,0,.9)}
""", _clean, page=SUBTITLE_PAGE, top=1250, upper=False, compact=True, underline=False),
}


def get(name: str) -> Style:
    return STYLES.get(name) or STYLES["bold"]
