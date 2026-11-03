"""
Database session management and connection lifecycle.
Supports SQLite (local zero-dependency) and PostgreSQL (production).
"""
import os
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from packages.dataset_core.db.base import Base

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_default_database_url() -> str:
    """Retrieve database URL from environment or return local default SQLite path."""
    return os.environ.get("DATABASE_URL", "sqlite:///./data/dataset_platform.db")


def get_engine(database_url: str | None = None) -> Engine:
    """Create or return the global SQLAlchemy engine with proper driver settings."""
    global _engine, _session_factory
    url = database_url or get_default_database_url()

    if _engine is not None and str(_engine.url) == url:
        return _engine

    is_sqlite = url.startswith("sqlite")
    connect_args = {}
    if is_sqlite:
        connect_args["check_same_thread"] = False
        # Ensure parent directory exists for SQLite file
        if url.startswith("sqlite:///") and not url.startswith("sqlite:///:memory:"):
            db_path = url.replace("sqlite:///", "")
            os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)

    _engine = create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=True,
    )

    if is_sqlite:
        # Enforce foreign key constraints in SQLite
        @event.listens_for(_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            # Keep SQLite's temporary tables/spill in memory and give the page cache a sane size.
            # Without this, a large import (hundreds of rows, each in its own SAVEPOINT) can spill
            # to an OS temp file and fail with "unable to open database file" in restricted
            # environments. temp_store=MEMORY removes that failure mode entirely.
            cursor.execute("PRAGMA temp_store=MEMORY")
            cursor.execute("PRAGMA cache_size=-16000")  # ~16 MB
            # Background generation jobs write progress while requests read: wait briefly on a
            # locked database instead of failing immediately.
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()

    _session_factory = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def _add_missing_sqlite_columns(engine: Engine) -> None:
    """Add columns introduced after a database was created.

    The project has no migration tool yet: ``create_all`` creates missing *tables* but never alters an
    existing one. Without this, a new column (e.g. the generation-job heartbeat) breaks every query on
    an existing dev database with "no such column". The operation is additive and idempotent, which is
    the safe subset for local-first SQLite; a real migration tool is still the follow-up for hosted
    deployments (see docs/EXECUTION_PLAN.md known limitations).
    """
    if engine.dialect.name != "sqlite":
        return
    additions: dict[str, dict[str, str]] = {
        "generation_jobs": {
            "updated_at": "DATETIME",
            "phase": "VARCHAR(32) DEFAULT 'queued'",
            "kind": "VARCHAR(32) DEFAULT 'generate'",
        },
    }
    with engine.begin() as connection:
        for table, columns in additions.items():
            existing = {
                row[1] for row in connection.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
            }
            if not existing:
                continue  # table does not exist yet; create_all handled it
            for name, ddl in columns.items():
                if name not in existing:
                    connection.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")


def init_database(engine: Engine | None = None) -> None:
    """Create all tables defined in models if they do not exist, then apply additive columns."""
    active_engine = engine or get_engine()
    Base.metadata.create_all(bind=active_engine)
    _add_missing_sqlite_columns(active_engine)


def reset_database(engine: Engine | None = None) -> None:
    """Drop and recreate all tables. Use only for explicit test reset or dev tear-down."""
    active_engine = engine or get_engine()
    Base.metadata.drop_all(bind=active_engine)
    Base.metadata.create_all(bind=active_engine)


@contextmanager
def get_db_session(engine: Engine | None = None) -> Generator[Session, None, None]:
    """Context manager for database sessions with automatic commit/rollback."""
    if _session_factory is None or (engine is not None and engine != _engine):
        get_engine(str(engine.url) if engine else None)

    assert _session_factory is not None
    session: Session = _session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency for injecting database session."""
    with get_db_session() as session:
        yield session


def close_engine() -> None:
    """Close and reset global engine and sessionmaker."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
        _engine = None
    _session_factory = None

