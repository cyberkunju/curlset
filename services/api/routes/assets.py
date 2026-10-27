"""
Asset raw content streaming endpoint for rendering images and text in the UI.
"""
from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import AssetModel
from packages.dataset_core.db.session import get_db
from packages.dataset_core.exceptions import ResourceNotFoundError
from packages.dataset_io.storage import get_storage_backend

router = APIRouter(tags=["assets"])


@router.get("/api/v1/assets/{asset_id}/raw")
def get_raw_asset_content(
    asset_id: str,
    session: Session = Depends(get_db),
) -> Response:
    asset = session.scalar(select(AssetModel).where(AssetModel.id == asset_id))
    if not asset:
        raise ResourceNotFoundError("Asset", asset_id)

    backend = get_storage_backend()
    data = backend.read_bytes(asset.storage_key)

    headers = {
        "Content-Disposition": f'inline; filename="{asset.original_filename or asset.id}"',
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
    }
    return Response(content=data, media_type=asset.mime_type, headers=headers)
