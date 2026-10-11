"""Speed: things ClipForge keeps instead of doing again for every clip or video."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from clipforge import ai, config, media, pipeline, transcribe  # noqa: E402


def test_probe_is_cached_until_the_file_changes(tmp_path, monkeypatch):
    f = tmp_path / "v.mp4"
    f.write_bytes(b"one")
    calls = []
    monkeypatch.setattr(media, "_probe", lambda p: calls.append(p) or {"duration": 1.0, "has_audio": True})
    media._PROBED.clear()
    assert media.probe(f)["duration"] == 1.0 and media.probe(f)["has_audio"]
    assert len(calls) == 1
    media.probe(f)["duration"] = 99                  # a caller changing its copy doesn't change the cache
    assert media.probe(f)["duration"] == 1.0
    f.write_bytes(b"longer")                          # a new file at the same path is probed again
    media.probe(f)
    assert len(calls) == 2


def test_whisper_model_stays_loaded_between_videos(monkeypatch):
    made = []
    monkeypatch.setattr(transcribe, "_new_model", lambda dev, name: made.append((dev, name)) or object())
    monkeypatch.setattr(config, "get", lambda k, d=None: {"whisper_model": "small"}.get(k, d))
    transcribe._MODELS.clear()
    a, _ = transcribe._load("cpu")
    b, name = transcribe._load("cpu")
    assert a is b and name == "small" and made == [("cpu", "small")]
    monkeypatch.setattr(config, "get", lambda k, d=None: {"whisper_model": "base"}.get(k, d))
    transcribe._load("cpu")                           # another model picked: the old one is let go
    assert list(transcribe._MODELS) == [("cpu", "base")]


def test_ollama_is_asked_to_stay_loaded(monkeypatch):
    sent = {}

    class R:
        status_code = 200
        def raise_for_status(self): pass
        def json(self): return {"message": {"content": "{}"}}

    monkeypatch.setattr(ai.requests, "post", lambda url, json=None, timeout=None: sent.update(json) or R())
    ai._ollama("s", "u", True, 5, "qwen")
    assert sent["keep_alive"] == "15m"


def test_render_temp_folders_are_deleted(tmp_path):
    work = tmp_path / "work" / "3"
    (work / "fonts").mkdir(parents=True)
    (work / "base.mp4").write_bytes(b"x" * 100)
    pipeline._clean_work(work)
    assert not (tmp_path / "work").exists()
    other = tmp_path / "work" / "4"
    other.mkdir(parents=True)
    (tmp_path / "work" / "5").mkdir()
    pipeline._clean_work(other)                       # clip 5 still rendering: work/ stays
    assert (tmp_path / "work" / "5").exists()
