"""
Shared pytest configuration and session fixtures.

Why this file exists: the repository historically had **no** ``conftest.py``. Every test module
used the default database (``DATABASE_URL`` from the environment, else
``sqlite:///./data/dataset_platform.db``) and implicitly relied on whichever module happened to run
first to create the schema. Consequences:

  * running a single module against a clean database failed with ``no such table: ...``;
  * results depended on collection order;
  * the developer database accumulated state between runs.

This session fixture creates the schema once per test session and ensures the local storage
directory exists, which makes the suite order-independent without changing any test behaviour.
Each test remains responsible for isolating its own entities (they use generated ids).
"""
from __future__ import annotations

import os

import pytest

from packages.dataset_core.db.session import get_engine, init_database
from services.api.config import settings


@pytest.fixture(scope="session", autouse=True)
def _ensure_database_schema() -> None:
    """Create tables + storage root once, before any test runs."""
    init_database(get_engine())
    if settings.STORAGE_BACKEND == "local":
        os.makedirs(settings.LOCAL_STORAGE_DIR, exist_ok=True)
    yield
