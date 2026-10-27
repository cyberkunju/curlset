"""
Core domain constants, enumerations, and state transition validation.
"""
from enum import Enum


class TaskType(str, Enum):
    IMAGE_CLASSIFICATION = "image_classification"
    TEXT_CLASSIFICATION = "text_classification"
    OBJECT_DETECTION = "object_detection"
    PAIRED_IMAGE_TEXT = "paired_image_text"
    AUDIO_TRANSCRIPTION = "audio_transcription"
    DOCUMENT_OCR = "document_ocr"


class AnnotationOrigin(str, Enum):
    HUMAN = "human"
    MODEL = "model"
    IMPORTED = "imported"
    RULE_GENERATED = "rule_generated"
    SYNTHETIC = "synthetic"
    AUGMENTED = "augmented"


class ReviewStatus(str, Enum):
    PROPOSED = "proposed"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_CORRECTION = "needs_correction"
    INVALID = "invalid"


class AssetModality(str, Enum):
    IMAGE = "image"
    TEXT = "text"
    AUDIO = "audio"
    VIDEO = "video"
    DOCUMENT = "document"


class AssetRole(str, Enum):
    PRIMARY_IMAGE = "primary_image"
    PRIMARY_AUDIO = "primary_audio"
    AUDIO_RECORDING = "audio_recording"
    PAIRED_TEXT = "paired_text"
    SOURCE_DOCUMENT = "source_document"
    CROP = "crop"
    THUMBNAIL = "thumbnail"
    ATTACHMENT = "attachment"


class LicenseStatus(str, Enum):
    UNKNOWN = "unknown"
    REVIEW_REQUIRED = "review_required"
    APPROVED_FOR_INTENDED_USE = "approved_for_intended_use"
    RESTRICTED = "restricted"
    REJECTED = "rejected"


class RunType(str, Enum):
    IMPORT = "import"
    INFERENCE = "inference"
    VALIDATION = "validation"
    EXPORT = "export"
    SYNTHESIS = "synthesis"
    RESEARCH = "research"


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ExportFormat(str, Enum):
    CSV = "csv"
    JSONL = "jsonl"
    COCO = "coco"
    YOLO = "yolo"
    WEBVTT = "webvtt"
    UNSLOTH_SHAREGPT_VLM = "unsloth_sharegpt_vlm"
    AXOLOTL_ALPACA_CHATML = "axolotl_alpaca_chatml"
    LLAMA_FACTORY_BUNDLE = "llama_factory_bundle"
    ULTRALYTICS_YOLO_V8_V11 = "ultralytics_yolo_v8_v11"



# Centralized Review State Machine
# Enforces legal review transitions as specified in docs/DESIGN.md and docs/REQUIREMENTS.md
VALID_REVIEW_TRANSITIONS: dict[ReviewStatus, set[ReviewStatus]] = {
    ReviewStatus.PROPOSED: {
        ReviewStatus.PENDING_REVIEW,
        ReviewStatus.INVALID,
        ReviewStatus.REJECTED,
    },
    ReviewStatus.PENDING_REVIEW: {
        ReviewStatus.APPROVED,
        ReviewStatus.REJECTED,
        ReviewStatus.NEEDS_CORRECTION,
        ReviewStatus.INVALID,
    },
    ReviewStatus.NEEDS_CORRECTION: {
        ReviewStatus.PROPOSED,
        ReviewStatus.PENDING_REVIEW,
        ReviewStatus.REJECTED,
    },
    ReviewStatus.APPROVED: {
        # Can transition back to needs_correction or rejected if audited
        ReviewStatus.NEEDS_CORRECTION,
        ReviewStatus.REJECTED,
    },
    ReviewStatus.REJECTED: {
        # Can be re-opened for review or correction
        ReviewStatus.PENDING_REVIEW,
        ReviewStatus.NEEDS_CORRECTION,
    },
    ReviewStatus.INVALID: {
        # Invalid proposals can only be corrected or replaced
        ReviewStatus.NEEDS_CORRECTION,
        ReviewStatus.REJECTED,
    },
}


def can_transition_review_status(current_status: ReviewStatus, next_status: ReviewStatus) -> bool:
    """Check if transitioning from current_status to next_status is permitted."""
    if current_status == next_status:
        return True
    allowed = VALID_REVIEW_TRANSITIONS.get(current_status, set())
    return next_status in allowed
