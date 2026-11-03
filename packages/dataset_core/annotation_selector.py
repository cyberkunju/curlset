"""
The single, canonical active-annotation selector for a record.

Everything that needs "the annotation that counts" must call this:
quality engine, version freeze, evaluation, record queue, clustering.

Rule (deterministic):
  1. Among annotations with status == approved, pick the newest (created_at, then id).
  2. If none are approved, pick the newest annotation overall (created_at, then id).

Rationale: the previous code disagreed with itself — the quality engine used
max(created_at) while version freeze used the unordered ``record.annotations[0]``,
so a published version could freeze a different annotation than the one that was
validated. See studies/02-quality-evaluation.md Q-01 / studies/05-versioning-export-ops.md C-01.
"""
from __future__ import annotations

from collections.abc import Iterable, Sequence
from datetime import UTC, datetime
from typing import Any

from packages.dataset_core.constants import ReviewStatus

_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _sort_key(annotation: Any) -> tuple[datetime, str]:
    created = getattr(annotation, "created_at", None)
    if created is None:
        created = _EPOCH
    # SQLite may hand back naive datetimes; normalise so comparisons never raise.
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    return (created, getattr(annotation, "id", "") or "")


def select_active_annotation(annotations: Iterable[Any] | None) -> Any | None:
    """Return the annotation that represents the record's current decision."""
    if not annotations:
        return None
    items: Sequence[Any] = list(annotations)
    approved = [
        a for a in items if getattr(a, "status", None) == ReviewStatus.APPROVED.value
    ]
    pool = approved or items
    return max(pool, key=_sort_key)


def select_active_annotation_id(annotations: Iterable[Any] | None) -> str | None:
    """Convenience wrapper returning just the id (or None)."""
    active = select_active_annotation(annotations)
    return getattr(active, "id", None) if active is not None else None
