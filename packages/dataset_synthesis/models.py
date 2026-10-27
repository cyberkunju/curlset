"""
Contracts and data models for synthetic data generation and lineage tracking.
"""
from typing import Any

from pydantic import BaseModel, Field


class SynthesisBatchRequest(BaseModel):
    """Configuration for a bounded synthetic sample generation run."""
    dataset_id: str
    target_class: str
    count: int = Field(default=5, ge=1, le=50, description="Bounded batch count (1-50)")
    prompt_template: str = Field(
        default="Generate realistic training examples for class: {class_name}",
        description="Prompt template with versioned configuration",
    )
    template_version: str = Field(default="v1.0", min_length=1)
    provider_name: str = "fake"
    model_name: str = "fake-text-generator-v1"
    seed: int | None = 42
    split: str = "train"


class SynthesisRunSummary(BaseModel):
    """Auditable summary of synthetic data generation execution and lineage."""
    run_id: str
    dataset_id: str
    target_class: str
    requested_count: int
    generated_count: int
    accepted_count: int
    duplicate_count: int
    lineage: dict[str, Any]
    record_ids: list[str]
    total_dataset_records: int
    synthetic_record_count: int
    synthetic_ratio: float
