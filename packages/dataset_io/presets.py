"""
Export Presets for Modern Training & Fine-Tuning Frameworks.
Generates tailored directory structures, configurations, and conversation formats for:
1. Unsloth (ShareGPT VLM format + train_unsloth.py)
2. Axolotl (Alpaca/ChatML format + axolotl_config.yml)
3. LLaMA-Factory (Dataset bundle + dataset_info.json registry with SHA-256)
4. Ultralytics YOLO v8/v11 (images/, labels/, classes.txt, data.yaml)

Text MVP contract (docs/STATUS.md §0): every text preset reads the real input text from
``record.metadata["text"]``. ``annotation.payload["text"]`` is only a fallback for
audio_transcription / document_ocr records. Fabricated instruction/response placeholders
are never emitted, and an empty split produces an empty file instead of aliasing train.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any

# Task types whose text content legitimately lives in the annotation payload.
_PAYLOAD_TEXT_TASK_TYPES = frozenset({"audio_transcription", "document_ocr"})
_IMAGE_ROLES = frozenset({"primary_image", "image"})
# Splits that belong in the validation file for the supervised fine-tuning presets.
_VAL_SPLITS = frozenset({"val", "validation", "test"})


def _payload(record: dict[str, Any]) -> dict[str, Any]:
    annotation = record.get("annotation")
    payload = annotation.get("payload") if isinstance(annotation, dict) else None
    return payload if isinstance(payload, dict) else {}


def _record_text(record: dict[str, Any], task_type: str | None) -> str:
    """Canonical input text: ``metadata.text``; payload text only for audio/OCR."""
    metadata = record.get("metadata") or {}
    if isinstance(metadata, dict):
        text = metadata.get("text")
        if isinstance(text, str) and text.strip():
            return text

    if task_type in _PAYLOAD_TEXT_TASK_TYPES:
        text = _payload(record).get("text")
        if isinstance(text, str) and text.strip():
            return text
    return ""


def _record_label(record: dict[str, Any]) -> str:
    """Decided label from ``annotation.payload["label"]`` (legacy keys allowed)."""
    payload = _payload(record)
    for key in ("label", "category"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value
    labels = payload.get("labels")
    if isinstance(labels, list):
        return "|".join(str(item) for item in labels)
    if isinstance(labels, str) and labels.strip():
        return labels
    return ""


def _is_image_asset(asset: dict[str, Any]) -> bool:
    return asset.get("modality") == "image" or str(asset.get("role") or "").strip() in _IMAGE_ROLES


def _select_primary_image(assets: list[Any] | None) -> dict[str, Any]:
    """Resolve the record's primary image asset deterministically (role/modality first)."""
    items = [a for a in (assets or []) if isinstance(a, dict)]
    if not items:
        return {}

    def _sort_key(asset: dict[str, Any]) -> str:
        return str(asset.get("asset_id") or "")

    primary = [
        a
        for a in items
        if str(a.get("role") or "").strip() == "primary_image"
        and (a.get("modality") in (None, "", "image"))
    ]
    if primary:
        return min(primary, key=_sort_key)

    images = [a for a in items if _is_image_asset(a)]
    if images:
        return min(images, key=_sort_key)
    return min(items, key=_sort_key)


def _primary_image_storage_key(record: dict[str, Any]) -> str | None:
    asset = _select_primary_image(record.get("assets") or [])
    if asset and _is_image_asset(asset):
        storage_key = asset.get("storage_key")
        return storage_key if isinstance(storage_key, str) and storage_key else None
    return None


def _encode_jsonl(lines: list[str]) -> bytes:
    """Encode JSON Lines bytes; an empty split yields a genuinely empty (0-byte) file."""
    return ("\n".join(lines) + ("\n" if lines else "")).encode("utf-8")


def export_unsloth_sharegpt_vlm(manifest: dict[str, Any]) -> dict[str, bytes]:
    """
    Export dataset to Unsloth Vision-Language / ShareGPT format.
    Produces train.jsonl, val.jsonl, and an executable train_unsloth.py starter script.
    """
    records = manifest.get("records", [])
    task_type = manifest.get("task_type")
    train_lines: list[str] = []
    val_lines: list[str] = []

    for r in records:
        text = _record_text(r, task_type)
        label = _record_label(r)
        image_ref = _primary_image_storage_key(r)

        # Never fabricate a prompt: a record with neither text nor an image carries no signal.
        if not text and not image_ref:
            continue

        if image_ref and text:
            user_value = f"<image>\n{text}"
        elif image_ref:
            user_value = "<image>"
        else:
            user_value = text

        conversations: list[dict[str, Any]] = [{"from": "human", "value": user_value}]
        if label:
            conversations.append({"from": "gpt", "value": label})

        entry: dict[str, Any] = {
            "id": r.get("record_id", ""),
            "conversations": conversations,
        }
        if image_ref:
            entry["images"] = [image_ref]

        json_line = json.dumps(entry, ensure_ascii=False, sort_keys=True)
        split = r.get("split", "train")
        if split in _VAL_SPLITS:
            val_lines.append(json_line)
        else:
            train_lines.append(json_line)

    train_data = _encode_jsonl(train_lines)
    # E3: an empty val split is an empty file, never a copy of train.
    val_data = _encode_jsonl(val_lines)

    # Executable Unsloth fine-tuning template
    dataset_name = manifest.get("dataset_name", "dataset")
    script = f'''"""
Ready-to-run Unsloth Fine-Tuning Script.
Generated by AI Dataset Engineering Platform.
"""
from unsloth import FastLanguageModel
import torch
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments

max_seq_length = 2048
dtype = None # Auto detection
load_in_4bit = True

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="unsloth/Qwen2.5-Coder-7B-Instruct-bnb-4bit",
    max_seq_length=max_seq_length,
    dtype=dtype,
    load_in_4bit=load_in_4bit,
)

model = FastLanguageModel.get_peft_model(
    model,
    r=16,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=3407,
)

dataset = load_dataset("json", data_files={{"train": "train.jsonl", "validation": "val.jsonl"}})

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset["train"],
    eval_dataset=dataset["validation"],
    dataset_text_field="conversations",
    max_seq_length=max_seq_length,
    dataset_num_proc=2,
    packing=False,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        max_steps=60,
        learning_rate=2e-4,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=1,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="linear",
        seed=3407,
        output_dir="outputs_{dataset_name}",
    ),
)

trainer.train()
model.save_pretrained_merged("finetuned_{dataset_name}_lora", tokenizer, save_method="merged_16bit")
print("Training completed successfully.")
'''.encode()

    return {
        "train.jsonl": train_data,
        "val.jsonl": val_data,
        "train_unsloth.py": script,
    }


def export_axolotl_alpaca_chatml(manifest: dict[str, Any]) -> dict[str, bytes]:
    """
    Export dataset for Axolotl fine-tuning framework (Alpaca schema + axolotl_config.yml).
    """
    records = manifest.get("records", [])
    task_type = manifest.get("task_type")
    data_records: list[dict[str, Any]] = []

    for r in records:
        text = _record_text(r, task_type)
        label = _record_label(r)
        # Honest rows only: no fabricated instruction/output values.
        if not text and not label:
            continue

        data_records.append({
            "instruction": text,
            "input": "",
            "output": label,
        })

    jsonl_bytes = _encode_jsonl(
        [json.dumps(dr, ensure_ascii=False, sort_keys=True) for dr in data_records]
    )

    dataset_name = manifest.get("dataset_name", "dataset")
    axolotl_yaml = f"""# Axolotl Fine-Tuning Configuration
# Auto-generated by AI Dataset Engineering Platform
base_model: meta-llama/Meta-Llama-3-8B-Instruct
model_type: LlamaForCausalLM
tokenizer_type: AutoTokenizer

load_in_8bit: false
load_in_4bit: true
strict: false

datasets:
  - path: dataset.jsonl
    type: alpaca
    shards: 1

dataset_prepared_path: last_run_prepared
val_set_size: 0.1
output_dir: ./outputs_{dataset_name}

adapter: lora
lora_r: 16
lora_alpha: 32
lora_dropout: 0.05
lora_target_linear: true

sequence_len: 4096
sample_packing: true
pad_to_sequence_len: true

gradient_accumulation_steps: 4
micro_batch_size: 2
num_epochs: 3
optimizer: paged_adamw_8bit
lr_scheduler: cosine
learning_rate: 0.0002

train_on_inputs: false
group_by_length: false
bf16: auto
fp16: false
tf32: false

gradient_checkpointing: true
logging_steps: 1
flash_attention: true

warmup_steps: 10
eval_steps: 50
save_steps: 100
""".encode()

    return {
        "dataset.jsonl": jsonl_bytes,
        "axolotl_config.yml": axolotl_yaml,
    }


def export_llama_factory_bundle(manifest: dict[str, Any]) -> dict[str, bytes]:
    """
    Export dataset for LLaMA-Factory with dataset_info.json registry and SHA-256 verification.
    """
    records = manifest.get("records", [])
    task_type = manifest.get("task_type")
    formatted: list[dict[str, Any]] = []

    for r in records:
        text = _record_text(r, task_type)
        label = _record_label(r)
        if not text and not label:
            continue

        formatted.append({
            "instruction": text,
            "input": "",
            "output": label,
            "history": [],
        })

    json_content = json.dumps(formatted, indent=2, ensure_ascii=False).encode("utf-8")
    sha256_hash = hashlib.sha256(json_content).hexdigest()

    dataset_key = manifest.get("dataset_name", "custom_dataset").lower().replace(" ", "_")
    dataset_info = {
        dataset_key: {
            "file_name": f"{dataset_key}.json",
            "file_sha256": sha256_hash,
            "columns": {
                "prompt": "instruction",
                "query": "input",
                "response": "output",
                "history": "history",
            },
        }
    }
    info_bytes = json.dumps(dataset_info, indent=2, ensure_ascii=False).encode("utf-8")

    return {
        f"{dataset_key}.json": json_content,
        "dataset_info.json": info_bytes,
    }


def export_ultralytics_yolo(manifest: dict[str, Any]) -> dict[str, bytes]:
    """
    Export dataset for Ultralytics YOLO (v8 / v9 / v10 / v11).
    Produces classes.txt and canonical data.yaml plus per-record label files.
    """
    records = manifest.get("records", [])
    label_schema = manifest.get("label_schema", {})
    classes: list[str] = label_schema.get("classes") or label_schema.get("labels") or []

    # Collect unique classes from annotations if not explicitly in schema
    class_set: set[str] = set(classes)
    for r in records:
        payload = _payload(r)
        boxes = payload.get("boxes")
        if isinstance(boxes, list):
            for b in boxes:
                if isinstance(b, dict) and "label" in b:
                    class_set.add(b["label"])
    final_classes = sorted(class_set) if class_set else ["object"]
    class_to_idx = {cls_name: i for i, cls_name in enumerate(final_classes)}

    files: dict[str, bytes] = {}
    files["classes.txt"] = ("\n".join(final_classes) + "\n").encode("utf-8")

    for r in records:
        split = r.get("split", "train")
        rec_id = r.get("record_id", "rec")
        payload = _payload(r)
        boxes = payload.get("boxes") if isinstance(payload.get("boxes"), list) else []

        # Retrieve source image dimensions for precise normalization (role-based, not index 0)
        image_asset = _select_primary_image(r.get("assets") or [])
        dims = image_asset.get("dimensions") or {}
        img_dims = payload.get("image_dimensions") if isinstance(payload, dict) else {}
        if not isinstance(img_dims, dict):
            img_dims = {}
        img_w = float(dims.get("width") or img_dims.get("width") or 640)
        img_h = float(dims.get("height") or img_dims.get("height") or 480)
        coord_sys = payload.get("coordinate_system") if isinstance(payload, dict) else None

        # Label lines: <class_idx> <x_center> <y_center> <width> <height>
        yolo_lines: list[str] = []
        for box in boxes:
            if not isinstance(box, dict):
                continue
            cls_name = box.get("label", final_classes[0])
            c_idx = class_to_idx.get(cls_name, 0)

            x = float(box.get("x", 0.0))
            y = float(box.get("y", 0.0))
            w = float(box.get("w", box.get("width", 0.1)))
            h = float(box.get("h", box.get("height", 0.1)))

            # If coordinates are in pixel space, normalize using source image dimensions
            is_pixel = (coord_sys == "pixel-intrinsic") or (
                coord_sys != "normalized" and (x > 1.0 or y > 1.0 or w > 1.0 or h > 1.0)
            )
            if is_pixel:
                norm_x = x / img_w
                norm_y = y / img_h
                norm_w = w / img_w
                norm_h = h / img_h
            else:
                norm_x = x
                norm_y = y
                norm_w = w
                norm_h = h

            # Clamp normalized coordinates to [0, 1]
            norm_x = max(0.0, min(1.0, norm_x))
            norm_y = max(0.0, min(1.0, norm_y))
            norm_w = max(0.0001, min(1.0 - norm_x, norm_w))
            norm_h = max(0.0001, min(1.0 - norm_y, norm_h))

            x_center = min(1.0, max(0.0, norm_x + (norm_w / 2.0)))
            y_center = min(1.0, max(0.0, norm_y + (norm_h / 2.0)))
            yolo_lines.append(f"{c_idx} {x_center:.6f} {y_center:.6f} {norm_w:.6f} {norm_h:.6f}")

        label_content = ("\n".join(yolo_lines) + "\n").encode("utf-8")
        files[f"labels/{split}/{rec_id}.txt"] = label_content

    # data.yaml
    names_dict = {i: name for i, name in enumerate(final_classes)}
    data_yaml = """# Ultralytics YOLO Dataset Configuration
# Auto-generated by AI Dataset Engineering Platform
path: ./
train: images/train
val: images/val
test: images/test

names:
"""
    for idx, name in names_dict.items():
        data_yaml += f"  {idx}: {name}\n"

    files["data.yaml"] = data_yaml.encode("utf-8")
    return files
