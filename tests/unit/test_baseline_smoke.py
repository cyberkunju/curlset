"""
Phase 0 Baseline Smoke Test

Verifies Python runtime environment, synthetic fixture readability,
and basic offline functionality without external network dependencies.
"""
import json
from pathlib import Path


def test_baseline_environment():
    import fastapi
    import PIL
    import pydantic
    import sqlalchemy
    assert fastapi.__version__ is not None
    assert pydantic.__version__ is not None
    assert sqlalchemy.__version__ is not None
    assert PIL.__version__ is not None


def test_synthetic_fixture_manifest():
    manifest_path = Path(__file__).resolve().parent.parent.parent / "examples" / "fixtures" / "sample_manifest.json"
    assert manifest_path.exists(), f"Expected manifest file at {manifest_path}"
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data["fixture_version"] == "1.0"
    assert len(data["samples"]) == 2
    assert data["samples"][0]["task"] == "image_classification"
    assert data["samples"][1]["task"] == "text_classification"
