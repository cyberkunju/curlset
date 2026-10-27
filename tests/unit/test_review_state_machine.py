"""
Unit tests for the centralized review state machine.
"""
from packages.dataset_core.constants import ReviewStatus, can_transition_review_status


def test_legal_review_transitions():
    # Proposed -> Pending Review
    assert can_transition_review_status(ReviewStatus.PROPOSED, ReviewStatus.PENDING_REVIEW) is True
    # Pending Review -> Approved
    assert can_transition_review_status(ReviewStatus.PENDING_REVIEW, ReviewStatus.APPROVED) is True
    # Pending Review -> Rejected
    assert can_transition_review_status(ReviewStatus.PENDING_REVIEW, ReviewStatus.REJECTED) is True
    # Pending Review -> Needs Correction
    assert can_transition_review_status(ReviewStatus.PENDING_REVIEW, ReviewStatus.NEEDS_CORRECTION) is True
    # Approved -> Needs Correction (e.g. audit flagged mistake)
    assert can_transition_review_status(ReviewStatus.APPROVED, ReviewStatus.NEEDS_CORRECTION) is True
    # Idempotent same state transition
    assert can_transition_review_status(ReviewStatus.APPROVED, ReviewStatus.APPROVED) is True


def test_illegal_review_transitions():
    # Proposed cannot jump directly to Approved without review
    assert can_transition_review_status(ReviewStatus.PROPOSED, ReviewStatus.APPROVED) is False
    # Invalid cannot become Approved directly
    assert can_transition_review_status(ReviewStatus.INVALID, ReviewStatus.APPROVED) is False
    # Rejected cannot become Approved directly (must go through review or correction)
    assert can_transition_review_status(ReviewStatus.REJECTED, ReviewStatus.APPROVED) is False
