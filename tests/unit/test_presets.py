import json

from packages.dataset_io.presets import (
    export_axolotl_alpaca_chatml,
    export_llama_factory_bundle,
    export_ultralytics_yolo,
    export_unsloth_sharegpt_vlm,
)


def _sample_manifest():
    return {
        "dataset_name": "TestVisionNLP",
        "label_schema": {"classes": ["defect", "intact"]},
        "records": [
            {
                "record_id": "rec_001",
                "split": "train",
                "annotation": {
                    "payload": {
                        "text": "Inspect part for cracks",
                        "label": "defect",
                        "boxes": [{"label": "defect", "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}],
                    }
                },
                "assets": [
                    {"asset_id": "ast_1", "role": "primary_image", "storage_key": "images/sample_001.jpg"}
                ],
            },
            {
                "record_id": "rec_002",
                "split": "val",
                "annotation": {
                    "payload": {
                        "text": "Inspect part for rust",
                        "label": "intact",
                        "boxes": [],
                    }
                },
                "assets": [],
            },
        ],
    }


def test_export_unsloth_sharegpt_vlm():
    manifest = _sample_manifest()
    files = export_unsloth_sharegpt_vlm(manifest)
    assert "train.jsonl" in files
    assert "val.jsonl" in files
    assert "train_unsloth.py" in files

    train_lines = files["train.jsonl"].decode("utf-8").strip().split("\n")
    assert len(train_lines) == 1
    item = json.loads(train_lines[0])
    assert item["id"] == "rec_001"
    assert "conversations" in item
    assert item["conversations"][0]["from"] == "human"
    assert "<image>" in item["conversations"][0]["value"]
    assert item["conversations"][1]["from"] == "gpt"
    assert "FastLanguageModel" in files["train_unsloth.py"].decode("utf-8")


def test_export_axolotl_alpaca_chatml():
    manifest = _sample_manifest()
    files = export_axolotl_alpaca_chatml(manifest)
    assert "dataset.jsonl" in files
    assert "axolotl_config.yml" in files

    content = files["dataset.jsonl"].decode("utf-8").strip().split("\n")
    assert len(content) == 2
    row = json.loads(content[0])
    assert "instruction" in row
    assert "output" in row
    assert "base_model" in files["axolotl_config.yml"].decode("utf-8")


def test_export_llama_factory_bundle():
    manifest = _sample_manifest()
    files = export_llama_factory_bundle(manifest)
    assert "testvisionnlp.json" in files
    assert "dataset_info.json" in files

    info = json.loads(files["dataset_info.json"].decode("utf-8"))
    assert "testvisionnlp" in info
    assert "file_sha256" in info["testvisionnlp"]


def test_export_ultralytics_yolo():
    manifest = _sample_manifest()
    files = export_ultralytics_yolo(manifest)
    assert "classes.txt" in files
    assert "data.yaml" in files
    assert "labels/train/rec_001.txt" in files

    classes = files["classes.txt"].decode("utf-8").strip().split("\n")
    assert "defect" in classes
    assert "intact" in classes

    label_line = files["labels/train/rec_001.txt"].decode("utf-8").strip()
    parts = label_line.split()
    assert len(parts) == 5  # class_idx, x_center, y_center, width, height
