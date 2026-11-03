"""
Dataset Versioning Service managing immutable snapshot creation, manifest hashing,
version comparison, and documentation generation.
"""
import json
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from packages.dataset_core.annotation_selector import select_active_annotation
from packages.dataset_core.constants import AssetModality, AssetRole
from packages.dataset_core.db.models import (
    AssetModel,
    DatasetModel,
    DatasetRecordModel,
    DatasetVersionModel,
    RecordAssetModel,
    VersionItemModel,
)
from packages.dataset_core.exceptions import (
    PublishingBlockedError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_io.storage import StorageBackend, get_storage_backend
from packages.dataset_quality.engine import QualityEngine
from packages.dataset_versioning.doc_generator import generate_dataset_card_markdown
from packages.dataset_versioning.manifest import (
    DatasetVersionManifest,
    ManifestAnnotationItem,
    ManifestAssetItem,
    ManifestRecordItem,
    compute_manifest_hash,
    serialize_canonical_manifest,
)


def resolve_primary_image_asset(assets: list[dict] | None) -> tuple[dict | None, str | None]:
    """
    Resolve the intended primary image asset from explicit metadata per the repository contract:
    - Primary candidate: role is 'primary_image' and modality is 'image' or genuinely absent/empty (legacy).
    - Reject known non-image modalities ('text', 'audio', 'video', 'document') and non-empty unrecognized modalities.
    - A single asset with no role may be used as a compatibility fallback only when modality explicitly identifies it as an image.
    - A single asset missing both role and modality resolves as unavailable ('missing_source_asset').
    - Preserves ambiguity protection when multiple eligible primary images are present.
    - Returns (asset, None) on clean single resolution.
    - Returns (None, 'ambiguous_primary_image') if multiple candidates claim primary image role or multiple fallback images exist.
    - Returns (None, 'missing_source_asset') if no primary image can be resolved.
    """
    if not isinstance(assets, list) or not assets:
        return None, "missing_source_asset"

    def is_empty_val(val: any) -> bool:
        return val is None or (isinstance(val, str) and not val.strip())

    def is_image_modality(mod: any) -> bool:
        return isinstance(mod, str) and mod.strip().lower() == AssetModality.IMAGE.value

    # 1. Look for explicit primary_image role candidates
    primary_role_candidates = []
    for a in assets:
        if not isinstance(a, dict):
            continue
        role = a.get("role")
        mod = a.get("modality")
        # Eligible only when modality is 'image' or genuinely absent/empty for backward compatibility.
        # Reject known non-image modalities and non-empty unrecognized modality values.
        if (
            isinstance(role, str)
            and role.strip() == AssetRole.PRIMARY_IMAGE.value
            and (is_image_modality(mod) or is_empty_val(mod))
        ):
            primary_role_candidates.append(a)

    if len(primary_role_candidates) == 1:
        return primary_role_candidates[0], None
    if len(primary_role_candidates) > 1:
        return None, "ambiguous_primary_image"

    # If any asset explicitly declared role == 'primary_image' but was rejected due to an ineligible modality,
    # do NOT fall back to arbitrary assets.
    for a in assets:
        if isinstance(a, dict) and isinstance(a.get("role"), str) and a.get("role").strip() == AssetRole.PRIMARY_IMAGE.value:
            return None, "missing_source_asset"

    # 2. Fallback: single asset record where modality explicitly identifies it as an image
    if len(assets) == 1:
        a = assets[0]
        if isinstance(a, dict):
            role = a.get("role")
            mod = a.get("modality")
            role_empty_or_image = is_empty_val(role) or (isinstance(role, str) and role.strip() == "image")
            if role_empty_or_image and is_image_modality(mod):
                return a, None
        return None, "missing_source_asset"

    # 3. If multiple assets exist without any primary_image role:
    # Check if multiple images exist -> ambiguous; otherwise missing.
    image_modality_candidates = [
        a for a in assets if isinstance(a, dict) and is_image_modality(a.get("modality"))
    ]
    if len(image_modality_candidates) > 1:
        return None, "ambiguous_primary_image"

    return None, "missing_source_asset"


class VersioningService:
    """Manages creation, immutability, diffing, and retrieval of dataset versions."""

    resolve_primary_image_asset = staticmethod(resolve_primary_image_asset)

    @staticmethod
    def create_version(
        session: Session,
        dataset_id: str,
        version_tag: str | None = None,
        created_by: str = "system",
        force: bool = False,
        storage: StorageBackend | None = None,
    ) -> DatasetVersionModel:
        """
        Freeze current dataset state into an immutable, cryptographically verifiable version.
        Runs quality audits prior to freezing; blocks publication if blocking issues exist.
        """
        dataset = session.get(DatasetModel, dataset_id)
        if not dataset:
            raise ResourceNotFoundError("Dataset", dataset_id)

        storage_backend = storage or get_storage_backend()

        # 1. Run Quality Validation Engine
        report = QualityEngine.validate_dataset(session=session, dataset_id=dataset_id, storage=storage_backend)
        if not report.is_publishable and not force:
            blocking_findings = [
                f.model_dump() for f in report.findings if f.severity == "blocking"
            ]
            raise PublishingBlockedError(
                message=f"Publication blocked: {report.blocking_count} blocking issue(s) detected. Run Quality Engine to inspect and resolve before publishing.",
                blocking_count=report.blocking_count,
                findings=blocking_findings,
            )

        # 2. Determine Version Number and Tag
        max_num = session.execute(
            select(func.max(DatasetVersionModel.version_number)).where(
                DatasetVersionModel.dataset_id == dataset_id
            )
        ).scalar()
        next_version_num = (max_num or 0) + 1
        tag = version_tag.strip() if version_tag and version_tag.strip() else f"v{next_version_num}.0.0"

        # Check tag uniqueness for this dataset
        existing_tag = session.execute(
            select(DatasetVersionModel).where(
                DatasetVersionModel.dataset_id == dataset_id,
                DatasetVersionModel.version_tag == tag,
            )
        ).scalar_one_or_none()
        if existing_tag:
            tag = f"{tag}-rev{next_version_num}"

        # 3. Query all dataset records in deterministic order
        records = (
            session.execute(
                select(DatasetRecordModel)
                .where(DatasetRecordModel.dataset_id == dataset_id)
                .order_by(DatasetRecordModel.id)
            )
            .scalars()
            .all()
        )

        version_id = generate_id("ver")
        manifest_records: list[ManifestRecordItem] = []
        version_items: list[VersionItemModel] = []

        for record in records:
            # Annotation item — canonical selector, identical to the quality engine's
            # choice, so the freeze can never pin a different annotation than validated.
            manifest_ann = None
            revision_id = None
            active_ann = select_active_annotation(record.annotations)
            if active_ann:
                ann = active_ann
                revision_id = ann.current_revision_id or ann.id
                rev_num = len(ann.revisions) if ann.revisions else 1

                manifest_ann = ManifestAnnotationItem(
                    annotation_id=ann.id,
                    revision_id=revision_id,
                    revision_number=rev_num,
                    origin=ann.origin,
                    status=ann.status,
                    payload=ann.payload or {},
                    confidence=ann.confidence,
                    consensus_score=ann.consensus_score,
                )

            # Asset items
            record_assets = (
                session.execute(
                    select(RecordAssetModel, AssetModel)
                    .join(AssetModel, RecordAssetModel.asset_id == AssetModel.id)
                    .where(RecordAssetModel.record_id == record.id)
                    .order_by(RecordAssetModel.position)
                )
                .all()
            )

            manifest_assets: list[ManifestAssetItem] = []
            asset_ids: list[str] = []
            for ra, asset in record_assets:
                asset_ids.append(asset.id)
                manifest_assets.append(
                    ManifestAssetItem(
                        asset_id=asset.id,
                        role=ra.role,
                        modality=asset.modality,
                        mime_type=asset.mime_type,
                        byte_size=asset.byte_size,
                        sha256=asset.sha256,
                        storage_key=asset.storage_key,
                        original_filename=asset.original_filename,
                        dimensions=asset.dimensions,
                    )
                )

            manifest_records.append(
                ManifestRecordItem(
                    record_id=record.id,
                    external_key=record.external_key,
                    split=record.split,
                    # TEXT-MVP D1: the input text lives in record metadata and is
                    # frozen verbatim in the immutable manifest.
                    metadata=dict(record.extra_metadata or {}),
                    annotation=manifest_ann,
                    assets=manifest_assets,
                )
            )

            # Version item model
            version_items.append(
                VersionItemModel(
                    id=generate_id("vitem"),
                    version_id=version_id,
                    record_id=record.id,
                    annotation_revision_id=revision_id,
                    asset_ids=asset_ids,
                )
            )

        # 4. Construct canonical manifest
        now_iso = datetime.now(UTC).isoformat()
        manifest = DatasetVersionManifest(
            manifest_version="1.0.0",
            version_id=version_id,
            dataset_id=dataset_id,
            dataset_name=dataset.name,
            version_tag=tag,
            version_number=next_version_num,
            task_type=dataset.task_type,
            schema_version=dataset.schema_version,
            created_at=now_iso,
            created_by=created_by,
            record_count=len(records),
            quality_summary=report.model_dump(),
            records=manifest_records,
        )

        manifest_bytes = serialize_canonical_manifest(manifest)
        manifest_hash = compute_manifest_hash(manifest_bytes)

        # 5. Save manifest to storage
        manifest_storage_key = f"manifests/{dataset_id}/{version_id}_{manifest_hash[:12]}.json"
        storage_backend.write_bytes(manifest_storage_key, manifest_bytes)

        # 6. Generate dataset card documentation
        dataset_card = generate_dataset_card_markdown(
            manifest=manifest,
            dataset_description=dataset.description,
            annotation_instructions=dataset.annotation_instructions,
        )

        # 7. Persist DatasetVersionModel and VersionItems
        version_model = DatasetVersionModel(
            id=version_id,
            dataset_id=dataset_id,
            version_number=next_version_num,
            version_tag=tag,
            manifest_hash=manifest_hash,
            manifest_storage_key=manifest_storage_key,
            record_count=len(records),
            schema_version=dataset.schema_version,
            quality_summary=report.model_dump(),
            documentation_markdown=dataset_card,
            is_published=True,
            created_by=created_by,
        )
        session.add(version_model)
        for vi in version_items:
            session.add(vi)

        session.commit()
        session.refresh(version_model)
        return version_model

    @staticmethod
    def list_versions(session: Session, dataset_id: str) -> list[DatasetVersionModel]:
        """List all published versions of a dataset ordered newest to oldest."""
        return (
            session.execute(
                select(DatasetVersionModel)
                .where(DatasetVersionModel.dataset_id == dataset_id)
                .order_by(DatasetVersionModel.version_number.desc())
            )
            .scalars()
            .all()
        )

    @staticmethod
    def get_version(session: Session, version_id: str) -> DatasetVersionModel:
        """Retrieve a specific dataset version."""
        version = session.get(DatasetVersionModel, version_id)
        if not version:
            raise ResourceNotFoundError("DatasetVersion", version_id)
        return version

    @staticmethod
    def get_version_manifest(session: Session, version_id: str) -> dict:
        """Retrieve the exact canonical manifest content for a version."""
        version = VersioningService.get_version(session, version_id)
        storage = get_storage_backend()
        data_bytes = storage.read_bytes(version.manifest_storage_key)
        return json.loads(data_bytes.decode("utf-8"))

    @staticmethod
    def compare_versions(
        session: Session, version_a_id: str, version_b_id: str
    ) -> dict:
        """
        Produce a deterministic semantic diff between two immutable versions:
        identifies added records, removed records, and updated annotation revisions.
        """
        v_a = VersioningService.get_version(session, version_a_id)
        v_b = VersioningService.get_version(session, version_b_id)

        items_a = {
            item.record_id: item.annotation_revision_id for item in v_a.version_items
        }
        items_b = {
            item.record_id: item.annotation_revision_id for item in v_b.version_items
        }

        records_a = set(items_a.keys())
        records_b = set(items_b.keys())

        added_record_ids = sorted(records_b - records_a)
        removed_record_ids = sorted(records_a - records_b)
        common_records = records_a & records_b

        updated_annotation_record_ids = [
            rid for rid in sorted(common_records) if items_a[rid] != items_b[rid]
        ]

        return {
            "version_a": {
                "id": v_a.id,
                "tag": v_a.version_tag,
                "version_number": v_a.version_number,
                "record_count": v_a.record_count,
                "manifest_hash": v_a.manifest_hash,
            },
            "version_b": {
                "id": v_b.id,
                "tag": v_b.version_tag,
                "version_number": v_b.version_number,
                "record_count": v_b.record_count,
                "manifest_hash": v_b.manifest_hash,
            },
            "records_added": added_record_ids,
            "records_removed": removed_record_ids,
            "annotations_updated": updated_annotation_record_ids,
            "net_record_change": len(records_b) - len(records_a),
        }

    @staticmethod
    def diff_dataset_versions(
        session: Session, dataset_id: str, v1_id: str, v2_id: str
    ) -> dict:
        """
        Produce a comprehensive visual and statistical git-diff between two dataset versions:
        - added_records, removed_records, split_changed_records, annotation_modified_records
        - Class distribution delta table across train/val/test
        - Spatial bounding box diffs with mean IoU shift
        """
        v1 = VersioningService.get_version(session, v1_id)
        v2 = VersioningService.get_version(session, v2_id)
        if v1.dataset_id != dataset_id or v2.dataset_id != dataset_id:
            raise ResourceNotFoundError("DatasetVersion", f"Versions do not belong to dataset '{dataset_id}'")

        m1 = VersioningService.get_version_manifest(session, v1_id)
        m2 = VersioningService.get_version_manifest(session, v2_id)

        rec_map_1 = {r["record_id"]: r for r in m1.get("records", [])}
        rec_map_2 = {r["record_id"]: r for r in m2.get("records", [])}

        ids_1 = set(rec_map_1.keys())
        ids_2 = set(rec_map_2.keys())

        added_ids = sorted(ids_2 - ids_1)
        removed_ids = sorted(ids_1 - ids_2)
        common_ids = sorted(ids_1 & ids_2)

        added_records = [rec_map_2[rid] for rid in added_ids]
        removed_records = [rec_map_1[rid] for rid in removed_ids]

        split_changed_records = []
        annotation_modified_records = []
        spatial_diffs = []
        total_iou_sum = 0.0
        spatial_comparable_count = 0
        spatial_excluded_count = 0
        from collections import defaultdict
        exclusion_breakdown: dict[str, int] = defaultdict(int)

        # Helper for single box IoU in common pixel coordinate frame
        def compute_box_iou(b1: dict, b2: dict) -> float:
            x1, y1 = float(b1.get("x", 0)), float(b1.get("y", 0))
            w1, h1 = float(b1.get("w", b1.get("width", 0))), float(b1.get("h", b1.get("height", 0)))
            x2, y2 = float(b2.get("x", 0)), float(b2.get("y", 0))
            w2, h2 = float(b2.get("w", b2.get("width", 0))), float(b2.get("h", b2.get("height", 0)))

            xa = max(x1, x2)
            ya = max(y1, y2)
            xb = min(x1 + w1, x2 + w2)
            yb = min(y1 + h1, y2 + h2)

            inter = max(0.0, xb - xa) * max(0.0, yb - ya)
            area1 = w1 * h1
            area2 = w2 * h2
            denom = area1 + area2 - inter
            return round(inter / denom, 4) if denom > 0 else 0.0

        def parse_dims(d: any) -> tuple[float, float] | None:
            if isinstance(d, dict):
                w = d.get("width")
                h = d.get("height")
                if isinstance(w, (int, float)) and isinstance(h, (int, float)) and w > 0 and h > 0:
                    return (float(w), float(h))
            return None

        for rid in common_ids:
            r1 = rec_map_1[rid]
            r2 = rec_map_2[rid]

            # Split change check
            if r1.get("split") != r2.get("split"):
                split_changed_records.append({
                    "record_id": rid,
                    "split_v1": r1.get("split"),
                    "split_v2": r2.get("split"),
                })

            p1 = r1.get("annotation", {}).get("payload", {}) if r1.get("annotation") else {}
            p2 = r2.get("annotation", {}).get("payload", {}) if r2.get("annotation") else {}

            if p1 != p2:
                annotation_modified_records.append({
                    "record_id": rid,
                    "payload_v1": p1,
                    "payload_v2": p2,
                    "status_v1": r1.get("annotation", {}).get("status"),
                    "status_v2": r2.get("annotation", {}).get("status"),
                })

            # Check if object detection with spatial boxes
            boxes_1 = p1.get("boxes", []) if isinstance(p1.get("boxes"), list) else []
            boxes_2 = p2.get("boxes", []) if isinstance(p2.get("boxes"), list) else []

            if boxes_1 or boxes_2:
                # Resolve primary image assets for version 1 and version 2 independently from explicit metadata
                assets_1 = r1.get("assets", [])
                assets_2 = r2.get("assets", [])
                asset_1, err_1 = resolve_primary_image_asset(assets_1)
                asset_2, err_2 = resolve_primary_image_asset(assets_2)

                asset_id_1 = asset_1.get("asset_id") if asset_1 else None
                asset_id_2 = asset_2.get("asset_id") if asset_2 else None
                asset_url_1 = f"/api/v1/assets/{asset_id_1}/file" if asset_id_1 else None
                asset_url_2 = f"/api/v1/assets/{asset_id_2}/file" if asset_id_2 else None
                same_asset = bool(asset_id_1 and asset_id_2 and asset_id_1 == asset_id_2)

                primary_asset = asset_2 if asset_2 else asset_1
                asset_url = asset_url_2 or asset_url_1

                # Establish comparability per requirements:
                # 1. Source asset identity & unambiguous primary image resolution
                comparable = True
                exclusion_reason = None

                if err_1 == "ambiguous_primary_image" or err_2 == "ambiguous_primary_image":
                    comparable = False
                    exclusion_reason = "ambiguous_primary_image"
                elif not asset_id_1 or not asset_id_2:
                    comparable = False
                    exclusion_reason = "missing_source_asset"
                elif not same_asset:
                    comparable = False
                    exclusion_reason = "different_source_assets"

                # 2. Coordinate systems
                cs1 = p1.get("coordinate_system")
                cs2 = p2.get("coordinate_system")
                if comparable and (cs1 not in ("pixel-intrinsic", "normalized") or cs2 not in ("pixel-intrinsic", "normalized")):
                    comparable = False
                    exclusion_reason = "uncalibrated_coordinates"

                # 3. Dimensions and dimension conflict check
                d_img1 = parse_dims(p1.get("image_dimensions"))
                d_ast1 = parse_dims(asset_1.get("dimensions") if asset_1 else None)
                d_img2 = parse_dims(p2.get("image_dimensions"))
                d_ast2 = parse_dims(asset_2.get("dimensions") if asset_2 else None)

                reliable_dims = None
                if comparable:
                    # Check intra-version conflict
                    if (d_img1 and d_ast1 and d_img1 != d_ast1) or (d_img2 and d_ast2 and d_img2 != d_ast2):
                        comparable = False
                        exclusion_reason = "conflicting_dimensions"
                    else:
                        d1 = d_img1 or d_ast1
                        d2 = d_img2 or d_ast2
                        # Check inter-version conflict (since same_asset is True)
                        if d1 and d2 and d1 != d2:
                            comparable = False
                            exclusion_reason = "conflicting_dimensions"
                        else:
                            reliable_dims = d1 or d2
                            if not reliable_dims:
                                comparable = False
                                exclusion_reason = "missing_dimensions"

                rec_iou = None
                rec_shift = None

                if comparable and reliable_dims:
                    w_src, h_src = reliable_dims

                    def convert_boxes(b_list: list, cs: str, w_dim: float, h_dim: float) -> list[dict]:
                        res = []
                        for b in b_list:
                            bx = float(b.get("x", 0))
                            by = float(b.get("y", 0))
                            bw = float(b.get("w", b.get("width", 0)))
                            bh = float(b.get("h", b.get("height", 0)))
                            if cs == "normalized":
                                bx *= w_dim
                                by *= h_dim
                                bw *= w_dim
                                bh *= h_dim
                            res.append({
                                "label": b.get("label"),
                                "x": bx,
                                "y": by,
                                "w": bw,
                                "h": bh,
                            })
                        return res

                    cb1 = convert_boxes(boxes_1, cs1, w_src, h_src)
                    cb2 = convert_boxes(boxes_2, cs2, w_src, h_src)
                    n1 = len(cb1)
                    n2 = len(cb2)

                    if n1 == 0 and n2 == 0:
                        rec_iou = 1.0
                    elif n1 == 0 or n2 == 0:
                        rec_iou = 0.0
                    else:
                        # Platform Custom Greedy Box-Matching Metric:
                        # Evaluates pairwise spatial alignment between version 1 and version 2 bounding boxes
                        # sharing identical class labels.
                        #
                        # Algorithmic Complexity:
                        # - Let N1 = len(cb1) (number of boxes in v1), N2 = len(cb2) (number of boxes in v2).
                        # - Let K be the number of same-label candidate box pairs with pairwise IoU > 0.
                        #   In the worst case (all boxes share identical labels and pairwise overlap), K = N1 * N2.
                        # - Time Complexity:
                        #   1. Candidate pair generation: O(N1 * N2) pairwise comparisons and IoU calculations.
                        #   2. Candidate pair sorting: O(K log K) <= O((N1 * N2) log(N1 * N2)).
                        #      For N1 ~ N2 = N, this is O(N^2 log N) worst-case time.
                        #   3. Greedy assignment scan: O(K) iterations with O(1) hash set membership lookups.
                        #   Total worst-case time complexity: O(N1 * N2 + K log K) <= O(N^2 log N).
                        # - Space Complexity:
                        #   Stores K candidate tuples and matched index sets: O(K + N1 + N2) <= O(N1 * N2) worst case.
                        #
                        # Metric Semantics & Distinction:
                        # - This is the platform's custom greedy box-matching metric for version comparison.
                        # - It is distinct from standardized object-detection benchmark metrics (such as PASCAL VOC
                        #   mAP@0.50 or COCO AP@[.50:.95]), which rank confidence-scored predictions against ground
                        #   truth across an entire dataset using precision-recall curves. Here, neither version is
                        #   designated as ground truth; the metric measures symmetric geometric shift between versions.
                        # - Note: Greedy 1-to-1 matching is a heuristic approximation that prioritizes highest-overlap
                        #   pairs first and is not guaranteed to achieve the global maximum-weight bipartite matching
                        #   (which would require the O(N^3) Hungarian / Kuhn-Munkres algorithm).
                        candidates = []
                        for idx1, b1 in enumerate(cb1):
                            lbl1 = b1.get("label")
                            for idx2, b2 in enumerate(cb2):
                                if lbl1 == b2.get("label"):
                                    iou_val = compute_box_iou(b1, b2)
                                    if iou_val > 0.0:
                                        candidates.append((iou_val, idx1, idx2))

                        candidates.sort(key=lambda x: x[0], reverse=True)
                        matched_v1 = set()
                        matched_v2 = set()
                        matched_scores = []
                        for iou_val, idx1, idx2 in candidates:
                            if idx1 not in matched_v1 and idx2 not in matched_v2:
                                matched_v1.add(idx1)
                                matched_v2.add(idx2)
                                matched_scores.append(iou_val)

                        m = len(matched_scores)
                        # Union of box instances: matched pairs + unmatched v1 + unmatched v2
                        total_instances = n1 + n2 - m
                        rec_iou = round(sum(matched_scores) / total_instances, 4) if total_instances > 0 else 0.0

                    rec_shift = round(1.0 - rec_iou, 4)
                    total_iou_sum += rec_iou
                    spatial_comparable_count += 1
                else:
                    spatial_excluded_count += 1
                    if exclusion_reason:
                        exclusion_breakdown[exclusion_reason] += 1

                spatial_diffs.append({
                    "record_id": rid,
                    "asset_id_v1": asset_id_1,
                    "asset_id_v2": asset_id_2,
                    "asset_url_v1": asset_url_1,
                    "asset_url_v2": asset_url_2,
                    "asset_url": asset_url,
                    "same_asset": same_asset,
                    "boxes_v1": boxes_1,
                    "boxes_v2": boxes_2,
                    "mean_iou": rec_iou,
                    "iou_shift": rec_shift,
                    "iou_status": "comparable" if comparable else "unavailable",
                    "exclusion_reason": exclusion_reason,
                    "coordinate_system_v1": cs1,
                    "coordinate_system_v2": cs2,
                    "image_dimensions_v1": p1.get("image_dimensions"),
                    "image_dimensions_v2": p2.get("image_dimensions"),
                    "asset_dimensions_v1": asset_1.get("dimensions") if asset_1 else None,
                    "asset_dimensions_v2": asset_2.get("dimensions") if asset_2 else None,
                    "asset_dimensions": primary_asset.get("dimensions") if primary_asset else None,
                })

        # Class distribution delta table across train/val/test
        cls_split_1: dict[str, dict[str, int]] = defaultdict(lambda: {"train": 0, "val": 0, "test": 0})
        cls_split_2: dict[str, dict[str, int]] = defaultdict(lambda: {"train": 0, "val": 0, "test": 0})

        def record_classes(r: dict, store: dict):
            sp = r.get("split", "train")
            if sp not in {"train", "val", "test"}:
                sp = "train"
            pay = r.get("annotation", {}).get("payload", {}) if r.get("annotation") else {}
            if "label" in pay and isinstance(pay["label"], str):
                store[pay["label"]][sp] += 1
            for b in pay.get("boxes", []):
                if "label" in b and isinstance(b["label"], str):
                    store[b["label"]][sp] += 1

        for r in rec_map_1.values():
            record_classes(r, cls_split_1)
        for r in rec_map_2.values():
            record_classes(r, cls_split_2)

        all_classes = sorted(set(cls_split_1.keys()) | set(cls_split_2.keys()))
        class_delta_table = []
        for c in all_classes:
            row = {"class_name": c}
            for sp in ["train", "val", "test"]:
                v1_cnt = cls_split_1[c][sp]
                v2_cnt = cls_split_2[c][sp]
                row[sp] = {
                    "v1": v1_cnt,
                    "v2": v2_cnt,
                    "delta": v2_cnt - v1_cnt,
                }
            class_delta_table.append(row)

        mean_iou_overall = (
            round(total_iou_sum / spatial_comparable_count, 4)
            if spatial_comparable_count > 0
            else None
        )
        mean_iou_shift_overall = (
            round(1.0 - mean_iou_overall, 4)
            if mean_iou_overall is not None
            else None
        )

        return {
            "version_v1": {
                "id": v1.id,
                "version_tag": v1.version_tag,
                "version_number": v1.version_number,
                "record_count": v1.record_count,
            },
            "version_v2": {
                "id": v2.id,
                "version_tag": v2.version_tag,
                "version_number": v2.version_number,
                "record_count": v2.record_count,
            },
            "summary": {
                "records_added": len(added_records),
                "records_removed": len(removed_records),
                "splits_changed": len(split_changed_records),
                "annotations_modified": len(annotation_modified_records),
                "mean_iou": mean_iou_overall,
                "mean_iou_shift": mean_iou_shift_overall,
                "spatial_records_compared": spatial_comparable_count,
                "spatial_records_excluded": spatial_excluded_count,
                "spatial_exclusion_reasons": dict(exclusion_breakdown),
            },
            "added_records": added_records,
            "removed_records": removed_records,
            "split_changed_records": split_changed_records,
            "annotation_modified_records": annotation_modified_records,
            "class_distribution_deltas": class_delta_table,
            "spatial_diffs": spatial_diffs,
        }
