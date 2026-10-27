"""
Unit tests for Task Schemas, allowed label validation, and constraint checking.
"""
import pytest

from packages.dataset_core.constants import TaskType
from packages.dataset_core.exceptions import DomainValidationError
from packages.dataset_core.task_schemas import (
    get_task_schema,
    validate_annotation_payload,
)


def test_get_task_schema_canonical_types():
    text_schema = get_task_schema(TaskType.TEXT_CLASSIFICATION)
    assert text_schema.task_type == "text_classification"
    assert any(f.name == "label" for f in text_schema.fields)

    image_schema = get_task_schema(TaskType.IMAGE_CLASSIFICATION)
    assert image_schema.task_type == "image_classification"
    assert any(f.name == "label" for f in image_schema.fields)

    with pytest.raises(DomainValidationError):
        get_task_schema("unsupported_fake_task")


def test_text_classification_valid_payload():
    # Free-form label
    validate_annotation_payload(
        TaskType.TEXT_CLASSIFICATION,
        payload={"label": "sports", "confidence": 0.88, "rationale": "Mentions football"},
    )


def test_text_classification_label_set_enforcement():
    label_schema = {"classes": ["spam", "ham"]}

    # Valid label in set
    validate_annotation_payload(
        TaskType.TEXT_CLASSIFICATION,
        payload={"label": "spam"},
        label_schema=label_schema,
    )

    # Invalid label outside set
    with pytest.raises(DomainValidationError) as exc:
        validate_annotation_payload(
            TaskType.TEXT_CLASSIFICATION,
            payload={"label": "promotions"},
            label_schema=label_schema,
        )
    assert "not in the allowed label set" in str(exc.value)


def test_text_classification_missing_or_invalid_fields():
    # Missing 'label'
    with pytest.raises(DomainValidationError):
        validate_annotation_payload(
            TaskType.TEXT_CLASSIFICATION,
            payload={"confidence": 0.5},
        )

    # Empty string label
    with pytest.raises(DomainValidationError):
        validate_annotation_payload(
            TaskType.TEXT_CLASSIFICATION,
            payload={"label": "   "},
        )

    # Confidence out of bounds
    with pytest.raises(DomainValidationError):
        validate_annotation_payload(
            TaskType.TEXT_CLASSIFICATION,
            payload={"label": "news", "confidence": 1.5},
        )

    with pytest.raises(DomainValidationError):
        validate_annotation_payload(
            TaskType.TEXT_CLASSIFICATION,
            payload={"label": "news", "confidence": -0.1},
        )


def test_image_classification_payload_validation():
    label_schema = {"labels": ["cat", "dog"]}

    validate_annotation_payload(
        TaskType.IMAGE_CLASSIFICATION,
        payload={"label": "cat", "confidence": 0.99},
        label_schema=label_schema,
    )

    with pytest.raises(DomainValidationError):
        validate_annotation_payload(
            TaskType.IMAGE_CLASSIFICATION,
            payload={"label": "airplane"},
            label_schema=label_schema,
        )


def test_object_detection_payload_validation():
    label_schema = {"classes": ["car", "pedestrian"]}

    valid_payload = {
        "boxes": [
            {"label": "car", "x": 10, "y": 20, "w": 100, "h": 50},
            {"label": "pedestrian", "x": 120, "y": 30, "w": 25, "h": 70},
        ]
    }
    validate_annotation_payload(
        TaskType.OBJECT_DETECTION,
        payload=valid_payload,
        label_schema=label_schema,
    )

    # Invalid box class
    invalid_payload = {
        "boxes": [
            {"label": "bicycle", "x": 10, "y": 20, "w": 100, "h": 50},
        ]
    }
    with pytest.raises(DomainValidationError):
        validate_annotation_payload(
            TaskType.OBJECT_DETECTION,
            payload=invalid_payload,
            label_schema=label_schema,
        )
