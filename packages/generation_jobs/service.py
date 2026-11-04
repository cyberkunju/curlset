"""
Generation job orchestration: plan drafting, background execution, live progress and honest ETA.

Why a job layer at all: generation takes minutes, so the UI needs progress and a cancel button —
and the user asked for an *accurate* time estimate. We refuse to hard-code times:
the ETA is `remaining_items × rolling average seconds/item` measured from this very job. Before
enough items complete it reports "estimating" instead of inventing a number.

The job wraps the existing all-or-nothing pipeline by proxying the generator: each generated item
bumps progress, then `run_generation` applies the diversity gate, label-preservation verification and
persistence exactly as in the synchronous path.
"""
from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import TaskType
from packages.dataset_core.dataset_types import DATASET_TYPES, get_dataset_type
from packages.dataset_core.db.models import (
    DatasetModel,
    GenerationJobModel,
    ProjectModel,
)
from packages.dataset_core.db.session import get_db_session
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_synthesis.generation_pipeline import (
    GenerationSpec,
    run_generation,
)
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderError,
    ProviderRequest,
)

#: Rolling window used for the throughput estimate.
ETA_WINDOW = 20
#: Minimum completed items before an ETA is shown at all (honesty over false precision).
ETA_MIN_SAMPLES = 5

_ACTIVE_LOCK = threading.Lock()
_ACTIVE: dict[str, threading.Thread] = {}


# --------------------------------------------------------------------- planning ---

@dataclass
class PlanQuestion:
    """One plain-language question shown in Simple Mode."""

    id: str
    question: str
    kind: str            # "count" | "classes" | "difficulty"
    default: Any
    options: list[Any] = field(default_factory=list)
    example: str = ""
    help: str = ""


@dataclass
class GenerationPlan:
    title: str
    task_type: str
    summary: str
    classes: list[str]
    suggested_total: int
    difficulty: str
    questions: list[PlanQuestion] = field(default_factory=list)
    detected_from_sample: bool = False
    notes: list[str] = field(default_factory=list)
    #: detected dataset type (catalogue id), its status, and whether the UI must ask the user
    dataset_type: str = "text"
    dataset_type_label: str = "Text"
    dataset_type_status: str = "available"
    dataset_type_confidence: float = 0.0
    dataset_type_alternatives: list[dict[str, str]] = field(default_factory=list)
    needs_type_choice: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "title": self.title,
            "task_type": self.task_type,
            "summary": self.summary,
            "classes": self.classes,
            "suggested_total": self.suggested_total,
            "per_class": max(1, self.suggested_total // max(1, len(self.classes))),
            "difficulty": self.difficulty,
            "detected_from_sample": self.detected_from_sample,
            "notes": self.notes,
            "dataset_type": self.dataset_type,
            "dataset_type_label": self.dataset_type_label,
            "dataset_type_status": self.dataset_type_status,
            "dataset_type_confidence": round(self.dataset_type_confidence, 3),
            "dataset_type_alternatives": self.dataset_type_alternatives,
            "needs_type_choice": self.needs_type_choice,
            "questions": [
                {
                    "id": question.id,
                    "question": question.question,
                    "kind": question.kind,
                    "default": question.default,
                    "options": question.options,
                    "example": question.example,
                    "help": question.help,
                }
                for question in self.questions
            ],
        }


_COUNT_RE = re.compile(r"\b(\d{1,5})\s*(?:examples?|rows?|samples?|items?|records?)?\b", re.IGNORECASE)
_CLASS_HINTS = ("correct", "incorrect", "grammar", "positive", "negative", "neutral", "spam", "ham",
                "intent", "billing", "technical", "feature", "general")

#: When only one half of a familiar pair is mentioned, suggest both.
_CLASS_PARTNERS: dict[str, str] = {
    "spam": "ham",
    "ham": "spam",
    "positive": "negative",
    "negative": "positive",
    "correct": "incorrect",
    "incorrect": "correct",
}
#: Weighted phrases per catalogue dataset type. Multi-word phrases score higher because they are
#: more specific ("bounding box" beats a bare "image"). This is deliberately deterministic: the plan
#: is a draft the user confirms, never a silent decision.
_DATASET_LEXICON: dict[str, tuple[tuple[str, float], ...]] = {
    "text": (
        ("text", 1.0), ("sentence", 1.0), ("review", 1.0), ("ticket", 1.0), ("email", 1.0),
        ("message", 0.8), ("comment", 1.0), ("article", 1.0), ("sentiment", 1.5),
        ("intent", 1.5), ("grammar", 1.5), ("spam", 1.5), ("tweet", 1.0), ("transcript text", 1.0),
        ("labelled by topic", 1.5), ("classification", 1.0),
    ),
    "image": (
        ("image", 1.5), ("photo", 1.5), ("picture", 1.2), ("photograph", 1.5), ("png", 1.5),
        ("jpeg", 1.5), ("jpg", 1.5), ("scan", 1.0), ("product image", 2.0),
        ("classify images", 2.5), ("image classification", 2.5),
    ),
    "object_detection": (
        ("bounding box", 3.0), ("bounding boxes", 3.0), ("bbox", 3.0), ("object detection", 3.0),
        ("detect", 1.5), ("detection", 2.0), ("defect", 2.0), ("defects", 2.0),
        ("label mistakes", 3.0), ("wrong label", 2.0), ("misaligned label", 3.0),
        ("inspection", 2.0), ("locate", 1.5), ("draw boxes", 2.5), ("annotate boxes", 2.5),
        ("bottle", 1.0), ("manufacturing", 1.2), ("quality control", 1.5), ("safety helmet", 2.5),
    ),
    "image_text": (
        ("caption", 2.5), ("captions", 2.5), ("image-text", 2.5), ("image text", 1.5),
        ("vqa", 3.0), ("visual question", 2.5), ("describe the image", 2.5),
        ("paired image", 2.0), ("alt text", 2.0),
    ),
    "audio": (
        ("audio", 2.5), ("speech", 2.5), ("transcribe", 2.5), ("transcription", 2.5),
        ("wav", 2.5), ("whisper", 2.0), ("sound", 1.5), ("music", 1.5), ("noise", 1.0),
        ("recording", 1.5), ("speaker", 1.2), ("podcast", 2.0),
    ),
    "video": (
        ("video", 3.0), ("clip", 1.0), ("clips", 1.0), ("frames", 1.5), ("keyframe", 2.5),
        ("movie", 2.0), ("surveillance", 2.0), ("action sequence", 2.5), ("camera stream", 2.0),
        ("footage", 2.0),
    ),
    "tabular": (
        ("csv", 1.5), ("excel", 2.0), ("spreadsheet", 2.5), ("tabular", 3.0),
        ("rows and columns", 2.5), ("table", 1.0), ("structured rows", 2.0),
    ),
    "time_series": (
        ("time series", 3.0), ("timeseries", 3.0), ("stock", 1.5), ("weather", 2.0),
        ("sensor readings", 2.5), ("timestamped", 2.0), ("sequence of values", 2.0),
        ("forecast", 1.5),
    ),
    "geospatial": (
        ("gps", 3.0), ("geospatial", 3.0), ("coordinates", 1.5), ("satellite", 2.0),
        ("map data", 2.5), ("geo", 1.5), ("longitude", 2.0), ("latitude", 2.0),
    ),
    "three_d": (
        ("point cloud", 3.0), ("point clouds", 3.0), ("mesh", 2.0), ("voxel", 3.0),
        ("3d model", 2.5), ("lidar", 3.0),
    ),
    "motion": (
        ("skeleton", 2.5), ("keypoint", 2.5), ("keypoints", 2.5), ("gesture", 2.0),
        ("pose", 2.0), ("motion capture", 3.0), ("human pose", 2.5),
    ),
    "graph": (
        ("knowledge graph", 3.0), ("graph", 1.5), ("nodes and edges", 3.0),
        ("social network", 2.5), ("molecular graph", 3.0),
    ),
    "code": (
        ("source code", 3.0), ("code dataset", 3.0), ("repository", 2.0), ("programming", 2.0),
        ("bug report", 2.0), ("leetcode", 3.0), ("function signatures", 2.0),
    ),
    "scientific": (
        ("dna", 2.5), ("protein", 2.5), ("microscopy", 3.0), ("genome", 2.5),
        ("simulation data", 2.5),
    ),
    "medical": (
        ("x-ray", 3.0), ("xray", 3.0), ("mri", 3.0), ("ct scan", 3.0), ("ecg", 3.0),
        ("clinical", 2.5), ("medical", 2.5), ("patient", 1.5),
    ),
    "sensor_iot": (
        ("accelerometer", 3.0), ("gyroscope", 3.0), ("humidity", 2.5), ("iot", 2.5),
        ("sensor stream", 2.5), ("temperature readings", 2.5),
    ),
    "neurophysiological": (
        ("eeg", 3.0), ("emg", 3.0), ("ppg", 3.0), ("brain signal", 3.0),
        ("brain signals", 3.0),
    ),
    "robotics": (
        ("robot", 2.5), ("robotics", 3.0), ("trajectory", 2.0), ("control actions", 3.0),
        ("teleoperation", 3.0), ("robot episode", 3.0),
    ),
    "transactional": (
        ("transaction", 2.5), ("transactions", 2.5), ("banking", 2.5), ("purchase", 2.0),
        ("clickstream", 3.0), ("fraud", 2.0), ("payments", 1.5),
    ),
}

#: Type order used for tie-breaking: more specific types win over the generic text fallback.
_DETECTION_ORDER = [
    "object_detection", "image_text", "audio", "video", "tabular", "time_series", "geospatial",
    "three_d", "motion", "graph", "code", "scientific", "medical", "sensor_iot",
    "neurophysiological", "robotics", "transactional", "image", "text",
]


def detect_dataset_type(text: str) -> dict[str, Any]:
    """Score the prompt against the lexicon and return a draft dataset type + confidence."""
    lowered = (text or "").lower()
    scores: dict[str, float] = {}
    for type_id, phrases in _DATASET_LEXICON.items():
        score = 0.0
        for phrase, weight in phrases:
            if phrase in lowered:
                score += weight
        if score > 0:
            scores[type_id] = score

    if not scores:
        info = get_dataset_type("text")
        fallback_alternatives = [
            {"id": entry.id, "label": entry.label, "status": entry.status}
            for entry in DATASET_TYPES if entry.status in {"available", "beta"}
        ][:4]
        return {
            "id": "text",
            "label": info.label if info else "Text",
            "status": info.status if info else "available",
            "task_type": info.task_type if info else TaskType.TEXT_CLASSIFICATION.value,
            "confidence": 0.2,
            "alternatives": fallback_alternatives,
            "needs_type_choice": True,
        }

    ranked = sorted(
        scores.items(),
        key=lambda item: (-item[1], _DETECTION_ORDER.index(item[0])
                          if item[0] in _DETECTION_ORDER else 99),
    )
    top_id, top_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0.0
    confidence = top_score / (top_score + second_score + 0.6)
    info = get_dataset_type(top_id)
    alternatives = [
        {"id": other_id, "label": (get_dataset_type(other_id).label if get_dataset_type(other_id) else other_id),
         "status": (get_dataset_type(other_id).status if get_dataset_type(other_id) else "planned")}
        for other_id, _score in ranked[1:4]
    ]
    # Always offer text/image as easy switches when they were not detected.
    for switch_id in ("image", "text"):
        if switch_id != top_id and all(item["id"] != switch_id for item in alternatives):
            entry = get_dataset_type(switch_id)
            if entry:
                alternatives.append({"id": entry.id, "label": entry.label, "status": entry.status})

    # Non-text requests always get a confirmation question: silently generating text for an
    # image/audio request was a real failure mode, and types are cheap to confirm.
    needs_choice = confidence < 0.62 or top_score < 1.5 or top_id != "text"
    return {
        "id": top_id,
        "label": info.label if info else top_id,
        "status": info.status if info else "planned",
        "task_type": (info.task_type if info and info.task_type else TaskType.TEXT_CLASSIFICATION.value),
        "confidence": confidence,
        "alternatives": alternatives[:4],
        "needs_type_choice": needs_choice,
    }


_COUNT_TAIL = re.compile(
    r"\s*(?:[\u2014\u2013-]\s*)?\(?\d[\d,]*\s*"
    r"(?:examples?|rows?|samples?|items?|records?|entries|points?)\)?\s*$",
    re.IGNORECASE,
)


def _clean_labels(candidates: list[str]) -> list[str]:
    """Normalise class names coming from free text.

    A prompt like "sentiment: positive, negative, neutral — 150 examples" must yield exactly
    ``positive, negative, neutral``: the trailing count belongs to the request, not to a class name.
    """
    cleaned: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        label = str(candidate).strip().strip(" .;:'\"()[]")
        label = _COUNT_TAIL.sub("", label).strip().strip(" .;:'\"()[]")
        label = re.sub(r"\s{2,}", " ", label)
        if not label or len(label) > 40:
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(label)
    return cleaned[:8]


_COUNT_TAIL = re.compile(
    r"\s*(?:[\u2014\u2013-]\s*)?\(?\d[\d,]*\s*"
    r"(?:examples?|rows?|samples?|items?|records?|entries|points?)\)?\s*$",
    re.IGNORECASE,
)


def _clean_labels(candidates: list[str]) -> list[str]:
    """Normalise class names coming from free text.

    A prompt like "sentiment: positive, negative, neutral — 150 examples" must yield exactly
    ``positive, negative, neutral``: the trailing count belongs to the request, not to a class name.
    """
    cleaned: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        label = str(candidate).strip().strip(" .;:'\"()[]")
        label = _COUNT_TAIL.sub("", label).strip().strip(" .;:'\"()[]")
        label = re.sub(r"\s{2,}", " ", label)
        if not label or len(label) > 40:
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(label)
    return cleaned[:8]


def draft_plan(prompt: str, *, sample_rows: list[dict[str, Any]] | None = None) -> GenerationPlan:
    """Turn a natural-language request into an editable plan plus at most three questions.

    Deterministic and offline: it never pretends to have understood more than it did. Anything it
    could not infer is asked as a question with an example default.
    """
    text = (prompt or "").strip()
    lowered = text.lower()

    # dataset type: deterministic detection over the full 18-type catalogue
    detection = detect_dataset_type(text)
    task_type = str(detection["task_type"])

    # count
    suggested_total = 200
    for match in _COUNT_RE.finditer(lowered):
        value = int(match.group(1))
        if 10 <= value <= 100_000:
            suggested_total = value
            break

    # classes: prefer an explicit list after ':' or 'categories'; else use sample labels; else hints
    classes: list[str] = []
    if sample_rows:
        seen = {str(row.get("label")) for row in sample_rows if row.get("label")}
        classes = _clean_labels(sorted(seen))

    if not classes:
        explicit = re.findall(r"`([^`]{2,40})`", text)
        if explicit:
            classes = _clean_labels([item.strip() for item in explicit[:8]])
    if not classes:
        colon = text.split(":", 1)
        if len(colon) == 2 and "," in colon[1]:
            candidates = _clean_labels(
                [part.strip(" .") for part in colon[1].split(",") if part.strip()]
            )
            if 2 <= len(candidates) <= 8:
                classes = candidates
    if not classes:
        hints = [hint for hint in _CLASS_HINTS if hint in lowered]
        classes = [hint.capitalize() for hint in hints[:4]]
        # Offer the natural partner class: beginners almost always want the pair (spam/ham,
        # positive/negative, correct/incorrect) rather than a single label.
        for first, partner in _CLASS_PARTNERS.items():
            if first.capitalize() in classes and partner.capitalize() not in classes:
                index = classes.index(first.capitalize())
                classes.insert(index + 1, partner.capitalize())
        classes = classes[:4]
    if not classes:
        classes = ["Class A", "Class B"]
    classes = list(dict.fromkeys(classes))[:8]

    title = "New dataset"
    headline = re.split(r"[.\n]", text)[0].strip() if text else ""
    if headline:
        title = headline[:70].rstrip(" ,;:-")

    questions = [
        PlanQuestion(
            id="count",
            question="How many examples would you like?",
            kind="count",
            default=suggested_total,
            options=[50, 200, 500, 1000],
            example="200 examples is plenty to start and takes a few minutes.",
            help="You can add more later without starting over.",
        ),
        PlanQuestion(
            id="classes",
            question="Which categories should each example use?",
            kind="classes",
            default=classes,
            options=classes,
            example=", ".join(classes),
            help="Edit any of these inline — separate them with commas.",
        ),
        PlanQuestion(
            id="difficulty",
            question="How hard should the examples be?",
            kind="difficulty",
            default="mixed",
            options=["beginner", "mixed", "hard"],
            example="mixed gives a realistic spread of easy and tricky cases.",
            help="Beginner reads plainly; hard includes edge cases and near-misses.",
        ),
    ]

    # Ask the user to confirm the type when detection is not confident or the type is not plain
    # text: silently generating text for an image/audio request was a real UX failure.
    if detection["needs_type_choice"] and detection["id"] != "text":
        questions.insert(0, PlanQuestion(
            id="dataset_type",
            question="What kind of dataset is this?",
            kind="dataset_type",
            default=detection["id"],
            options=[{"id": detection["id"], "label": detection["label"],
                      "status": detection["status"]}, *detection["alternatives"]],
            example=f"I read this as: {detection['label']}. Change it if that is wrong.",
            help="Only 'available' and 'beta' types can be created today.",
        ))

    notes: list[str] = []
    if detection["status"] == "planned":
        notes.append(
            f"“{detection['label']}” is on the roadmap but not available yet — pick one of the "
            "available types for now."
        )
    if detection["needs_type_choice"] and detection["id"] != "text":
        notes.append(
            f"I read this as a {detection['label'].lower()} dataset. Confirm or change the type "
            "before continuing."
        )
    if classes == ["Class A", "Class B"]:
        notes.append(
            "No categories were detected in your description — rename these two, or add your own, "
            "before generating."
        )
    if not sample_rows:
        notes.append(
            "Tip: upload a sample file first and the examples will copy its style and labels."
        )
    if task_type in {TaskType.IMAGE_CLASSIFICATION.value, TaskType.OBJECT_DETECTION.value}:
        notes.append(
            "Image generation is available for this type (max 25 images per run, low/medium quality)."
        )
    elif task_type != TaskType.TEXT_CLASSIFICATION.value:
        notes.append(
            f"Detected task type '{task_type}'. This wizard can create the dataset, but automatic "
            "example generation is not available for it yet — import or annotate instead."
        )

    return GenerationPlan(
        title=title,
        task_type=task_type,
        summary=text[:280],
        classes=classes,
        suggested_total=suggested_total,
        difficulty="mixed",
        questions=questions,
        detected_from_sample=bool(sample_rows),
        notes=notes,
        dataset_type=detection["id"],
        dataset_type_label=detection["label"],
        dataset_type_status=detection["status"],
        dataset_type_confidence=float(detection["confidence"]),
        dataset_type_alternatives=detection["alternatives"],
        needs_type_choice=bool(detection["needs_type_choice"]),
    )


# ------------------------------------------------------------------ job lifecycle ---

@dataclass
class _Progress:
    """In-memory rolling throughput tracker for one job."""

    started: float = field(default_factory=time.monotonic)
    timestamps: list[float] = field(default_factory=list)

    def mark(self) -> None:
        self.timestamps.append(time.monotonic())
        if len(self.timestamps) > ETA_WINDOW:
            del self.timestamps[:-ETA_WINDOW]

    def rate(self) -> float:
        window = self.timestamps[-ETA_WINDOW:]
        if len(window) < 2:
            return 0.0
        span = window[-1] - window[0]
        return (len(window) - 1) / span if span > 0 else 0.0

    def eta(self, done: int, total: int) -> int | None:
        if done < ETA_MIN_SAMPLES or done >= total:
            return None
        rate = self.rate()
        if rate <= 0:
            return None
        return max(1, round((total - done) / rate))


class TrackingGenerator:
    """Provider proxy that reports progress for every generated item."""

    def __init__(self, provider: Any, on_item: Any, should_cancel: Any) -> None:
        self._provider = provider
        self._on_item = on_item
        self._should_cancel = should_cancel
        self.name = getattr(provider, "name", "generator")

    def generate(self, request: ProviderRequest):
        if self._should_cancel():
            raise ProviderError("Generation cancelled by user", provider=str(self.name))
        response = self._provider.generate(request)
        self._on_item()
        return response


#: A non-terminal job with no heartbeat for this long is treated as interrupted/stalled.
STALL_SECONDS = 75


def _aware(value: datetime) -> datetime:
    """SQLite returns naive datetimes even for timezone-aware columns; normalise to UTC."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def _is_stale(job: GenerationJobModel) -> bool:
    if job.status in {"completed", "failed", "cancelled", "interrupted"}:
        return False
    heartbeat = job.updated_at or job.created_at
    if heartbeat is None:
        return False
    age = (datetime.now(UTC) - _aware(heartbeat)).total_seconds()
    return age > STALL_SECONDS


def _job_payload(job: GenerationJobModel) -> dict[str, Any]:
    result = job.result_json or {}
    total = int(job.total_items or 0)
    done = int(job.processed_items or 0)
    return {
        "id": job.id,
        "kind": getattr(job, "kind", "generate") or "generate",
        "status": job.status,
        "prompt": job.prompt,
        "dataset_id": job.dataset_id,
        "project_id": job.project_id,
        "dataset_name": job.dataset_name,
        "task_type": job.task_type,
        "classes": (job.config_json or {}).get("classes", []),
        "per_class": (job.config_json or {}).get("per_class"),
        "total_items": total,
        "processed_items": done,
        "progress": round(done / total, 4) if total else 0.0,
        "elapsed_seconds": job.elapsed_seconds or 0,
        "eta_seconds": job.eta_seconds,
        "phase": job.phase or ("queued" if job.status in {"pending", "running"} else job.status),
        "updated_at": job.updated_at.isoformat() if job.updated_at else None,
        "stale": _is_stale(job),
        "eta_confidence": None if job.eta_seconds is None else "estimate from measured throughput",
        "accepted": result.get("accepted", 0),
        "failed": result.get("failed", 0),
        "boxes": result.get("boxes", 0),
        "empty": result.get("empty", 0),
        "concepts": result.get("concepts", []),
        "cost_usd": result.get("cost_usd"),
        "priced": result.get("priced"),
        "auto_approved": result.get("auto_approved", 0),
        "needs_review": result.get("needs_review", 0),
        "passed_filters": result.get("passed_filters", 0),
        "rejected": result.get("rejected", 0),
        "rejection_breakdown": result.get("rejection_breakdown", {}),
        "verdict": result.get("verdict"),
        "rejection_reasons": result.get("rejection_reasons", []),
        "label_preservation": result.get("label_preservation"),
        "error": job.error_message,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }


def create_job(
    session: Session,
    *,
    prompt: str,
    classes: list[str],
    per_class: int,
    task_type: str = TaskType.TEXT_CLASSIFICATION.value,
    provider: str = "fake",
    model: str = "fake-text-generator-v1",
    verifier_providers: list[dict[str, str]] | None = None,
    project_id: str | None = None,
    dataset_name: str | None = None,
    difficulty: str = "mixed",
    min_label_preservation: float = 0.85,
    max_class_share: float = 0.6,
    target_split: str = "train",
    style_hint: str = "",
    seed_examples: list[str] | None = None,
    description: str = "",
    dataset_id: str | None = None,
) -> GenerationJobModel:
    """Create a pending job. A dataset is created unless ``dataset_id`` targets an existing one."""
    if not classes:
        raise DomainValidationError("At least one class is required.", field="classes")
    if per_class < 1:
        raise DomainValidationError("per_class must be >= 1", field="per_class")

    if project_id is None:
        # Scratch mode: everything lands in a single auto-created workspace so the user can start
        # without understanding projects.
        scratch = session.scalar(select(ProjectModel).where(ProjectModel.name == "Scratch"))
        if scratch is None:
            scratch = ProjectModel(
                id=generate_id("project"),
                owner_id="default_user",
                name="Scratch",
                description="Quick-start datasets created without an explicit project.",
            )
            session.add(scratch)
            session.flush()
        project_id = scratch.id

    project = session.get(ProjectModel, project_id)
    if not project:
        raise ResourceNotFoundError("Project", project_id)

    job_id = generate_id("job")
    if dataset_id is not None:
        dataset = session.get(DatasetModel, dataset_id)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)
        project_id = dataset.project_id
        task_type = dataset.task_type
        known = [
            str(label) for label in (
                (dataset.label_schema or {}).get("labels")
                or (dataset.label_schema or {}).get("classes")
                or []
            )
        ]
        unknown = [label for label in classes if label not in known]
        if unknown:
            raise DomainValidationError(
                f"Labels not in this dataset's schema: {unknown}", field="classes"
            )
    else:
        name = dataset_name or f"{prompt[:48].strip() or 'Generated dataset'}"
        dataset = DatasetModel(
            id=generate_id("dataset"),
            project_id=project_id,
            name=name[:180],
            description=prompt[:500],
            task_type=task_type,
            schema_version=1,
            annotation_instructions=(
                "Generated examples. Review before publishing; synthetic rows stay pending review."
            ),
            label_schema={"labels": classes},
        )
        session.add(dataset)
        session.flush()

    job = GenerationJobModel(
        id=job_id,
        project_id=project_id,
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        prompt=prompt,
        task_type=task_type,
        status="pending",
        total_items=per_class * len(classes),
        processed_items=0,
        config_json={
            "classes": classes,
            "per_class": per_class,
            "provider": provider,
            "model": model,
            "verifier_providers": verifier_providers or [],
            "difficulty": difficulty,
            "style_hint": style_hint,
            "seed_examples": seed_examples or [],
            "description": description or prompt[:280],
            "min_label_preservation": min_label_preservation,
            "max_class_share": max_class_share,
            "target_split": target_split,
        },
    )
    session.add(job)
    session.flush()
    return job


def _update(tracker: _Progress, job_id: str, *, done: int | None = None, status: str | None = None,
            result: dict[str, Any] | None = None, error: str | None = None,
            phase: str | None = None) -> None:
    """Persist progress in its own short transaction (safe for a background thread)."""
    with get_db_session() as session:
        job = session.get(GenerationJobModel, job_id)
        if not job:
            return
        total = int(job.total_items or 0)
        processed = int(job.processed_items or 0) if done is None else done
        job.processed_items = processed
        job.elapsed_seconds = round(time.monotonic() - tracker.started, 2)
        job.eta_seconds = tracker.eta(processed, total)
        job.updated_at = datetime.now(UTC)
        if phase is not None:
            job.phase = phase
        elif processed < total:
            job.phase = "generating"
        else:
            job.phase = "checking quality and saving"
        if status is not None:
            job.status = status
        if result is not None:
            job.result_json = result
        if error is not None:
            job.error_message = error[:2000]
        if status in {"completed", "failed", "cancelled"}:
            job.finished_at = datetime.now(UTC)


def run_job(job_id: str) -> None:
    """Execute one job. Runs in a background thread with its own DB sessions."""
    tracker = _Progress()
    cancelled = threading.Event()

    with get_db_session() as session:
        job = session.get(GenerationJobModel, job_id)
        if not job:
            return
        config = dict(job.config_json or {})
        dataset_id = job.dataset_id
        total = int(job.total_items or 0)
        classes = list(config.get("classes") or [])
        per_class = int(config.get("per_class") or 1)
        provider_name = str(config.get("provider") or "fake")
        model_name = str(config.get("model") or "fake-text-generator-v1")
        verifiers = list(config.get("verifier_providers") or [])

    _update(tracker, job_id, done=0, status="running")

    gateway = ProviderGateway.get_instance()
    try:
        generator = gateway.get_provider(provider_name)
    except ProviderError as exc:
        _update(tracker, job_id, status="failed", error=f"provider unavailable: {exc.message}")
        return
    if not generator.supports_capability(ProviderCapability.TEXT_GENERATION):
        _update(tracker, job_id, status="failed",
                error=f"provider '{provider_name}' does not support text generation")
        return

    completion_times: list[float] = []

    def on_item() -> None:
        completion_times.append(time.monotonic())
        tracker.mark()
        done = len(completion_times)
        if done % 1 == 0:
            _update(tracker, job_id, done=min(done, total))

    def should_cancel() -> bool:
        return cancelled.is_set() or _is_cancelling(job_id)

    tracking = TrackingGenerator(generator, on_item, should_cancel)

    # Preflight the verification models once. A model that cannot answer a one-word request must
    # not be used for hundreds of verifications: each failing call can block for the provider
    # timeout, which is how a 50-item run appeared to hang at "checking quality and saving".
    healthy_verifiers: list[dict[str, str]] = []
    verification_errors: dict[str, str] = {}
    for ref in verifiers:
        try:
            probe_provider = gateway.get_provider(str(ref.get("provider")))
            probe_provider.annotate(ProviderRequest(
                model=str(ref.get("model")),
                task_type=TaskType.TEXT_CLASSIFICATION.value,
                input_text="ok",
                label_schema={"labels": classes},
            ))
            healthy_verifiers.append(ref)
        except ProviderError as exc:
            verification_errors[str(ref.get("provider"))] = str(exc.message)[:140]

    if verifiers and not healthy_verifiers:
        detail = "; ".join(f"{name}: {message}" for name, message in verification_errors.items())
        _update(
            tracker,
            job_id,
            status="failed",
            error=(
                "No verification model responded, so the generated examples could not be checked. "
                f"Details: {detail}. Configure a working provider key or use the simulated models."
            ),
            phase="failed",
        )
        return

    verify_counter = {"calls": 0}

    def verifier(text: str) -> str:
        from collections import Counter

        labels: list[str] = []
        for ref in healthy_verifiers:
            try:
                provider = gateway.get_provider(str(ref.get("provider")))
                response = provider.annotate(ProviderRequest(
                    model=str(ref.get("model")),
                    task_type=TaskType.TEXT_CLASSIFICATION.value,
                    input_text=text,
                    label_schema={"labels": classes},
                ))
                label = str((response.payload or {}).get("label") or "")
                if label:
                    labels.append(label)
            except ProviderError:
                continue
        verify_counter["calls"] += 1
        # Heartbeat: verification is a long phase with no item progress; without this the UI
        # cannot distinguish "working" from "hung".
        if verify_counter["calls"] % 5 == 0:
            _update(tracker, job_id, done=total, phase="checking quality and saving")
        if not labels:
            return ""
        return Counter(labels).most_common(1)[0][0]

    spec = GenerationSpec(
        per_class=per_class,
        target_split=str(config.get("target_split") or "train"),
        prompt_version="simple-wizard-v1",
        max_class_share=float(config.get("max_class_share") or 0.6),
        min_label_preservation=float(config.get("min_label_preservation") or 0.85),
        labels=classes,
        difficulty=str(config.get("difficulty") or "mixed"),
        style_hint=str(config.get("style_hint") or ""),
        seed_examples=[str(item) for item in (config.get("seed_examples") or [])],
        description=str(config.get("description") or ""),
    )

    # The diversity gate rejects near-duplicate samples, so a single pass often falls short of the
    # requested count (a 1,000-item simulated run yielded ~16 usable rows). Ask for replacements in
    # bounded waves instead of silently delivering a fraction of the request. Each wave is admitted
    # through the same all-or-nothing gate against the rows already saved.
    MAX_WAVES = 4
    accepted_total = 0
    generated_total = 0
    passed_total = 0
    rejected_total = 0
    last_outcome = None
    waves = 0
    try:
        for wave in range(MAX_WAVES):
            remaining = total - accepted_total
            if remaining <= 0:
                break
            per_class_wave = max(1, (remaining + len(classes) - 1) // max(1, len(classes)))
            wave_spec = replace(spec, per_class=per_class_wave, attempt_offset=generated_total)
            with get_db_session() as session:
                outcome = run_generation(
                    session,
                    dataset_id,
                    generator=tracking,
                    generator_model=model_name,
                    verifier=verifier,
                    spec=wave_spec,
                )
            waves += 1
            last_outcome = outcome
            accepted_total += outcome.accepted
            generated_total += outcome.generated
            passed_total += outcome.passed_filters
            rejected_total += outcome.rejected
            if outcome.accepted == 0:
                break  # no progress: further waves would repeat the same material
            if accepted_total < total:
                _update(
                    tracker,
                    job_id,
                    done=min(generated_total, total),
                    phase=f"filling the shortfall (pass {wave + 2})",
                )

        verdict = "accept" if accepted_total > 0 else "reject"
        _update(
            tracker,
            job_id,
            done=min(len(completion_times), total),
            status="completed",
            result={
                "accepted": accepted_total,
                "generated": generated_total,
                "passed_filters": passed_total,
                "rejected": rejected_total,
                "rejection_breakdown": (last_outcome.rejection_breakdown if last_outcome else {}),
                "verdict": verdict,
                "rejection_reasons": (last_outcome.rejection_reasons if last_outcome else []),
                "label_preservation": (last_outcome.label_preservation if last_outcome else None),
                "batch_unique_trigram_ratio": (
                    last_outcome.batch_unique_trigram_ratio if last_outcome else None
                ),
                "class_counts_after": (last_outcome.class_counts_after if last_outcome else {}),
                "waves": waves,
            },
        )
    except Exception as exc:  # noqa: BLE001 - a job must always settle in a terminal state
        message = str(exc) or exc.__class__.__name__
        status = "cancelled" if should_cancel() else "failed"
        _update(tracker, job_id, status=status, error=message)


def _is_cancelling(job_id: str) -> bool:
    with get_db_session() as session:
        job = session.get(GenerationJobModel, job_id)
        return bool(job and job.status == "cancelling")


def recover_interrupted_jobs() -> int:
    """Settle jobs orphaned by a process restart.

    The runner is an in-process daemon thread. If the server restarts mid-run, the row would stay
    ``running``/``pending`` forever and the UI would poll it indefinitely (observed in practice).
    On startup we settle them with an explicit, user-readable reason.
    """
    settled = 0
    with get_db_session() as session:
        rows = session.scalars(
            select(GenerationJobModel).where(
                GenerationJobModel.status.in_(["pending", "running", "cancelling"])
            )
        ).all()
        for job in rows:
            job.status = "interrupted"
            job.phase = "interrupted"
            job.updated_at = datetime.now(UTC)
            job.finished_at = datetime.now(UTC)
            job.error_message = (
                "This run was interrupted by a server restart, so it cannot report a result. "
                "Start it again — anything it had not saved was discarded."
            )
            settled += 1
    return settled


def start_job(job_id: str) -> None:
    """Launch the job in a daemon thread (single-process deployment)."""
    with _ACTIVE_LOCK:
        if job_id in _ACTIVE and _ACTIVE[job_id].is_alive():
            return
        thread = threading.Thread(target=run_job, args=(job_id,), daemon=True, name=f"job-{job_id}")
        _ACTIVE[job_id] = thread
        thread.start()


def cancel_job(session: Session, job_id: str) -> GenerationJobModel:
    job = session.get(GenerationJobModel, job_id)
    if not job:
        raise ResourceNotFoundError("GenerationJob", job_id)
    if job.status in {"completed", "failed", "cancelled"}:
        return job
    job.status = "cancelling"
    session.flush()
    return job


def get_job(session: Session, job_id: str) -> dict[str, Any]:
    job = session.get(GenerationJobModel, job_id)
    if not job:
        raise ResourceNotFoundError("GenerationJob", job_id)
    return _job_payload(job)


def list_jobs(session: Session, *, limit: int = 20) -> list[dict[str, Any]]:
    rows = session.scalars(
        select(GenerationJobModel).order_by(GenerationJobModel.created_at.desc()).limit(limit)
    ).all()
    return [_job_payload(job) for job in rows]
