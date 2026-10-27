"""
API endpoints for safe multi-modal data ingestion and asset uploads.
"""
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from packages.dataset_core.db.session import get_db
from packages.dataset_io.ingestion_service import ImportReport, IngestionService
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import get_auth_user, verify_dataset_access
from packages.dataset_security.quotas import QuotaManager
from services.api.config import settings

router = APIRouter(prefix="/api/v1/datasets", tags=["Ingestion"])


@router.post("/{dataset_id}/import/file", response_model=ImportReport, status_code=status.HTTP_200_OK)
async def import_file_to_dataset(
    dataset_id: str,
    file: UploadFile,
    split: str = Form("train"),
    session: Session = Depends(get_db),
    user_id: str = Depends(get_auth_user),
):
    # Verify dataset exists and user has editor permissions
    dataset = verify_dataset_access(session, dataset_id, user_id, required_role="editor")

    # Read bytes safely with size check
    max_bytes = settings.MAX_UPLOAD_SIZE_BYTES
    data = await file.read(max_bytes + 1024)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Uploaded file exceeds maximum limit of {max_bytes} bytes.",
        )

    # Check project storage quota
    QuotaManager.check_storage_quota(session, dataset.project_id, len(data))

    filename = file.filename or "uploaded_file.bin"
    report = IngestionService.ingest_bytes(
        session=session,
        dataset_id=dataset_id,
        filename=filename,
        data=data,
        split=split,
    )

    AuditService.record_event(
        session=session,
        project_id=dataset.project_id,
        user_id=user_id,
        action="FILE_INGESTED",
        resource_type="Dataset",
        resource_id=dataset_id,
        details={"filename": filename, "byte_size": len(data), "split": split},
    )
    session.commit()

    return report

