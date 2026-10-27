"""
Deterministic, zero-credential demo dataset seeder for AI Dataset Engineering Platform.
Populates a comprehensive multimodal project with:
  1. Text Classification (Customer Support Intents)
  2. Image Classification (Geometric Shapes)
  3. Object Detection (Autonomous Driving Bounding Boxes) with a published immutable Version 1.0.0.

Requires zero paid API keys or external services; 100% runnable offline.
"""
import io
import logging
import os

from PIL import Image, ImageDraw

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus, TaskType
from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetRecordModel,
    ProjectModel,
)
from packages.dataset_core.db.session import get_db_session, get_engine, init_database
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_io.ingestion_service import IngestionService
from packages.dataset_io.storage import LocalStorageBackend
from packages.dataset_versioning.service import VersioningService
from services.api.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] (seeder) %(message)s")
logger = logging.getLogger("seeder")


def _generate_synthetic_image(draw_shape: str = "circle", width: int = 256, height: int = 256, index: int = 1) -> bytes:
    """Generate a valid, deterministic synthetic test PNG image."""
    offset = (index * 7) % 30
    img = Image.new("RGB", (width, height), color=(240 - offset, 245, 250 - offset))
    draw = ImageDraw.Draw(img)

    if draw_shape == "circle":
        draw.ellipse([40 + offset, 40, width - 40, height - 40 - offset], fill=(59, 130 + offset, 246), outline=(29, 78, 216), width=3)
    elif draw_shape == "rectangle":
        draw.rectangle([50, 60 + offset, width - 50 - offset, height - 60], fill=(16, 185, 129 + offset), outline=(4, 120, 87), width=3)
    elif draw_shape == "triangle":
        draw.polygon([(width // 2, 40 + offset), (40, height - 40), (width - 40, height - 40)], fill=(245, 158 + offset, 11), outline=(180, 83, 9), width=3)
    elif draw_shape == "street":
        # Road scene simulation
        draw.rectangle([0, height // 2, width, height], fill=(100 + offset, 116, 139))
        draw.line([(width // 2 + offset, height // 2), (width // 2 + offset, height)], fill=(255, 255, 255), width=4)
        # Car proxy box
        draw.rectangle([60 + offset, height // 2 + 30, 140 + offset, height // 2 + 80], fill=(239, 68 + offset, 68))
        # Pedestrian proxy box
        draw.rectangle([180 - offset, height // 2 + 10, 210 - offset, height // 2 + 70], fill=(16, 185, 129))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def seed_demo_data(engine=None, storage_dir=None) -> dict[str, str]:
    """
    Populates the database with demo datasets.
    Returns mapping of created entity identifiers.
    """
    active_engine = engine or get_engine()
    init_database(active_engine)

    effective_storage_dir = storage_dir or settings.LOCAL_STORAGE_DIR
    os.makedirs(effective_storage_dir, exist_ok=True)
    storage = LocalStorageBackend(effective_storage_dir)

    logger.info("Seeding demo multimodal dataset...")

    with get_db_session(active_engine) as session:
        # 1. Project
        existing_proj = session.query(ProjectModel).filter_by(id="proj_demo_benchmark").first()
        if existing_proj:
            logger.info("Demo project already exists (ID: %s).", existing_proj.id)
            return {"project_id": existing_proj.id}

        proj = ProjectModel(
            id="proj_demo_benchmark",
            name="Multimodal AI Engineering Benchmark",
            description="Comprehensive benchmark project showcasing text classification, visual defect labeling, and autonomous vehicle object detection.",
            owner_id="usr_demo_lead",
        )
        session.add(proj)
        session.flush()
        logger.info("Created project: %s", proj.name)

        # 2. Text Classification Dataset
        ds_text = DatasetModel(
            id="ds_demo_text_support",
            project_id=proj.id,
            name="Customer Support Intent Benchmark",
            task_type=TaskType.TEXT_CLASSIFICATION.value,
            description="Curated user support inquiries labeled into intent categories for triage models.",
            annotation_instructions="Assign exactly one primary intent label: billing, technical_support, feature_request, or general_inquiry.",
            schema_version=1,
        )
        session.add(ds_text)
        session.flush()

        sample_texts = [
            ("I was charged twice for my subscription this month. Please issue a refund.", "billing", "train"),
            ("The application crashes whenever I try to upload a large CSV file.", "technical_support", "train"),
            ("Can you add dark mode and keyboard shortcuts to the annotation editor?", "feature_request", "train"),
            ("Where can I find documentation on the REST API rate limits?", "general_inquiry", "train"),
            ("My invoice does not match the annual discount promised during signup.", "billing", "val"),
            ("Receiving error code 500 when saving revisions in the canvas tool.", "technical_support", "test"),
        ]

        for i, (text, label, split) in enumerate(sample_texts, start=1):
            rec = DatasetRecordModel(
                id=f"rec_txt_demo_{i:03d}",
                dataset_id=ds_text.id,
                split=split,
                schema_version=1,
                extra_metadata={"source": "customer_portal", "char_count": len(text)},
            )
            session.add(rec)
            session.flush()

            AnnotationService.create_annotation(
                session=session,
                record_id=rec.id,
                payload={"text": text, "label": label},
                origin=AnnotationOrigin.HUMAN,
                confidence=1.0,
                status=ReviewStatus.APPROVED,
            )

        logger.info("Created Text Classification dataset with %d records.", len(sample_texts))

        # 3. Image Classification Dataset
        ds_image = DatasetModel(
            id="ds_demo_shapes_classification",
            project_id=proj.id,
            name="Synthetic Geometry & Shape Classifier",
            task_type=TaskType.IMAGE_CLASSIFICATION.value,
            description="Synthetic high-contrast geometric shape dataset for image recognition validation.",
            annotation_instructions="Identify the primary foreground geometric shape: circle, rectangle, or triangle.",
            schema_version=1,
        )
        session.add(ds_image)
        session.flush()

        shapes = [
            ("circle", "train"),
            ("rectangle", "train"),
            ("triangle", "train"),
            ("circle", "val"),
            ("rectangle", "test"),
        ]

        for i, (shape_name, split) in enumerate(shapes, start=1):
            img_bytes = _generate_synthetic_image(draw_shape=shape_name, index=i)
            report = IngestionService.ingest_bytes(
                session=session,
                dataset_id=ds_image.id,
                filename=f"shape_{shape_name}_{i:03d}.png",
                data=img_bytes,
                split=split,
                storage=storage,
            )
            if not report.accepted_items:
                logger.error("Ingestion failed: duplicates=%s, rejected=%s", report.duplicates, report.rejected_items)
            rec_id = report.accepted_items[0].record_id

            AnnotationService.create_annotation(
                session=session,
                record_id=rec_id,
                payload={"label": shape_name},
                origin=AnnotationOrigin.HUMAN,
                confidence=1.0,
                status=ReviewStatus.APPROVED,
            )

        logger.info("Created Image Classification dataset with %d assets.", len(shapes))

        # 4. Object Detection Dataset with Published Version 1.0.0
        ds_object = DatasetModel(
            id="ds_demo_autonomous_detection",
            project_id=proj.id,
            name="Autonomous Vehicle Street Scene Detection",
            task_type=TaskType.OBJECT_DETECTION.value,
            description="Simulated urban road scene imagery with localized bounding boxes for vehicles and pedestrians.",
            annotation_instructions="Draw tightly bound bounding boxes for all vehicles, pedestrians, and traffic signs.",
            schema_version=1,
        )
        session.add(ds_object)
        session.flush()

        scenes = [
            (
                "train",
                [
                    {"box_2d": [0.23, 0.61, 0.31, 0.20], "label": "car"},
                    {"box_2d": [0.70, 0.54, 0.12, 0.23], "label": "pedestrian"},
                ],
            ),
            (
                "train",
                [
                    {"box_2d": [0.15, 0.58, 0.35, 0.22], "label": "car"},
                ],
            ),
            (
                "val",
                [
                    {"box_2d": [0.30, 0.60, 0.25, 0.18], "label": "car"},
                    {"box_2d": [0.65, 0.52, 0.10, 0.25], "label": "pedestrian"},
                ],
            ),
            (
                "test",
                [
                    {"box_2d": [0.20, 0.62, 0.28, 0.21], "label": "car"},
                ],
            ),
        ]

        for i, (split, boxes) in enumerate(scenes, start=1):
            img_bytes = _generate_synthetic_image(draw_shape="street", index=i)
            report = IngestionService.ingest_bytes(
                session=session,
                dataset_id=ds_object.id,
                filename=f"street_scene_{i:03d}.png",
                data=img_bytes,
                split=split,
                storage=storage,
            )
            rec_id = report.accepted_items[0].record_id

            AnnotationService.create_annotation(
                session=session,
                record_id=rec_id,
                payload={"boxes": boxes},
                origin=AnnotationOrigin.HUMAN,
                confidence=1.0,
                status=ReviewStatus.APPROVED,
            )

        logger.info("Created Object Detection dataset with %d scene records.", len(scenes))

        # 5. Publish Immutable Version 1.0.0 for ds_object
        version = VersioningService.create_version(
            session=session,
            dataset_id=ds_object.id,
            version_tag="1.0.0",
            created_by="usr_demo_lead",
            storage=storage,
        )
        logger.info("Published Immutable Version 1.0.0 (ID: %s, Hash: %s...)", version.id, version.manifest_hash[:12])

        return {
            "project_id": proj.id,
            "text_dataset_id": ds_text.id,
            "image_dataset_id": ds_image.id,
            "object_dataset_id": ds_object.id,
            "published_version_id": version.id,
        }


if __name__ == "__main__":
    result = seed_demo_data()
    print("\n Demo dataset seeding complete!")
    for k, v in result.items():
        print(f"  {k}: {v}")
