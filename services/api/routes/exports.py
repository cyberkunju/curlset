"""
Dataset Export API routes for generating and downloading reproducible, version-bound archives.
"""
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import DatasetVersionModel
from packages.dataset_core.db.session import get_db
from packages.dataset_core.domain_models import ExportArtifactContract
from packages.dataset_core.exceptions import ResourceNotFoundError
from packages.dataset_export.service import ExportService
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_dataset_access

router = APIRouter(tags=["export"])


class ExportRequest(BaseModel):
    format: str = "jsonl"


@router.post("/api/v1/versions/{version_id}/exports", response_model=ExportArtifactContract)
def create_version_export(
    version_id: str,
    request: ExportRequest,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> ExportArtifactContract:
    """
    Generate a reproducible export package bound strictly to an immutable version.
    Produces a self-contained ZIP archive with formatted data, manifest, and README card.
    """
    version = session.get(DatasetVersionModel, version_id)
    if not version:
        raise ResourceNotFoundError("DatasetVersion", version_id)

    dataset = verify_dataset_access(session, version.dataset_id, user_id, required_role="editor")

    artifact = ExportService.export_dataset_version(
        session=session,
        version_id=version_id,
        format_str=request.format,
    )

    AuditService.record_event(
        session=session,
        project_id=dataset.project_id,
        user_id=user_id,
        action="EXPORT_CREATED",
        resource_type="ExportArtifact",
        resource_id=artifact.id,
        details={"version_id": version_id, "format": request.format, "byte_size": artifact.byte_size},
    )
    session.commit()

    return ExportArtifactContract.model_validate(artifact)


@router.get("/api/v1/versions/{version_id}/exports", response_model=list[ExportArtifactContract])
def list_version_exports(
    version_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
) -> list[ExportArtifactContract]:
    """List all export artifacts generated for a dataset version."""
    version = session.get(DatasetVersionModel, version_id)
    if not version:
        raise ResourceNotFoundError("DatasetVersion", version_id)

    verify_dataset_access(session, version.dataset_id, user_id, required_role="viewer")

    artifacts = ExportService.list_version_exports(session=session, version_id=version_id)
    return [ExportArtifactContract.model_validate(a) for a in artifacts]


@router.get("/api/v1/exports/{artifact_id}/download")
def download_export_artifact(
    artifact_id: str,
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
):
    """Download the binary ZIP package for an export artifact."""
    artifact, data_bytes = ExportService.get_export_artifact(session=session, artifact_id=artifact_id)
    version = session.get(DatasetVersionModel, artifact.version_id)
    if version:
        dataset = verify_dataset_access(session, version.dataset_id, user_id, required_role="viewer")
        AuditService.record_event(
            session=session,
            project_id=dataset.project_id,
            user_id=user_id,
            action="EXPORT_DOWNLOADED",
            resource_type="ExportArtifact",
            resource_id=artifact_id,
            details={"format": artifact.format, "byte_size": artifact.byte_size},
        )
        session.commit()

    filename = f"dataset_export_{artifact.version_id}_{artifact.format}.zip"
    return Response(
        content=data_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Artifact-SHA256": artifact.sha256,
        },
    )

