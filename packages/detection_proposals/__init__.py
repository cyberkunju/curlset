"""Box proposals for object-detection datasets (SAM 3.1)."""
from packages.detection_proposals.service import (
    MAX_CONCEPTS,
    MAX_RECORDS_PER_RUN,
    create_proposal_job,
    run_proposal_job,
    start_proposal_job,
)

__all__ = [
    "MAX_CONCEPTS",
    "MAX_RECORDS_PER_RUN",
    "create_proposal_job",
    "run_proposal_job",
    "start_proposal_job",
]
