"""Offline checks: python -m pytest tests  (or python tests/test_core.py)."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from clipforge import ai, captions, edit, highlights, overlay, reframe, subtitles  # noqa: E402


def _words(n=400):
    import random
    random.seed(1)
    out, t = [], 0.0
    for k in range(n):
        w = random.choice(["the", "money", "why", "never", "we", "went", "um", "crazy"])
        if k % 9 == 8:
            w += "."
        out.append({"w": w, "s": round(t, 3), "e": round(t + 0.3, 3)})
        t += 0.38 + (1.2 if k % 23 == 0 else 0)
    return out


def test_segments_frame_aligned_and_words_inside():
    ws = edit.clip_words(_words(), 10, 50)
    segs = edit.keep_segments(ws, 40, silence=True, fillers=True)
    assert len(segs) > 1
    for a, b in segs:
        assert abs(a * 30 - round(a * 30) - 0.5) < 1e-6 or abs(a * 30 - round(a * 30) + 0.5) < 1e-6
        assert abs((b - a) * 30 - round((b - a) * 30)) < 1e-6
    total = sum(b - a for a, b in segs)
    ow = edit.out_words(ws, segs)
    assert ow and all(0 <= w["s"] < w["e"] <= total + 0.01 for w in ow)
    assert not any(w["w"] == "um" for w in ow)


def test_highlights_no_ai():
    ai.status = lambda fresh=False: {"provider": "none"}
    res = highlights.find(_words(), [], count=3, log=lambda m: None)
    assert 1 <= len(res) <= 3 and all(r["title"] for r in res)


def test_ai_json_parsing():
    assert ai.parse_json('<think>x</think>```json\n{"clips":[{"id":1,}]}\n```') == {"clips": [{"id": 1}]}


def test_crop_expr_and_captions():
    e = reframe.crop_expr([(0.0, 10.0), (1.0, 20.0)])
    assert e.startswith("if(lt(t,1.000)")
    ws = [{"w": "Hello", "s": 0.1, "e": 0.4}, {"w": "world.", "s": 0.5, "e": 0.9}]
    html = overlay.build(ws, 2.0, overlay.Spec(title="Test title")).html
    assert 'window.__timelines["cf"]' in html and "Test title" in html
    assert "Dialogue" in subtitles.ass(ws, 2.0, overlay.Spec(title="T"))
    assert captions.srt(ws).startswith("1\n00:00:00,050 --> ")



def test_sound_and_emoji():
    g = edit._mix_chain([(0.0, "whoosh"), (2.0, "pop")], 2, 20.0, 0.14)
    assert "sidechaincompress" in g and g.count("adelay") == 2 and g.endswith("[amix]")
    assert edit._mix_chain([], None, 5.0, 0.1) == "[aout]anull[vx];[vx]anull[amix]"
    ws = [{"w": "so", "s": 0.0, "e": 0.2}, {"w": "much", "s": 0.3, "e": 0.5}, {"w": "money.", "s": 0.6, "e": 1.0}]
    assert list(captions.emoji_marks(ws, captions.paginate(ws)).values()) == ["💰"]
    assert edit._out_windows([(1.0, 3.0)], [(0.0, 2.0), (2.5, 4.0)]) == [(1.0, 2.0), (2.0, 2.5)]



def test_every_caption_style_and_motion_graphics():
    ws = [{"w": w, "s": i * .4, "e": i * .4 + .3} for i, w in
          enumerate("He made $10,000 in 30 days posting crazy clips every day.".split())]
    from clipforge import styles
    for st in styles.STYLES:
        ov = overlay.build(ws, 10, overlay.Spec(title="T", style=st, motion=True, flashes=(2,),
                                                hook_style="slam"))
        assert 'window.__timelines["cf"]' in ov.html and "getTotalLength" not in ov.html, st
        assert ov.pops, st                               # the sound design hears what is drawn
        # nothing on screen may name the app, a channel or ask for a follow
        assert not re.search(r"clipforge|follow|subscribe|channel", ov.html, re.I), st
    m = captions.number_marks(ws, gap=0)
    assert [(x["prefix"], x["val"], x["label"]) for x in m] == [("$", 10000.0, ""), ("", 30.0, "days")]



def test_shader_transitions():
    from clipforge import shaders
    assert len(shaders.GLSL) == 14 and set(shaders.SUBTLE) <= set(shaders.GLSL)
    p = shaders.pick([2, 4, 6.5, 9, 12, 15, 19, 22], 25, mode="bold")
    assert all(3.4 <= t <= 22.2 for t, _ in p) and all(b[0] - a[0] >= 5 for a, b in zip(p, p[1:]))
    assert shaders.pick([5, 10], 20, mode="off") == []
    assert shaders.pick([5, 10], 20, mode="subtle", avoid=((4.0, 6.0),)) == [(10, "cinematic-zoom")]
    h = shaders.composition([(0, "glitch"), (1, "whip-pan")], 0.4, 12)
    assert 'window.__timelines["cf"]' in h and "t1_11.jpg" in h



def test_timeline_and_no_sound_without_a_card():
    ws = [{"w": w, "s": i * .4, "e": i * .4 + .3} for i, w in enumerate("it cost $50,000".split())]
    ov = overlay.build(ws, ws[-1]["s"] + .5, overlay.Spec(motion=True))
    assert 'id="st0"' not in ov.html and ov.pops == []   # no room for the card: no pop either
    cw = [{"w": w, "s": round(i * .5 + (2 if i > 6 else 0), 3), "e": round(i * .5 + .3 + (2 if i > 6 else 0), 3)}
          for i, w in enumerate("one two three. four five six seven eight nine ten eleven twelve".split())]
    s = {"remove_silence": True, "remove_fillers": True, "punch_in": True, "transitions": "bold",
         "transition_style": "auto"}
    tl = edit.timeline(cw, 9.0, {"split": None}, s, transitions=True)
    assert tl.joins and tl.total < 9.0 and all(a < b for a, b in tl.segs)
    assert not set(tl.plain_zooms) & {j for j, _ in tl.transitions}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
