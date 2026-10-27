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
            cursor.close()

    _session_factory = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def init_database(engine: Engine | None = None) -> None:
    """Create all tables defined in models if they do not exist."""
    active_engine = engine or get_engine()
    Base.metadata.create_all(bind=active_engine)


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

