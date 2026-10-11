"""API checks for hand-made clips and the local-only guard.
Run: python -m pytest tests   (needs pytest and httpx)"""
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from clipforge import config, pipeline  # noqa: E402


@pytest.fixture()
def project(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "PROJECTS", tmp_path)
    p = pipeline.create("path", "x.mp4", "Talk")
    p.update(status="done", source={"path": str(tmp_path / "source.mp4"), "duration": 600.0, "title": "Talk"})
    p["clips"] = [{"n": 1, "start": 0, "end": 30, "title": "AI pick", "score": 80, "state": "done",
                   "file": "clips/clip01_v1.mp4", "thumb": None, "srt": None, "cover": None}]
    pipeline.save(p)
    words = [{"w": f"word{i}.", "s": i * 0.5, "e": i * 0.5 + 0.4} for i in range(200)]
    (tmp_path / p["id"] / "transcript.json").write_text(json.dumps({"words": words}))
    (tmp_path / p["id"] / "clips").mkdir()
    (tmp_path / p["id"] / "clips" / "clip01_v1.mp4").write_bytes(b"x")
    return p["id"]


def test_new_and_make_clip(project, monkeypatch):
    c = pipeline.new_clip(project, 10, 20, "")
    assert c["score"] is None and c["source"] == "manual" and c["state"] == "queued"
    assert c["title"] and c["text"].startswith("word20.")
    assert pipeline.new_clip(project, 30, 40, "  Mine  ")["title"] == "Mine"
    with pytest.raises(ValueError, match="3 seconds"):
        pipeline.new_clip(project, 10, 11)
    with pytest.raises(ValueError, match="3 minutes"):
        pipeline.new_clip(project, 0, 200)
    assert len(pipeline.load(project)["clips"]) == 1          # checking a clip saves nothing
    monkeypatch.setattr(pipeline, "rerender", lambda jid, pid, n, patch: {"clip": n})
    assert pipeline.make_clip("j", project, c) == {"clip": 2}
    assert [x["n"] for x in pipeline.load(project)["clips"]] == [1, 2]


def test_delete_clip(project):
    pipeline.delete_clip(project, 1)
    assert pipeline.load(project)["clips"] == []
    assert not (config.PROJECTS / project / "clips" / "clip01_v1.mp4").exists()
    with pytest.raises(KeyError):
        pipeline.delete_clip(project, 1)


def test_api_and_local_only_guard(project):
    from fastapi.testclient import TestClient
    from clipforge import server
    web = TestClient(server.app, base_url="http://127.0.0.1:8765")
    assert web.get(f"/api/projects/{project}/transcript").json()["words"][0]["w"] == "word0."
    assert web.post(f"/api/projects/{project}/clips", json={"start": "x", "end": 5}).status_code == 400
    assert web.post(f"/api/projects/{project}/clips", json={"start": 1, "end": 2}).status_code == 400
    assert web.delete(f"/api/projects/{project}/clips/9").status_code == 404
    assert web.delete(f"/api/projects/{project}/clips/1").json() == {"ok": True}
    # another website (Origin) or a rebinding hostname (Host) is refused
    assert web.post("/api/music/open", headers={"Origin": "https://evil.example"}).status_code == 403
    assert TestClient(server.app, base_url="http://evil.example").get("/api/projects").status_code == 403
    assert web.get("/api/projects", headers={"Origin": "http://127.0.0.1:8765"}).status_code == 200


def test_listing_reads_only_changed_projects(project, monkeypatch):
    assert [p["id"] for p in pipeline.listing()] == [project]
    reads = []
    real = Path.read_text
    monkeypatch.setattr(Path, "read_text", lambda self, *a, **k: reads.append(self.name) or real(self, *a, **k))
    assert pipeline.listing()[0]["title"] == "Talk" and reads == []   # nothing changed: served from the cache
    p = pipeline.load(project)
    p["title"] = "Renamed"
    pipeline.save(p)
    reads.clear()
    assert pipeline.listing()[0]["title"] == "Renamed" and reads == ["project.json"]
    pipeline.delete(project)
    assert pipeline.listing() == []
