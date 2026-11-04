"""
Main FastAPI entry point for AI Dataset Engineering Platform.
"""
import logging
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
    AccessForbiddenError,
    DomainError,
    DomainValidationError,
    ImmutableVersionError,
    InvalidStateTransitionError,
    ProjectOwnershipError,
    PublishingBlockedError,
    QuotaExceededError,
    RateLimitExceededError,
    ResourceNotFoundError,
)
from packages.dataset_security.redaction import redact_sensitive_data
from services.api.config import settings
from services.api.routes import (
    annotations,
    assets,
    autolabel,
    dataset_types,
    datasets,
    detection_proposals,
    edits,
    ensemble,
    evaluation,
    exports,
    generate,
    generation,
    image_generation,
    inference,
    ingestion,
    projects,
    providers,
    records,
    review,
    security,
    sources,
    synthesis,
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
    # Settle generation jobs orphaned by the previous process. The runner is an in-process daemon
    # thread, so a restart would otherwise leave a job "running" forever and the UI polling it.
    from packages.generation_jobs.service import recover_interrupted_jobs

    settled_jobs = recover_interrupted_jobs()
    if settled_jobs:
        logging.getLogger(__name__).warning(
            "Settled %s generation job(s) interrupted by the previous process", settled_jobs
        )
    # Verify the schema on a real connection, then drop pooled connections created on this
    # startup thread. Without this, the first savepoint-based row import (CSV/JSONL/text, which
    # uses session.begin_nested() per row) can fail with sqlite "unable to open database file"
    # because the request thread reuses a connection that predates the freshly created schema.
    engine = get_engine()
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        connection.commit()
    engine.dispose()
    # Optional paid image-generation providers (OpenAI gpt-image-2, Meta muse-image-1.0).
    if settings.ENABLE_LIVE_IMAGE_PROVIDERS:
        from packages.provider_gateway.gateway import (
            ProviderGateway as ImageProviderGateway,
        )
        from packages.provider_gateway.image_generation import (
            build_live_image_providers,
        )

        image_gateway = ImageProviderGateway.get_instance()
        for image_provider in build_live_image_providers():
            image_gateway.register_provider(image_provider)
        # SAM 3.1 object detection uses the same Meta key on the Responses API.
        import os as _os

        from packages.provider_gateway.sam_provider import SamProvider

        meta_key = _os.environ.get("META_API_KEY", "").strip()
        if meta_key:
            image_gateway.register_provider(SamProvider(
                api_key=meta_key,
                base_url=_os.environ.get("META_BASE_URL", "https://api.meta.ai/v1"),
                models=[_os.environ.get("META_SAM_MODEL", "sam-3.1")],
            ))
    # Development-only: deterministic simulated experts so the ensemble/generation UI can be used
    # without any paid model calls. Explicitly opt-in via ALLOW_SIMULATED_PROVIDERS.
    if settings.ALLOW_SIMULATED_PROVIDERS and settings.ENVIRONMENT != "production":
        from packages.provider_gateway.gateway import ProviderGateway
        from packages.provider_gateway.simulated_provider import build_simulated_trio

        gateway = ProviderGateway.get_instance()
        for provider in build_simulated_trio():
            gateway.register_provider(provider)
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
        content={"error": {"code": exc.code, "message": exc.message, "details": redact_sensitive_data(exc.details)}},
    )


@app.exception_handler(AccessForbiddenError)
async def access_forbidden_handler(request: Request, exc: AccessForbiddenError):
    return JSONResponse(
        status_code=status.HTTP_403_FORBIDDEN,
        content={"error": {"code": exc.code, "message": exc.message, "details": redact_sensitive_data(exc.details)}},
    )


@app.exception_handler(QuotaExceededError)
async def quota_exceeded_handler(request: Request, exc: QuotaExceededError):
    return JSONResponse(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        content={"error": {"code": exc.code, "message": exc.message, "details": redact_sensitive_data(exc.details)}},
    )


@app.exception_handler(RateLimitExceededError)
async def rate_limit_handler(request: Request, exc: RateLimitExceededError):
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={"Retry-After": str(exc.retry_after)},
        content={"error": {"code": exc.code, "message": exc.message, "details": redact_sensitive_data(exc.details)}},
    )


@app.exception_handler(ImmutableVersionError)
async def immutable_version_handler(request: Request, exc: ImmutableVersionError):
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"error": {"code": exc.code, "message": exc.message, "details": redact_sensitive_data(exc.details)}},
    )


@app.exception_handler(PublishingBlockedError)
async def publishing_blocked_handler(request: Request, exc: PublishingBlockedError):
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": {"code": exc.code, "message": exc.message, "details": redact_sensitive_data(exc.details)}},
    )


@app.exception_handler(DomainError)
async def generic_domain_error_handler(request: Request, exc: DomainError):
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": {"code": exc.code, "message": exc.message, "details": redact_sensitive_data(exc.details)}},
    )


# Routers
app.include_router(projects.router)
app.include_router(security.router)
app.include_router(dataset_types.router)
app.include_router(detection_proposals.router)
app.include_router(datasets.router)
app.include_router(ingestion.router)
app.include_router(records.router)
app.include_router(annotations.router)
app.include_router(autolabel.router)
app.include_router(review.router)
app.include_router(assets.router)
app.include_router(inference.router)
app.include_router(validation.router)
app.include_router(versions.router)
app.include_router(edits.router)
app.include_router(exports.router)
app.include_router(generation.router)
app.include_router(generate.router)
app.include_router(image_generation.router)
app.include_router(sources.router)
app.include_router(synthesis.router)
app.include_router(ensemble.router)
app.include_router(evaluation.router)
app.include_router(providers.router)




# Health & Readiness Endpoints
@app.get("/health", tags=["System"])
@app.get("/api/v1/health", tags=["System"])
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
@app.get("/api/v1/readiness", tags=["System"])
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
