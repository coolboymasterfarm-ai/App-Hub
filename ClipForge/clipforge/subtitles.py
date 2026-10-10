"""The fallback when HyperFrames can't render: the same caption design as an
.ass subtitle file that ffmpeg burns in (libass). Bold, box and clean look
close to the real thing; the other styles fall back to bold. No emojis,
stat cards or motion graphics - libass can't draw them.
"""
from __future__ import annotations

from typing import List

from . import captions, styles
from .captions import Words
from .overlay import SEAM, Spec


def _color(hex_rgb: str, alpha: int = 0) -> str:
    h = hex_rgb.lstrip("#")
    return f"&H{alpha:02X}{h[4:6]}{h[2:4]}{h[0:2]}".upper()


def _time(t: float) -> str:
    cs = int(round(max(0.0, t) * 100))
    return f"{cs // 360000}:{cs // 6000 % 60:02d}:{cs // 100 % 60:02d}.{cs % 100:02d}"


def ass(words: Words, duration: float, spec: Spec) -> str:
    name = spec.style if spec.style in ("bold", "box", "clean") else "bold"
    style = styles.get(name)
    clean = name == "clean"
    emph = captions.emphasis(words, spec.title, spec.keywords)
    y = {"top": 480, "middle": 960, "bottom": 1500}.get(spec.position) or (1330 if clean else 1250)
    white, acc, acc2 = _color("#FFFFFF"), _color(spec.accent), _color(spec.accent2)
    head = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n"
        "WrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, "
        "BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, "
        "BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Cap,Anton,{84 if clean else 130},{white},{white},&H00000000,&H80000000,0,0,0,0,100,100,1,0,1,"
        f"{3 if clean else 7},3,5,60,60,0,1\n"
        f"Style: Hook,Anton,88,&H00111111,&H00111111,&H00FFFFFF,&H00FFFFFF,0,0,0,0,100,100,0,0,3,"
        "18,0,8,80,80,190,1\n\n[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    lines: List[str] = []
    for pg in captions.paginate(words, style.page):
        idx = pg["idx"]
        # one event per spoken word: the page, with that word lit
        marks = [pg["s"]] + [max(pg["s"], words[i]["s"]) for i in idx[1:]] + [pg["e"]]
        py = SEAM if any(a <= (pg["s"] + pg["e"]) / 2 < b for a, b in spec.seam) else y
        for k, i in enumerate(idx):
            a, b = marks[k], marks[k + 1]
            if b - a < 0.02:
                continue
            parts = []
            for j in idx:
                t = captions.display(words[j]["w"], style.upper).replace("{", "(").replace("}", ")")
                base = acc2 if j in emph else white
                if j == i:
                    lit = (acc if j in emph else white) if clean else acc
                    pop = "" if clean else r"\fscx112\fscy112"
                    parts.append(r"{\c" + lit + pop + "}" + t + r"{\fscx100\fscy100\c" + base + "}")
                else:
                    parts.append(r"{\c" + base + "}" + t)
            lines.append(f"Dialogue: 0,{_time(a)},{_time(b)},Cap,,0,0,0,,{{\\an5\\pos(540,{py})}}"
                         + " ".join(parts))
    if spec.hook and spec.title.strip():
        end = min(3.2, max(1.6, duration - 0.3))
        lines.append(f"Dialogue: 1,{_time(0.05)},{_time(end)},Hook,,0,0,0,,"
                     + r"{\fad(180,220)}" + spec.title.strip().upper().replace("{", "("))
    if spec.handle:
        lines.append(f"Dialogue: 1,{_time(0)},{_time(duration)},Cap,,0,0,0,,"
                     + r"{\an2\pos(540,1830)\fs34\bord2\alpha&H70&}" + spec.handle.replace("{", "("))
    return head + "\n".join(lines) + "\n"
