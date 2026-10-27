"""
Main FastAPI entry point for AI Dataset Engineering Platform.
"""
import os
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from packages.dataset_core.db.session import get_engine, init_database
from packages.dataset_core.exceptions import (
    DomainError,
    DomainValidationError,
    ImmutableVersionError,
    InvalidStateTransitionError,
    ProjectOwnershipError,
    PublishingBlockedError,
    ResourceNotFoundError,
)
from services.api.config import settings
from services.api.routes import (
    annotations,
    assets,
    datasets,
    inference,
    ingestion,
    projects,
    records,
    validation,
    versions,
)

START_TIME = time.time()




@asynccontextmanager
async def lifespan(app: FastAPI):
    # Safe startup initialization: ensure database tables & local storage folder exist
    init_database()
    if settings.STORAGE_BACKEND == "local":
        os.makedirs(settings.LOCAL_STORAGE_DIR, exist_ok=True)
    yield


app = FastAPI(
    title="AI Dataset Engineering Platform API",
    version="0.1.0",
    description="Multimodal dataset engineering workbench for training-ready data.",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception Handlers
@app.exception_handler(ResourceNotFoundError)
async def resource_not_found_handler(request: Request, exc: ResourceNotFoundError):
    return JSONResponse(
        status_code=status.HTTP_404_NOT_FOUND,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(DomainValidationError)
async def domain_validation_handler(request: Request, exc: DomainValidationError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(InvalidStateTransitionError)
async def state_transition_handler(request: Request, exc: InvalidStateTransitionError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(ProjectOwnershipError)
async def project_ownership_handler(request: Request, exc: ProjectOwnershipError):
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(ImmutableVersionError)
async def immutable_version_handler(request: Request, exc: ImmutableVersionError):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(PublishingBlockedError)
async def publishing_blocked_handler(request: Request, exc: PublishingBlockedError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


@app.exception_handler(DomainError)
async def generic_domain_error_handler(request: Request, exc: DomainError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


# Routers
app.include_router(projects.router)
app.include_router(datasets.router)
app.include_router(ingestion.router)
app.include_router(records.router)
app.include_router(annotations.router)
app.include_router(assets.router)
app.include_router(inference.router)
app.include_router(validation.router)
app.include_router(versions.router)




# Health & Readiness Endpoints
@app.get("/health", tags=["System"])

def health_check() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "ai-dataset-engineering-platform-api",
        "version": "0.1.0",
        "environment": settings.ENVIRONMENT,
        "privacy_mode": settings.PRIVACY_MODE,
        "storage_backend": settings.STORAGE_BACKEND,
        "uptime_seconds": round(time.time() - START_TIME, 2),
    }


@app.get("/readiness", tags=["System"])
def readiness_check() -> dict[str, Any]:
    # 1. Database check
    db_ok = False
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as e:  # noqa: BLE001
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "database": f"unhealthy: {e!s}"},
        )

    # 2. Storage check
    storage_ok = False
    try:
        if settings.STORAGE_BACKEND == "local":
            os.makedirs(settings.LOCAL_STORAGE_DIR, exist_ok=True)
            test_file = os.path.join(settings.LOCAL_STORAGE_DIR, ".write_probe")
            with open(test_file, "w", encoding="utf-8") as f:
                f.write("probe")
            os.remove(test_file)
            storage_ok = True
    except Exception as e:  # noqa: BLE001
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "storage": f"unhealthy: {e!s}"},
        )


    return {
        "status": "ready",
        "database": "connected" if db_ok else "failed",
        "storage": "accessible" if storage_ok else "failed",
    }
