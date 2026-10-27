"""
Dataset Versioning API routes for creating immutable snapshots, retrieving manifests,
and downloading generated dataset cards.
"""
from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_core.domain_models import DatasetVersionContract
from packages.dataset_versioning.service import VersioningService

router = APIRouter(tags=["versioning"])


class CreateVersionRequest(BaseModel):
    version_tag: str | None = None
    force: bool = False


@router.post("/api/v1/datasets/{dataset_id}/versions", response_model=DatasetVersionContract)
def create_dataset_version(
    dataset_id: str,
    request: CreateVersionRequest,
    session: Session = Depends(get_db),
) -> DatasetVersionContract:
    """
    Freeze the current state of a dataset into an immutable, versioned snapshot.
    Executes automated quality audits and blocks publication if blocking issues exist.
    """
    version = VersioningService.create_version(
        session=session,
        dataset_id=dataset_id,
        version_tag=request.version_tag,
        force=request.force,
    )
    return DatasetVersionContract.model_validate(version)


@router.get("/api/v1/datasets/{dataset_id}/versions", response_model=list[DatasetVersionContract])
def list_dataset_versions(
    dataset_id: str,
    session: Session = Depends(get_db),
) -> list[DatasetVersionContract]:
    """List all immutable published versions of a dataset."""
    versions = VersioningService.list_versions(session=session, dataset_id=dataset_id)
    return [DatasetVersionContract.model_validate(v) for v in versions]


@router.get("/api/v1/versions/compare")
def compare_dataset_versions(
    version_a_id: str = Query(..., description="First version ID (baseline)"),
    version_b_id: str = Query(..., description="Second version ID (target)"),
    session: Session = Depends(get_db),
):
    """Compute a deterministic semantic diff between two immutable dataset versions."""
    diff = VersioningService.compare_versions(
        session=session, version_a_id=version_a_id, version_b_id=version_b_id
    )
    return diff


@router.get("/api/v1/versions/{version_id}", response_model=DatasetVersionContract)
def get_version_detail(
    version_id: str,
    session: Session = Depends(get_db),
) -> DatasetVersionContract:
    """Retrieve details and documentation for a specific dataset version."""
    version = VersioningService.get_version(session=session, version_id=version_id)
    return DatasetVersionContract.model_validate(version)


@router.get("/api/v1/versions/{version_id}/manifest")
def get_version_manifest(
    version_id: str,
    session: Session = Depends(get_db),
):
    """Retrieve the exact canonical cryptographic manifest for a dataset version."""
    manifest = VersioningService.get_version_manifest(session=session, version_id=version_id)
    return manifest


@router.get("/api/v1/versions/{version_id}/card")
def get_version_dataset_card(
    version_id: str,
    session: Session = Depends(get_db),
):
    """Retrieve the generated Markdown Dataset Card (README.md) for a dataset version."""
    version = VersioningService.get_version(session=session, version_id=version_id)
    return Response(
        content=version.documentation_markdown or "# No documentation available",
        media_type="text/markdown; charset=utf-8",
    )


@router.get("/api/v1/datasets/{dataset_id}/versions/{v1_id}/diff/{v2_id}")
def diff_dataset_versions_endpoint(
    dataset_id: str,
    v1_id: str,
    v2_id: str,
    session: Session = Depends(get_db),
):
    """
    Produce a full visual and statistical git-diff between two dataset versions.
    Includes class distribution deltas across splits and bounding-box spatial diffs.
    """
    return VersioningService.diff_dataset_versions(
        session=session, dataset_id=dataset_id, v1_id=v1_id, v2_id=v2_id
    )

