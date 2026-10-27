"""
Unit tests for MultiModalBundler (stem auto-pairing and manifest parsing).
"""
import json

from packages.dataset_io.bundler import MultiModalBundler


def test_bundle_by_stem():
    files = {
        "images/sample_01.jpg": b"\xff\xd8\xff\xe0...fake_jpg",
        "transcripts/sample_01.txt": b"A photo of a golden retriever.",
        "audio/sample_01.wav": b"RIFF...fake_wav",
        "images/sample_02.png": b"\x89PNG...fake_png",
    }

    candidates = MultiModalBundler.bundle_from_entries(files, default_split="train")
    # Should bundle sample_01 into 1 candidate with 3 assets, and sample_02 into 1 candidate with 1 asset
    assert len(candidates) == 2

    c1 = next(c for c in candidates if c.stem == "sample_01")
    assert len(c1.assets) == 3
    modalities = {a.modality for a in c1.assets}
    assert modalities == {"image", "text", "audio"}

    c2 = next(c for c in candidates if c.stem == "sample_02")
    assert len(c2.assets) == 1
    assert c2.assets[0].modality == "image"


def test_bundle_from_manifest():
    manifest_lines = [
        json.dumps({"id": "rec_001", "split": "train", "label": "positive", "files": ["img1.jpg", "caption1.txt"]}),
        json.dumps({"id": "rec_002", "split": "test", "label": "negative", "files": ["img2.jpg"]}),
    ]
    files = {
        "manifest.jsonl": "\n".join(manifest_lines).encode("utf-8"),
        "img1.jpg": b"fake_img1",
        "caption1.txt": b"positive text",
        "img2.jpg": b"fake_img2",
    }

    candidates = MultiModalBundler.bundle_from_entries(files)
    assert len(candidates) == 2

    r1 = next(c for c in candidates if c.stem == "rec_001")
    assert r1.split == "train"
    assert r1.label == "positive"
    assert len(r1.assets) == 2

    r2 = next(c for c in candidates if c.stem == "rec_002")
    assert r2.split == "test"
    assert r2.label == "negative"
    assert len(r2.assets) == 1
