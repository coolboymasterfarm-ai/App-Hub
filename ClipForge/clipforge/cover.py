"""A cover / thumbnail for a clip: the speaker's best frame with the hook
title set big in Anton, for Shorts and Reels covers."""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config, media


def _x_at(keys, t: float) -> float:
    keys = [tuple(k) for k in keys]
    for (t0, x0), (t1, x1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            return x0 + (x1 - x0) * (t - t0) / max(1e-6, t1 - t0)
    return keys[-1][1] if t > keys[-1][0] else keys[0][1]


def _wrap(text: str, width: int) -> List[str]:
    lines, cur = [], ""
    for w in text.split():
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    return lines + ([cur] if cur else [])


def make(src: Path, clip: Dict[str, Any], plan: Dict[str, Any], work: Path, out: Path,
          at: Optional[float] = None) -> None:
    """The frame where the face is biggest and facing us (reframe picked it),
    cropped like the clip, darkened at the bottom, with the title on it."""
    s = config.settings()
    work.mkdir(parents=True, exist_ok=True)
    shutil.copy2(config.ASSETS / "fonts" / "Anton.ttf", work / "Anton.ttf")
    at = at if at is not None else (plan.get("cover_t") if plan.get("cover_t") is not None else 1.2)
    t = float(clip["start"]) + at
    if plan.get("mode") == "crop":
        x = _x_at(plan["keys"], at)
        pic = f"crop={plan['cw']}:{plan['h'] - plan['h'] % 2}:{x:.0f}:0,scale=1080:1920"
    else:
        pic = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920"
    title = str(clip.get("title") or "").upper().replace("\\", "")
    lines = _wrap(title, 14)[:4]
    size = 150 if max((len(x) for x in lines), default=0) <= 11 else 124
    y0 = 1500 - len(lines) * (size + 12)
    txt = ""
    for k, line in enumerate(lines):
        (work / f"cov{k}.txt").write_text(line, encoding="utf-8")
        color = str(s["accent"]).lstrip("#") if k == len(lines) - 1 else "FFFFFF"
        txt += (f",drawtext=fontfile=Anton.ttf:textfile=cov{k}.txt:fontsize={size}:fontcolor=0x{color}"
                f":borderw=9:bordercolor=black:x=(w-tw)/2:y={y0 + k * (size + 12)}")
    shade = ",".join(f"drawbox=x=0:y=ih*{0.5 + k * 0.05:.2f}:w=iw:h=ih*{0.5 - k * 0.05:.2f}:color=black@0.09:t=fill"
                     for k in range(6))                   # a soft darkening towards the bottom
    media.run(["-ss", f"{t:.3f}", "-i", str(src.resolve()), "-frames:v", "1",
               "-vf", f"{pic},eq=contrast=1.06:saturation=1.15,{shade}{txt}",
               "-q:v", "2", str(out.resolve())], cwd=str(work))
