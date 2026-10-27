"""
Validation and Quality Engine API endpoints for running audits, diagnostics, and publication readiness checks.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_quality.engine import QualityEngine
from packages.dataset_quality.models import QualityReport

router = APIRouter(tags=["validation"])


@router.post("/api/v1/datasets/{dataset_id}/validate", response_model=QualityReport)
def run_dataset_validation(
    dataset_id: str,
    session: Session = Depends(get_db),
) -> QualityReport:
    """
    Execute full quality validation engine suite.
    Evaluates schema compliance, unreviewed records, missing assets, split leakage, and class distribution.
    """
    report = QualityEngine.validate_dataset(session=session, dataset_id=dataset_id)
    session.commit()
    return report


@router.get("/api/v1/datasets/{dataset_id}/validation-summary", response_model=QualityReport)
def get_validation_summary(
    dataset_id: str,
    session: Session = Depends(get_db),
) -> QualityReport:
    """Retrieve quality report summary for the dataset."""
    report = QualityEngine.validate_dataset(session=session, dataset_id=dataset_id)
    session.commit()
    return report
