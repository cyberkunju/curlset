"""
Quality validation data contracts, finding severity models, and reporting structures.
"""
from enum import Enum

from pydantic import BaseModel, Field


class ValidationSeverity(str, Enum):
    BLOCKING = "blocking"
    WARNING = "warning"
    INFO = "info"


class ValidationFinding(BaseModel):
    rule_id: str
    severity: ValidationSeverity
    title: str
    description: str
    remediation: str
    affected_record_ids: list[str] = Field(default_factory=list)
    count: int = 0


class QualityReport(BaseModel):
    dataset_id: str
    schema_version: int
    is_publishable: bool
    total_records: int
    blocking_count: int
    warning_count: int
    info_count: int
    findings: list[ValidationFinding] = Field(default_factory=list)
    class_distribution: dict[str, int] = Field(default_factory=dict)
    split_distribution: dict[str, int] = Field(default_factory=dict)
    origin_distribution: dict[str, int] = Field(default_factory=dict)
    disclaimer: str = (
        "Automated quality diagnostics detect structural, schema, and consistency issues. "
        "They do not certify legal clearance, absence of societal bias, or safety for specific downstream tasks."
    )
