"""
Dataset-type catalogue API.

Single source of truth for the UI: which dataset types exist, which are available/beta/planned, and
whether the wizard can generate or import them. The frontend must not hard-code this list.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from packages.dataset_core.dataset_types import list_dataset_types

router = APIRouter(tags=["dataset_types"])


@router.get("/api/v1/dataset-types")
def get_dataset_types() -> list[dict[str, Any]]:
    """All 18 known dataset types with their real availability status."""
    return list_dataset_types()
