"""Cutting one clip: the whole edit in one ffmpeg pass (two with shader transitions).

- the speaker-following 9:16 crop (reframe.py) - or, for a source that is
  already vertical/square, the picture fitted over a blurred copy of itself
- dead air and "um"/"uh" cut out, each cut with a 30 ms audio crossfade so
  there is no click; video and audio cut on the same frame boundaries
- punch-in zooms on alternate beats, which also hides the jump cuts
- a light grade (contrast, saturation, sharpening)
- the HyperFrames caption/title overlay composited on top (or the .ass
  fallback burned in)
- voice cleanup: rumble filter, compressor, loudness normalised to -14 LUFS
  (what TikTok/Reels/Shorts play back at)
"""
from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from . import config, hyperframes, media, overlay, reframe, shaders, subtitles

FPS = 30
Seg = Tuple[float, float]
_FILLERS = {"um", "uh", "umm", "uhh", "erm", "uhm", "hmm", "mm", "ah", "er"}


def _bare(w: str) -> str:
    return re.sub(r"[^\w']", "", w.lower())


def clip_words(words: List[Dict[str, Any]], start: float, end: float) -> List[Dict[str, Any]]:
    """Words inside the clip, on the clip's own clock."""
    return [{**w, "s": round(w["s"] - start, 3), "e": round(min(w["e"], end) - start, 3)}
            for w in words if w["s"] >= start - 0.05 and w["s"] < end]


def keep_segments(cw: List[Dict[str, Any]], dur: float, *, silence: bool,
                  fillers: bool) -> List[Seg]:
    """The stretches of the clip to keep, frame-aligned. Pauses up to ~0.5 s
    stay (they are rhythm); longer dead air is cut down to a breath."""
    if not (silence or fillers) or not cw:
        return [(_snap(0), _snap(dur))]
    pre, post, bridge = 0.10, 0.18, 0.30
    spans: List[List[float]] = []
    for w in cw:
        if fillers and _bare(w["w"]) in _FILLERS:
            continue
        a, b = max(0.0, w["s"] - pre), min(dur, w["e"] + post)
        if spans and (a - spans[-1][1] < (bridge if silence else 99)):
            spans[-1][1] = max(spans[-1][1], b)
        else:
            spans.append([a, b])
    if not spans:
        return [(_snap(0), _snap(dur))]
    if spans[0][0] < 0.4:
        spans[0][0] = 0.0
    segs: List[Seg] = []
    for a, b in spans:
        a, b = _snap(a), _snap(b)
        if b - a >= 0.2:
            segs.append((a, b))
    return segs or [(_snap(0), _snap(dur))]


def _snap(t: float) -> float:
    """Half-frame boundaries: select keeps frames k/30 inside [a, b), and the
    audio cut at the same a/b is exactly as long as those frames."""
    return (max(1, round(t * FPS)) - 0.5) / FPS


def remap(t: float, segs: List[Seg]) -> Optional[float]:
    out = 0.0
    for a, b in segs:
        if a <= t < b:
            return out + t - a
        out += b - a
    return None


def out_words(cw: List[Dict[str, Any]], segs: List[Seg]) -> List[Dict[str, Any]]:
    res = []
    for w in cw:
        t0 = max(w["s"], segs[0][0])
        s = remap(t0, segs)
        if s is None or _bare(w["w"]) in _FILLERS and len(segs) > 1:
            continue
        # the end: clamp into the same kept segment
        e = next(s + min(w["e"], b) - t0 for a, b in segs if a <= t0 < b)
        res.append({"w": w["w"], "s": round(s, 3), "e": round(max(e, s + 0.05), 3)})
    return res


def _out_windows(wins, segs: List[Seg]) -> List[Seg]:
    """Clip-time windows -> the edited clip's timeline (dead air removed)."""
    out, acc = [], 0.0
    for a, b in segs:
        for x, y in wins:
            lo, hi = max(a, x), min(b, y)
            if hi - lo > 0.05:
                out.append((round(acc + lo - a, 3), round(acc + hi - a, 3)))
        acc += b - a
    return out


def punch_windows(words: List[Dict[str, Any]], segs: List[Seg], total: float) -> List[Seg]:
    """Zoom in / out on sentence and jump-cut boundaries, at most every 2.5 s."""
    marks = set()
    acc = 0.0
    for a, b in segs[:-1]:
        acc += b - a
        marks.add(round(acc, 3))
    for i, w in enumerate(words[1:], 1):
        if re.search(r"[.?!]$", words[i - 1]["w"]):
            marks.add(round(w["s"], 3))
    zoomed, last, out = False, 0.0, []
    begin = 0.0
    for m in sorted(marks):
        if m < 1.2 or m > total - 1.0 or m - last < 2.5:
            continue
        if zoomed:
            out.append((begin, m))
        else:
            begin = m
        zoomed, last = not zoomed, m
    if zoomed:
        out.append((begin, total))
    return out


def _expr(keys) -> str:
    return reframe.crop_expr([tuple(k) for k in keys]).replace(",", r"\,")


LOOKS = {"none": "", "vignette": ",vignette=angle=PI/4.6",
         "grain": ",noise=c0s=9:c0f=t+u",
         "film": ",vignette=angle=PI/4.6,noise=c0s=9:c0f=t+u"}


def _video_chain(plan: Dict[str, Any], segs: List[Seg], punch: List[Seg], polish: bool,
                 look: str = "none") -> str:
    h = plan["h"]
    sp = plan.get("split") if plan["mode"] == "crop" else None
    if plan["mode"] == "crop":
        x = _expr(plan["keys"])
        crop = (f"crop={plan['cw']}:{h - h % 2}:x='{x}':y=0,"
                f"scale=1080:1920:flags=lanczos,setsar=1")
        if not sp:
            chain = [f"[0:v]fps={FPS},{crop}[v0]"]
        else:
            # two people: each gets a 1080x960 panel, stacked, with a thin seam
            pw, ph = sp["pw"], sp["ph"]
            panel = lambda k: (f"crop={pw}:{ph}:x='{_expr(sp[k][0])}':y='{_expr(sp[k][1])}',"  # noqa: E731
                               f"scale=1080:960:flags=lanczos,setsar=1")
            en = "+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in sp["windows"])
            chain = [f"[0:v]fps={FPS},split=3[r0][r1][r2]",
                     f"[r0]{crop}[one]",
                     f"[r1]{panel('top')}[top]",
                     f"[r2]{panel('bot')}[bot]",
                     "[top][bot]vstack,drawbox=x=0:y=955:w=1080:h=10:color=black:t=fill[two]",
                     f"[one][two]overlay=0:0:enable='{en}'[v0]"]
    else:           # vertical / square source: fit it over a blurred fill
        chain = [f"[0:v]fps={FPS},split[f0][b0]",
                 "[b0]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
                 "boxblur=30:3,eq=brightness=-0.08[b1]",
                 "[f0]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[f1]",
                 "[b1][f1]overlay=(W-w)/2:(H-h)/2,setsar=1[v0]"]
    grade = ",eq=contrast=1.06:saturation=1.14:gamma=0.98,unsharp=5:5:0.45" if polish else ""
    sel = "+".join(f"between(t,{a:.4f},{b - 1e-4:.4f})" for a, b in segs)
    chain.append(f"[v0]select='{sel}',setpts=N/{FPS}/TB{grade}[v1]")
    if punch:
        z = 1.14
        en = "+".join(f"between(t,{a:.3f},{b:.3f})" for a, b in punch)
        chain.append("[v1]split[pa][pb]")
        chain.append(f"[pb]crop=iw/{z}:ih/{z}:(iw-iw/{z})/2:(ih-ih/{z})*0.3,"
                     f"scale=1080:1920:flags=lanczos[pz]")
        chain.append(f"[pa][pz]overlay=0:0:enable='{en}'{LOOKS.get(look, '')}[v2]")
    else:
        chain.append(f"[v1]null{LOOKS.get(look, '')}[v2]")
    return ";".join(chain)


def _audio_chain(segs: List[Seg]) -> str:
    n = len(segs)
    parts = []
    if n == 1:
        a, b = segs[0]
        parts.append(f"[0:a]atrim={a:.4f}:{b:.4f},asetpts=PTS-STARTPTS[ac]")
    else:
        parts.append(f"[0:a]asplit={n}" + "".join(f"[s{i}]" for i in range(n)))
        for i, (a, b) in enumerate(segs):
            d = b - a
            f = min(0.03, d / 4)
            parts.append(f"[s{i}]atrim={a:.4f}:{b:.4f},asetpts=PTS-STARTPTS,"
                         f"afade=t=in:d={f:.3f},afade=t=out:st={d - f:.4f}:d={f:.3f}[t{i}]")
        parts.append("".join(f"[t{i}]" for i in range(n)) + f"concat=n={n}:v=0:a=1[ac]")
    parts.append("[ac]highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=150:"
                 "makeup=2,loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000[aout]")
    return ";".join(parts)


MUSIC_EXT = {".mp3", ".m4a", ".wav", ".ogg", ".flac", ".aac"}


def pick_music(n: int) -> Optional[Path]:
    """A track from data/music - a different one per clip, in turn."""
    d = config.DATA / "music"
    tracks = sorted(p for p in d.glob("*") if p.suffix.lower() in MUSIC_EXT) if d.exists() else []
    return tracks[(n - 1) % len(tracks)] if tracks else None


def _mix_chain(hits: List[Tuple[float, str]], music_in: Optional[int], total: float,
               music_vol: float) -> str:
    """[aout] (the cleaned voice) + whooshes/pops + ducked music -> [amix].
    The sounds are synthesised, so there are no sample files to license."""
    parts, mix = [], ["[vx]"]
    need_sc = music_in is not None
    parts.append("[aout]asplit=2[vx][sc]" if need_sc else "[aout]anull[vx]")
    hits = sorted((max(0.0, t), k) for t, k in hits if t < total - 0.3)
    for i, (t, kind) in enumerate(hits[:40]):
        if kind == "whoosh":
            src = ("anoisesrc=d=0.5:c=pink:r=48000:a=0.5,highpass=f=350,lowpass=f=5500,"
                   "afade=t=in:d=0.32:curve=exp,afade=t=out:st=0.32:d=0.18,volume=0.30")
            t = max(0.0, t - 0.3)                 # the swell peaks on the cut
        else:
            src = ("sine=f=1250:d=0.09:r=48000,afade=t=out:d=0.09:curve=exp,"
                   "aformat=channel_layouts=mono,volume=0.22")
        ms = int(t * 1000)
        parts.append(f"{src},aformat=sample_rates=48000:channel_layouts=stereo,"
                     f"adelay={ms}|{ms}[fx{i}]")
        mix.append(f"[fx{i}]")
    if need_sc:
        fade = max(0.0, total - 1.5)
        parts.append(f"[{music_in}:a]aformat=sample_rates=48000:channel_layouts=stereo,"
                     f"atrim=0:{total:.3f},volume={music_vol:.3f},"
                     f"afade=t=in:d=0.8,afade=t=out:st={fade:.3f}:d=1.5[mu]")
        # duck the music whenever someone talks
        parts.append("[mu][sc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[md]")
        mix.append("[md]")
    if len(mix) == 1:
        parts.append("[vx]anull[amix]")
    else:
        parts.append("".join(mix) + f"amix=inputs={len(mix)}:normalize=0:duration=first,"
                     "alimiter=limit=0.95[amix]")
    return ";".join(parts)


@dataclass
class Timeline:
    """Every timing decision for one clip, on the edited clip's clock -
    made once, so the picture, the graphics and the sound all agree."""
    segs: List[Seg]                        # kept stretches of the source (clip time)
    total: float                           # edited length
    words: List[Dict[str, Any]]            # captions, retimed to the edit
    split: List[Seg]                       # split-screen windows
    punch: List[Seg]                       # punch-in zoom windows
    joins: List[float]                     # real jump cuts (a pause or a thought removed)
    transitions: List[Tuple[float, str]]   # (time, shader)

    @property
    def plain_zooms(self) -> List[float]:
        """Zoom-ins that get the flash + whoosh (the ones not already carried
        by a shader transition)."""
        return [a for a, _ in self.punch if not any(abs(a - j) < .6 for j, _ in self.transitions)]


def timeline(cw: List[Dict[str, Any]], dur: float, plan: Dict[str, Any], s: Dict[str, Any],
             transitions: bool) -> Timeline:
    segs = keep_segments(cw, dur, silence=bool(s["remove_silence"]), fillers=bool(s["remove_fillers"]))
    total = round(sum(b - a for a, b in segs), 3)
    ow = out_words(cw, segs)
    split = _out_windows((plan.get("split") or {}).get("windows", []), segs)
    punch = punch_windows(ow, segs, total) if s["punch_in"] else []
    # no zooming into a split screen - it would cut both faces in half
    punch = [(a, b) for a, b in punch if not any(a < y and x < b for x, y in split)]
    joins, acc = [], 0.0
    for (a, b), (a2, _) in zip(segs, segs[1:]):
        acc += b - a
        if a2 - b >= 0.4:
            joins.append(acc)
    picks = shaders.pick(joins + [a for a, _ in punch], total, mode=str(s["transitions"]),
                         style=str(s["transition_style"]), avoid=tuple(split)) if transitions else []
    return Timeline(segs, total, ow, split, punch, joins, picks)


class _Inputs:
    """ffmpeg inputs, handing out their stream indexes as they are added."""

    def __init__(self) -> None:
        self.args: List[str] = []
        self._n = 0

    def add(self, *args: str) -> int:
        self.args += args
        self._n += 1
        return self._n - 1


def _transitions(src_args: List[str], vchain: str, tl: Timeline, tmode: str, work: Path,
                 log: Callable[[str], None]) -> Optional[Tuple[Path, Path, float]]:
    """Pass 1 (the edited picture alone) and the shader strip made from its
    frames. None if HyperFrames could not render them."""
    base = work / "base.mp4"
    log(f"Shader transitions: {', '.join(shaders.NAMES[n] for _, n in tl.transitions)}")
    media.run([*src_args, "-filter_complex", vchain + ";[v2]format=yuv420p[vb]", "-map", "[vb]",
               "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-r", str(FPS),
               "-t", f"{tl.total:.3f}", str(base.resolve())], cwd=str(work))
    strip = work / "transitions.mp4"
    tdur = 0.4 if tmode == "subtle" else 0.5
    err = shaders.render_strip(base, tl.transitions, work, strip, dur=tdur)
    if err:
        log(err + " - plain cuts instead")
        return None
    return base, strip, shaders.frame_count(tdur) / FPS


def _transition_chain(base: int, strip: int, picks: List[Tuple[float, str]], td: float) -> str:
    """Lay each piece of the transition strip over the edited picture at its cut."""
    parts = [f"[{strip}:v]split={len(picks)}" + "".join(f"[ts{k}]" for k in range(len(picks)))]
    cur = f"[{base}:v]"
    for k, (j, _) in enumerate(picks):
        t0 = max(0.0, j - td / 2)
        parts.append(f"[ts{k}]trim={k * td:.4f}:{(k + 1) * td:.4f},setpts=PTS-STARTPTS+{t0:.4f}/TB[tt{k}]")
        parts.append(f"{cur}[tt{k}]overlay=0:0:eof_action=pass:enable='between(t,{t0:.4f},{t0 + td - 1e-3:.4f})'[tv{k}]")
        cur = f"[tv{k}]"
    return ";".join(parts) + f";{cur}null[v2]"


def _sound(tl: Timeline, ov: Optional[overlay.Overlay], s: Dict[str, Any],
           has_hook: bool) -> List[Tuple[float, str]]:
    """Where the sound effects land: a whoosh on the hook title, on each zoom
    and mid-transition; a pop on each emoji and stat card; a tap on the
    only when the HyperFrames graphics are on)."""
    if not s["sfx"]:
        return []
    hits = [(0.0, "whoosh")] if has_hook else []
    hits += [(a, "whoosh") for a in tl.plain_zooms]
    hits += [(j + 0.1, "whoosh") for j, _ in tl.transitions]     # the swell peaks mid-transition
    if ov is not None:
        hits += [(t, "pop") for t in ov.pops]
    return hits


def _caption_layer(tl: Timeline, spec: overlay.Spec, s: Dict[str, Any], work: Path,
                   log: Callable[[str], None]) -> Tuple[Optional[overlay.Overlay], Optional[Path]]:
    """The text layer: a HyperFrames render (overlay + its .mov), or None
    and the .ass fallback written into `work` for ffmpeg to burn in."""
    if str(s["renderer"]) != "ass":
        ov = overlay.build(tl.words, tl.total, spec)
        mov = work / "overlay.mov"
        log("Animating captions with HyperFrames")
        err = overlay.render(ov, work, mov, tl.total)
        if not err:
            return ov, mov
        log(err + " - using the built-in caption renderer")
    (work / "fonts").mkdir(exist_ok=True)
    for f in ("Anton.ttf", "Montserrat.ttf"):
        shutil.copy2(config.ASSETS / "fonts" / f, work / "fonts" / f)
    (work / "cap.ass").write_text(subtitles.ass(tl.words, tl.total, spec), encoding="utf-8")
    return None, None


def render(src: Path, clip: Dict[str, Any], words: List[Dict[str, Any]], work: Path,
           out: Path, *, on_progress: Optional[Callable[[float], None]] = None,
           log: Callable[[str], None] = print) -> Dict[str, Any]:
    """Render one clip to `out`. `clip` has start/end/title (and the AI's
    keywords/emojis); settings come from config. Returns what was done."""
    s = config.settings()
    start, end = float(clip["start"]), float(clip["end"])
    dur = end - start
    work.mkdir(parents=True, exist_ok=True)
    prog = on_progress or (lambda p: None)
    has_audio = media.probe(src)["has_audio"]

    plan = clip.get("plan")
    if not plan or plan.get("span") != [start, end] or plan.get("layout") != s["layout"]:
        plan = {**reframe.plan(src, start, end, log=log), "span": [start, end]}
    prog(0.15)

    tmode = str(s["transitions"])
    tl = timeline(clip_words(words, start, end), dur, plan, s,
                  transitions=tmode != "off" and str(s["renderer"]) != "ass" and hyperframes.ready())
    if len(tl.segs) > 1:
        log(f"Cut {dur - tl.total:.1f}s of dead air/fillers ({len(tl.segs) - 1} cuts)")

    inputs = _Inputs()
    src_args = ["-ss", f"{start:.3f}", "-t", f"{dur + 0.1:.3f}", "-i", str(src.resolve())]
    inputs.add(*src_args)
    graph = _video_chain(plan, tl.segs, tl.punch, bool(s["color_polish"]), str(s["look"]))
    if tl.transitions:
        made = _transitions(src_args, graph, tl, tmode, work, log)
        if made:
            base, strip, td = made
            graph = _transition_chain(inputs.add("-i", str(base.resolve())),
                                      inputs.add("-i", str(strip.resolve())), tl.transitions, td)
        else:
            tl.transitions = []

    title = str(clip.get("title") or "")
    spec = overlay.Spec.from_settings(s, clip, seam=tl.split, face_bottom=plan.get("face_bottom"),
                                      flashes=tl.plain_zooms if s["flash"] else [])
    ov, mov = _caption_layer(tl, spec, s, work, log)
    prog(0.55)
    if mov:
        graph += (f";[v2][{inputs.add('-i', str(mov.resolve()))}:v]"
                  "overlay=0:0:eof_action=pass:format=auto,format=yuv420p[vout]")
    else:
        graph += ";[v2]subtitles=cap.ass:fontsdir=fonts,format=yuv420p[vout]"

    maps = ["-map", "[vout]"]
    if has_audio:
        music = pick_music(int(clip.get("n") or 1)) if s["music"] else None
        music_in = None
        if music:
            log(f"Music: {music.name}")
            music_in = inputs.add("-stream_loop", "-1", "-i", str(music.resolve()))
        graph += ";" + _audio_chain(tl.segs) + ";" + _mix_chain(
            _sound(tl, ov, s, bool(s["hook_title"]) and bool(title)), music_in, tl.total,
            float(s["music_volume"]))
        maps += ["-map", "[amix]", "-c:a", "aac", "-b:a", "192k"]
    (work / "graph.txt").write_text(graph, encoding="utf-8")        # for debugging

    media.run([*inputs.args, "-filter_complex", graph, *maps, *media.video_encoder_args(),
               "-r", str(FPS), "-t", f"{tl.total:.3f}", "-movflags", "+faststart",
               # no title/uploader/URL carried over from the source: post it anywhere
               "-map_metadata", "-1", "-map_chapters", "-1",
               str(out.resolve())],
              duration=tl.total, cwd=str(work), on_progress=lambda p: prog(0.55 + 0.45 * p))

    return {"duration": tl.total, "renderer": "hyperframes" if mov else "ass", "plan": plan,
            "cuts": len(tl.segs) - 1, "words": tl.words, "punch": tl.punch, "split": tl.split,
            "transitions": [{"t": j, "shader": n} for j, n in tl.transitions]}
