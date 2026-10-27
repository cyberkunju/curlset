"""
API endpoints for safe multi-modal data ingestion and asset uploads.
"""
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import DatasetModel
from packages.dataset_core.db.session import get_db
from packages.dataset_core.exceptions import ResourceNotFoundError
from packages.dataset_io.ingestion_service import ImportReport, IngestionService
from services.api.config import settings

router = APIRouter(prefix="/api/v1/datasets", tags=["Ingestion"])


@router.post("/{dataset_id}/import/file", response_model=ImportReport, status_code=status.HTTP_200_OK)
async def import_file_to_dataset(
    dataset_id: str,
    file: UploadFile,
    split: str = Form("train"),
    session: Session = Depends(get_db),
):
    # Verify dataset exists
    dataset = session.scalar(select(DatasetModel).where(DatasetModel.id == dataset_id))
    if not dataset:
        raise ResourceNotFoundError("Dataset", dataset_id)

    # Read bytes safely with size check
    max_bytes = settings.MAX_UPLOAD_SIZE_BYTES
    data = await file.read(max_bytes + 1024)
    if len(data) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Uploaded file exceeds maximum limit of {max_bytes} bytes.",
        )

    filename = file.filename or "uploaded_file.bin"
    report = IngestionService.ingest_bytes(
        session=session,
        dataset_id=dataset_id,
        filename=filename,
        data=data,
        split=split,
    )
    return report
