"""
Canonical catalogue of dataset types the platform knows about.

One source of truth for the API and the UI: which types exist, which are **available now**, which are
**beta** (engine + workbench exist, guided flow not finished), and which are **planned**. The UI must
never offer a type as working unless its status says so (see docs/MODALITIES.md).

Statuses
--------
* ``available`` — ingestion, editing, validation, versioning and export are all usable today.
* ``beta`` — core engine works and has acceptance tests, but the Simple-Mode flow is incomplete.
* ``planned`` — acknowledged in the roadmap; no UI promise, controls are disabled.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class DatasetTypeInfo:
    id: str
    label: str
    status: str                 # available | beta | planned
    task_type: str | None       # internal TaskType, or None while planned
    can_generate: bool          # can the wizard generate examples for it today?
    can_import: bool
    description: str
    import_hint: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


DATASET_TYPES: tuple[DatasetTypeInfo, ...] = (
    DatasetTypeInfo(
        id="text",
        label="Text",
        status="available",
        task_type="text_classification",
        can_generate=True,
        can_import=True,
        description="Articles, messages, reviews, tickets — one label per text.",
        import_hint="CSV/JSONL/TXT with a text column and optional label column.",
    ),
    DatasetTypeInfo(
        id="image",
        label="Image",
        status="available",
        task_type="image_classification",
        can_generate=True,
        can_import=True,
        description="Photos, scans, product images — one class per image.",
        import_hint="PNG/JPG/WEBP, or a ZIP of images.",
    ),
    DatasetTypeInfo(
        id="object_detection",
        label="Object detection",
        status="beta",
        task_type="object_detection",
        can_generate=True,
        can_import=True,
        description="Images with boxes around objects (defects, parts, labels).",
        import_hint="Images (optionally with COCO/YOLO labels); draw boxes in the workbench.",
    ),
    DatasetTypeInfo(
        id="image_text",
        label="Image + text (captions / VQA)",
        status="beta",
        task_type="paired_image_text",
        can_generate=False,
        can_import=True,
        description="Image–text pairs such as captions or question/answer data.",
        import_hint="ZIP with paired image + text files.",
    ),
    DatasetTypeInfo(
        id="audio",
        label="Audio",
        status="beta",
        task_type="audio_transcription",
        can_generate=False,
        can_import=True,
        description="Speech, sound events, music — timestamped transcription cues.",
        import_hint="WAV (16-bit PCM), with the waveform editor and WebVTT export.",
    ),
    DatasetTypeInfo(
        id="document_ocr",
        label="Document / OCR",
        status="beta",
        task_type="document_ocr",
        can_generate=False,
        can_import=True,
        description="Scanned pages and PDFs with text regions.",
        import_hint="PDF or page images; regions are edited in the workbench.",
    ),
    DatasetTypeInfo(
        id="video",
        label="Video",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Clips, surveillance, action sequences (keyframes + temporal labels).",
    ),
    DatasetTypeInfo(
        id="multimodal",
        label="Multimodal bundles",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Audio+video or text+audio bundles beyond image–text pairs.",
    ),
    DatasetTypeInfo(
        id="tabular",
        label="Tabular",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Structured rows and columns (CSV/Excel) with typed schemas.",
    ),
    DatasetTypeInfo(
        id="time_series",
        label="Time series",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Sensor readings, prices, weather — timestamped numeric series.",
    ),
    DatasetTypeInfo(
        id="geospatial",
        label="Geospatial",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="GPS tracks, satellite maps, geographic coordinates.",
    ),
    DatasetTypeInfo(
        id="three_d",
        label="3D / spatial",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Point clouds, meshes, voxel grids.",
    ),
    DatasetTypeInfo(
        id="motion",
        label="Motion / pose",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Human skeletons, gestures, motion capture.",
    ),
    DatasetTypeInfo(
        id="graph",
        label="Graph",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Social networks, knowledge graphs, molecular graphs.",
    ),
    DatasetTypeInfo(
        id="code",
        label="Code",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Source files, repositories, programming problems.",
    ),
    DatasetTypeInfo(
        id="scientific",
        label="Scientific",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="DNA, protein structures, microscopy, simulations.",
    ),
    DatasetTypeInfo(
        id="medical",
        label="Medical",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="X-rays, MRI, clinical records, ECG (needs de-identification).",
    ),
    DatasetTypeInfo(
        id="sensor_iot",
        label="Sensor / IoT",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Accelerometer, gyroscope, temperature, humidity streams.",
    ),
    DatasetTypeInfo(
        id="neurophysiological",
        label="Neurophysiological",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="EEG, ECG, EMG, PPG, brain signals.",
    ),
    DatasetTypeInfo(
        id="robotics",
        label="Robotics",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Robot trajectories, camera streams, control actions.",
    ),
    DatasetTypeInfo(
        id="transactional",
        label="Transactional",
        status="planned",
        task_type=None,
        can_generate=False,
        can_import=False,
        description="Purchases, banking transactions, clickstream events.",
    ),
)

_BY_ID = {info.id: info for info in DATASET_TYPES}
_BY_TASK = {info.task_type: info for info in DATASET_TYPES if info.task_type}


def list_dataset_types() -> list[dict[str, Any]]:
    return [info.to_dict() for info in DATASET_TYPES]


def get_dataset_type(identifier: str) -> DatasetTypeInfo | None:
    return _BY_ID.get(identifier) or _BY_TASK.get(identifier)


def available_dataset_types() -> list[dict[str, Any]]:
    """Types the UI may offer for a new dataset (available + beta)."""
    return [info.to_dict() for info in DATASET_TYPES if info.status in {"available", "beta"}]
