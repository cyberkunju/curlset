"""
Task schema specifications, label constraints, and validation logic.
Ensures that all manual and model annotations adhere strictly to task rules.
"""
from typing import Any

from pydantic import BaseModel, Field

from packages.dataset_core.constants import TaskType
from packages.dataset_core.exceptions import DomainValidationError


class TaskSchemaField(BaseModel):
    name: str
    type: str  # "string", "float", "list", "dict"
    required: bool = True
    description: str = ""


class TaskSchema(BaseModel):
    task_type: str
    schema_version: int = 1
    description: str
    fields: list[TaskSchemaField] = Field(default_factory=list)


# Central registry of supported canonical schemas
TASK_SCHEMAS: dict[str, TaskSchema] = {
    TaskType.TEXT_CLASSIFICATION.value: TaskSchema(
        task_type=TaskType.TEXT_CLASSIFICATION.value,
        schema_version=1,
        description="Single or multi-label text classification schema",
        fields=[
            TaskSchemaField(name="label", type="string", required=True, description="Classification category/class name"),
            TaskSchemaField(name="confidence", type="float", required=False, description="Confidence score between 0.0 and 1.0"),
            TaskSchemaField(name="rationale", type="string", required=False, description="Reasoning or notes for the label"),
        ],
    ),
    TaskType.IMAGE_CLASSIFICATION.value: TaskSchema(
        task_type=TaskType.IMAGE_CLASSIFICATION.value,
        schema_version=1,
        description="Single or multi-label image classification schema",
        fields=[
            TaskSchemaField(name="label", type="string", required=True, description="Classification category/class name"),
            TaskSchemaField(name="confidence", type="float", required=False, description="Confidence score between 0.0 and 1.0"),
            TaskSchemaField(name="notes", type="string", required=False, description="Optional reviewer notes"),
        ],
    ),
    TaskType.OBJECT_DETECTION.value: TaskSchema(
        task_type=TaskType.OBJECT_DETECTION.value,
        schema_version=1,
        description="2D Bounding box object detection schema",
        fields=[
            TaskSchemaField(name="boxes", type="list", required=True, description="List of bounding boxes with label and coordinates"),
        ],
    ),
}


def get_task_schema(task_type: str | TaskType, schema_version: int = 1) -> TaskSchema:
    key = task_type.value if isinstance(task_type, TaskType) else str(task_type)
    if key not in TASK_SCHEMAS:
        raise DomainValidationError(f"Unsupported task type '{key}' for schema validation.", field="task_type")
    return TASK_SCHEMAS[key]


def validate_annotation_payload(
    task_type: str | TaskType,
    payload: dict[str, Any],
    label_schema: dict[str, Any] | None = None,
) -> None:
    """
    Validate that an annotation payload complies with the task schema and label_schema constraints.
    Raises DomainValidationError on invalid or out-of-vocabulary payloads.
    """
    key = task_type.value if isinstance(task_type, TaskType) else str(task_type)

    if not isinstance(payload, dict):
        raise DomainValidationError("Annotation payload must be a JSON dictionary.", field="payload")

    # Extract allowed classes if configured in dataset label_schema
    allowed_classes: list[str] | None = None
    if label_schema:
        if "classes" in label_schema and isinstance(label_schema["classes"], list):
            allowed_classes = [str(c) for c in label_schema["classes"]]
        elif "labels" in label_schema and isinstance(label_schema["labels"], list):
            allowed_classes = [str(c) for c in label_schema["labels"]]

    if key in {TaskType.TEXT_CLASSIFICATION.value, TaskType.IMAGE_CLASSIFICATION.value}:
        if "label" not in payload:
            raise DomainValidationError(f"Field 'label' is required for task '{key}'.", field="label")
        label = payload["label"]
        if not isinstance(label, str) or not label.strip():
            raise DomainValidationError("Field 'label' must be a non-empty string.", field="label")

        if allowed_classes is not None and label not in allowed_classes:
            raise DomainValidationError(
                f"Label '{label}' is not in the allowed label set: {allowed_classes}.",
                field="label",
            )

        if "confidence" in payload and payload["confidence"] is not None:
            conf = payload["confidence"]
            if not isinstance(conf, (int, float)) or not (0.0 <= float(conf) <= 1.0):
                raise DomainValidationError("Confidence must be a float between 0.0 and 1.0.", field="confidence")

    elif key == TaskType.OBJECT_DETECTION.value:
        if "boxes" not in payload or not isinstance(payload["boxes"], list):
            raise DomainValidationError("Object detection payload requires a 'boxes' list.", field="boxes")
        for idx, box in enumerate(payload["boxes"]):
            if not isinstance(box, dict):
                raise DomainValidationError(f"Box at index {idx} must be a dictionary.", field="boxes")
            box_label = box.get("label")
            if not box_label or not isinstance(box_label, str):
                raise DomainValidationError(f"Box at index {idx} is missing a valid 'label'.", field="boxes")
            if allowed_classes is not None and box_label not in allowed_classes:
                raise DomainValidationError(
                    f"Box label '{box_label}' at index {idx} is not in allowed classes: {allowed_classes}.",
                    field="boxes",
                )
