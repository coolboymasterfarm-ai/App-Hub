"""Turning a wide shot into a vertical one that follows the person talking.

For each clip: sample frames at ~8 fps, find the camera cuts, detect faces
(YuNet, with OpenCV's Haar cascade as a fallback), and pick the face that is
speaking - the one whose mouth region moves the most, with hysteresis so the
crop does not flick between people. Inside one camera shot the crop holds
still unless the speaker really moves (a locked-off frame is what a human
editor does); when they move it glides. At a camera cut it jumps with the cut.

The result is a list of (time, x) keyframes for the crop's left edge.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from . import config, media

SAMPLE_FPS = 8.0
DET_W = 640

Keys = List[Tuple[float, float]]


def crop_width(w: int, h: int) -> int:
    cw = int(round(h * 9 / 16))
    return min(w, cw - cw % 2)


def _frames(src: Path, start: float, dur: float, w: int, h: int):
    """Downscaled BGR frames at SAMPLE_FPS, decoded by ffmpeg (every codec,
    multithreaded, fast seek)."""
    dh = int(round(h * DET_W / w / 2)) * 2
    cmd = [config.ffmpeg(), "-v", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}",
           "-i", str(src), "-an", "-vf", f"fps={SAMPLE_FPS},scale={DET_W}:{dh}",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                         creationflags=config.NOWIN)
    size = DET_W * dh * 3
    k = 0
    try:
        while True:
            buf = p.stdout.read(size)
            if len(buf) < size:
                break
            yield k / SAMPLE_FPS, np.frombuffer(buf, np.uint8).reshape(dh, DET_W, 3)
            k += 1
    finally:
        p.stdout.close()
        p.wait()


def _frontal(f) -> float:
    """0..1: how squarely the face looks at the camera, from YuNet's
    landmarks - eyes level and wide apart, nose between them, confident."""
    rex, rey, lex, ley, nx = f[4], f[5], f[6], f[7], f[8]
    fw = max(1.0, float(f[2]))
    eyes = abs(lex - rex) / fw                      # ~0.4 when frontal
    tilt = abs(ley - rey) / fw
    mid = (lex + rex) / 2
    nose = 1 - min(1.0, abs(nx - mid) / max(1.0, abs(lex - rex)))
    return float(max(0.0, min(1.0, eyes * 2.5)) * nose * max(0.0, 1 - tilt * 3) * float(f[14]))


class _Detector:
    def __init__(self, w: int, h: int):
        import cv2
        self.cv2 = cv2
        self.yunet = None
        model = config.ASSETS / "models" / "face_detection_yunet_2023mar.onnx"
        try:
            self.yunet = cv2.FaceDetectorYN.create(str(model), "", (w, h), 0.6, 0.3, 50)
        except Exception:
            self.haar = cv2.CascadeClassifier(cv2.data.haarcascades +
                                              "haarcascade_frontalface_default.xml")

    def __call__(self, img) -> List[Tuple[float, float, float, float]]:
        if self.yunet is not None:
            _, faces = self.yunet.detect(img)
            if faces is None:
                return []
            return [tuple(map(float, f[:4])) + (_frontal(f),) for f in faces]
        g = self.cv2.cvtColor(img, self.cv2.COLOR_BGR2GRAY)
        return [tuple(map(float, f)) + (0.5,) for f in
                self.haar.detectMultiScale(g, 1.1, 6, minSize=(img.shape[1] // 20,) * 2)]


def analyse(src: Path, start: float, end: float, w: int, h: int) -> List[Dict[str, Any]]:
    """One record per sampled frame: time, whether a cut happened, and the
    faces (centre x, size, mouth movement), all in detection-frame pixels."""
    import cv2
    det = None
    prev_hist = prev_gray = None
    out: List[Dict[str, Any]] = []
    for t, img in _frames(src, start, end - start, w, h):
        if det is None:
            det = _Detector(img.shape[1], img.shape[0])
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1], None, [32, 32], [0, 180, 0, 256])
        cv2.normalize(hist, hist)
        cut = prev_hist is not None and cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL) < 0.55
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = []
        for (x, y, fw, fh, front) in det(img):
            if fw < img.shape[1] * 0.035:           # background faces, posters
                continue
            mouth = 0.0
            if prev_gray is not None and not cut:
                y0, y1 = int(y + fh * 0.62), int(y + fh * 1.0)
                x0, x1 = int(x + fw * 0.2), int(x + fw * 0.8)
                a = gray[max(0, y0):max(0, y1), max(0, x0):max(0, x1)]
                b = prev_gray[max(0, y0):max(0, y1), max(0, x0):max(0, x1)]
                if a.size:
                    mouth = float(np.mean(cv2.absdiff(a, b))) / max(1.0, fh / 40)
            faces.append({"cx": x + fw / 2, "cy": y + fh / 2, "size": fw, "mouth": mouth, "front": front,
                          "bot": (y + fh * 0.85) / img.shape[0]})   # ~the chin (the box runs past it)
        out.append({"t": t, "cut": cut, "faces": faces})
        prev_hist, prev_gray = hist, gray
    return out


def _shots(samples: List[Dict[str, Any]]) -> List[List[int]]:
    shots, cur = [], []
    for i, s in enumerate(samples):
        if s["cut"] and cur:
            shots.append(cur)
            cur = []
        cur.append(i)
    if cur:
        shots.append(cur)
    return shots


def _track(samples, idx: List[int]) -> List[Optional[float]]:
    """The speaker's centre x in one shot. Faces are grouped into people by
    position; the talker is the one with the most mouth movement over the
    last ~1.5 s, and it takes a clear lead to switch to someone else."""
    people: List[Dict[str, Any]] = []            # {"cx", "energy"}
    target: Optional[int] = None
    hold = 0
    xs: List[Optional[float]] = []
    for i in idx:
        faces = samples[i]["faces"]
        seen = set()
        for f in faces:
            match = min(people, key=lambda p: abs(p["cx"] - f["cx"]), default=None)
            if match is not None and abs(match["cx"] - f["cx"]) < f["size"] * 1.2 \
                    and id(match) not in seen:
                match["cx"] = 0.6 * match["cx"] + 0.4 * f["cx"]
                match["energy"] = 0.85 * match["energy"] + 0.15 * f["mouth"]
                match["size"] = f["size"]
                match["seen"] = i
                seen.add(id(match))
            else:
                people.append({"cx": f["cx"], "energy": f["mouth"], "size": f["size"], "seen": i})
                seen.add(id(people[-1]))
        live = [k for k, p in enumerate(people) if i - p["seen"] <= SAMPLE_FPS * 1.5]
        if not live:
            xs.append(None)
            continue
        best = max(live, key=lambda k: people[k]["energy"] + people[k]["size"] * 0.002)
        if target not in live:
            target, hold = best, 0
        elif best != target and people[best]["energy"] > people[target]["energy"] * 1.6 + 0.3:
            hold += 1
            if hold >= SAMPLE_FPS * 0.8:         # the lead has to last ~0.8 s
                target, hold = best, 0
        else:
            hold = 0
        xs.append(people[target]["cx"])
    return xs


def _rdp(pts: List[Tuple[float, float]], eps: float) -> List[Tuple[float, float]]:
    if len(pts) < 3:
        return pts
    (t0, x0), (t1, x1) = pts[0], pts[-1]
    best, far = -1.0, 0
    for k in range(1, len(pts) - 1):
        t, x = pts[k]
        lin = x0 + (x1 - x0) * (t - t0) / max(1e-9, t1 - t0)
        if abs(x - lin) > best:
            best, far = abs(x - lin), k
    if best <= eps:
        return [pts[0], pts[-1]]
    return _rdp(pts[:far + 1], eps)[:-1] + _rdp(pts[far:], eps)


def path(samples: List[Dict[str, Any]], w: int, h: int, dur: float) -> Keys:
    """Crop keyframes (clip time, left edge in source pixels)."""
    cw = crop_width(w, h)
    scale = w / DET_W
    max_x = w - cw
    if max_x <= 0:
        return [(0.0, 0.0)]
    centre = max_x / 2
    keys: Keys = []
    last = centre
    for shot in _shots(samples):
        xs = _track(samples, shot)
        ts = [samples[i]["t"] for i in shot]
        known = [x for x in xs if x is not None]
        if not known:
            vals = [last] * len(xs)
        else:
            # gaps (a missed detection) hold the previous position
            fill, vals = known[0], []
            for x in xs:
                fill = x if x is not None else fill
                vals.append(min(max_x, max(0.0, fill * scale - cw / 2)))
        arr = np.array(vals, dtype=float)
        if arr.max() - arr.min() < w * 0.06:
            arr[:] = float(np.median(arr))               # hold still
        elif len(arr) > 4:
            k = int(SAMPLE_FPS * 0.9) | 1                # ~1 s smoothing, a glide not a jitter
            pad = np.pad(arr, k // 2, mode="edge")
            arr = np.convolve(pad, np.ones(k) / k, mode="valid")
        t0 = ts[0] if keys else 0.0
        pts = [(t0, float(arr[0]))] + [(t, float(x)) for t, x in zip(ts[1:], arr[1:])]
        if len(shot) and shot[-1] == len(samples) - 1:
            pts.append((dur, float(arr[-1])))
        else:
            pts.append((samples[shot[-1] + 1]["t"] - 0.01, float(arr[-1])))
        keys += _rdp(pts, max(4.0, w * 0.006))
        last = float(arr[-1])
    # keep the ffmpeg expression small; loosen the fit until it is
    eps = max(4.0, w * 0.006)
    while len(keys) > 80:
        eps *= 1.5
        keys = _rdp(keys, eps)
    return [(round(t, 3), round(min(max_x, max(0.0, x)), 1)) for t, x in keys]


def _shot_spans(samples, dur: float) -> List[Tuple[List[int], float, float]]:
    shots = _shots(samples)
    out = []
    for k, sh in enumerate(shots):
        t0 = 0.0 if k == 0 else samples[sh[0]]["t"]
        t1 = dur if k == len(shots) - 1 else samples[shots[k + 1][0]]["t"]
        out.append((sh, t0, t1))
    return out


def split_plan(samples: List[Dict[str, Any]], w: int, h: int, dur: float) -> Optional[Dict[str, Any]]:
    """Two people in one wide shot, too far apart for one 9:16 crop: stack
    them, left person on top, right person below - the podcast layout.
    Returns None when no shot needs it."""
    scale = w / DET_W
    cw = crop_width(w, h)
    shots = []
    for idx, t0, t1 in _shot_spans(samples, dur):
        if t1 - t0 < 1.5:
            continue
        pairs = []
        for i in idx:
            fs = sorted(samples[i]["faces"], key=lambda f: -f["size"])[:2]
            if len(fs) == 2 and fs[1]["size"] > fs[0]["size"] * 0.45:
                a, b = sorted(fs, key=lambda f: f["cx"])
                if (b["cx"] - a["cx"]) * scale > cw * 0.8:
                    pairs.append((a, b))
        if len(pairs) >= max(3, 0.6 * len(idx)):
            med = lambda vals: float(np.median(vals)) * scale          # noqa: E731
            shots.append({"t0": t0, "t1": t1,
                          "a": (med([p[0]["cx"] for p in pairs]), med([p[0]["cy"] for p in pairs])),
                          "b": (med([p[1]["cx"] for p in pairs]), med([p[1]["cy"] for p in pairs])),
                          "size": med([p[0]["size"] for p in pairs] + [p[1]["size"] for p in pairs])})
    if not shots:
        return None
    # one panel size for the whole clip (ffmpeg's crop size is fixed): the
    # face fills about a third of the panel height, panels are 9:8
    size = float(np.median([s["size"] for s in shots]))
    ph = min(h, max(h * 0.42, size * 3.0))
    pw = ph * 9 / 8
    if pw > w / 2:
        pw = w / 2
        ph = pw * 8 / 9
    pw, ph = int(pw) // 2 * 2, int(ph) // 2 * 2

    def keys(side: str, axis: int) -> Keys:
        out: Keys = []
        for sh in shots:
            c = sh[side][axis]
            # the lower face sits a little lower, clear of the captions on the seam
            v = (c - pw / 2) if axis == 0 else (c - ph * (0.42 if side == "a" else 0.55))
            v = min(max(0.0, v), (w - pw) if axis == 0 else (h - ph))
            out += [(round(sh["t0"], 3), round(v, 1)), (round(sh["t1"] - 0.01, 3), round(v, 1))]
        return out

    return {"pw": pw, "ph": ph, "windows": [[round(s["t0"], 3), round(s["t1"], 3)] for s in shots],
            "top": [keys("a", 0), keys("a", 1)], "bot": [keys("b", 0), keys("b", 1)]}


def crop_expr(keys: Keys) -> str:
    """ffmpeg expression for x(t): piecewise-linear through the keyframes."""
    if len(keys) == 1:
        return f"{keys[0][1]:.1f}"
    expr = f"{keys[-1][1]:.1f}"
    for (t0, x0), (t1, x1) in reversed(list(zip(keys, keys[1:]))):
        if t1 - t0 < 1e-3 or abs(x1 - x0) < 0.5:
            seg = f"{x0:.1f}"
        else:
            seg = f"{x0:.1f}+({x1 - x0:.1f})*(t-{t0:.3f})/{t1 - t0:.3f}"
        expr = f"if(lt(t,{t1:.3f}),{seg},{expr})"
    return expr


def plan(src: Path, start: float, end: float, *, log=print) -> Dict[str, Any]:
    layout = str(config.get("layout") or "auto")
    info = media.probe(src)
    w, h = info["width"], info["height"]
    cw = crop_width(w, h)
    fit = w <= cw or w / max(1, h) < 0.8
    samples = analyse(src, start, end, w, h)
    if fit:
        hh = 1080 * h / w                                 # the picture's height on the 1920 frame
        return {"mode": "fit", "w": w, "h": h, "cw": w, "keys": [(0.0, 0.0)], "layout": layout,
                "face_bottom": face_bottom(samples, lambda f: (1920 - hh) / 2 + f * hh),
                "cover_t": cover_time(samples)}
    found = sum(1 for s in samples if s["faces"])
    keys = path(samples, w, h, end - start)
    cuts = sum(1 for s in samples if s["cut"])
    log(f"Reframe: faces in {found}/{len(samples)} frames, {cuts} camera cuts, "
        f"{len(keys)} crop keyframes")
    split = split_plan(samples, w, h, end - start) if layout == "auto" else None
    if split:
        log(f"Split screen for {len(split['windows'])} two-person shot(s)")
    return {"mode": "crop", "w": w, "h": h, "cw": cw, "keys": keys, "split": split,
            "layout": layout, "face_ratio": found / max(1, len(samples)),
            "face_bottom": face_bottom(samples, lambda f: f * 1920), "cover_t": cover_time(samples)}


def cover_time(samples: List[Dict[str, Any]]) -> Optional[float]:
    """The best moment for a thumbnail: the biggest, clearest face (a face
    turned away or looking down detects smaller), away from camera cuts."""
    best, t = 0.0, None
    for k, s in enumerate(samples):
        if not s["faces"] or s["cut"] or (k + 1 < len(samples) and samples[k + 1]["cut"]):
            continue
        f = max(s["faces"], key=lambda f: f["size"])
        score = f["size"] * (0.2 + f.get("front", 0.5)) - 0.5 * f["mouth"]   # facing us, mouth still
        if score > best:
            best, t = score, s["t"]
    return t


def face_bottom(samples: List[Dict[str, Any]], to_out) -> Optional[float]:
    """Where the chin of the main face usually sits on the finished 1920px
    frame (80th percentile, so a lean forward still counts). None: no faces."""
    ys = [to_out(max(s["faces"], key=lambda f: f["size"])["bot"]) for s in samples if s["faces"]]
    return round(float(np.percentile(ys, 80)), 1) if len(ys) >= 3 else None


if __name__ == "__main__":
    ks = [(0.0, 100.0), (2.0, 300.0), (5.0, 300.0)]
    e = crop_expr(ks)
    f = lambda t: eval(e.replace("if(", "_if(").replace("lt(", "_lt("),  # noqa: E731
                       {"_if": lambda c, a, b: a if c else b, "_lt": lambda a, b: a < b, "t": t})
    assert abs(f(1.0) - 200) < 1e-6 and f(3) == 300 and f(9) == 300, e
    assert _rdp([(0, 0), (1, 1), (2, 2), (3, 10)], 0.5) == [(0, 0), (2, 2), (3, 10)]
    print("ok", e)
