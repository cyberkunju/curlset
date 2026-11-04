"""
Deterministic, zero-credential demo dataset seeder for AI Dataset Engineering Platform.
Populates a comprehensive multimodal project with:
  1. Text Classification (Customer Support Intents)
  2. Image Classification (Realistic Visual Labels)
  3. Object Detection (Localized 2D Bounding Boxes) with a published immutable Version 1.0.0.

Requires zero paid API keys or external services; 100% runnable offline.
"""
import io
import logging
import os
import sys
from pathlib import Path

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

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "demo_images"


def _load_or_generate_image(filename: str, fallback_shape: str = "circle", index: int = 1) -> bytes:
    """Load high-quality realistic image asset from fixtures, or fallback to synthetic generation."""
    fixture_path = FIXTURES_DIR / filename
    if fixture_path.exists():
        try:
            return fixture_path.read_bytes()
        except OSError as e:
            logger.warning("Could not read fixture %s: %s. Using synthetic fallback.", fixture_path, e)

    return _generate_synthetic_image(draw_shape=fallback_shape, index=index)


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
        draw.rectangle([0, height // 2, width, height], fill=(100 + offset, 116, 139))
        draw.line([(width // 2 + offset, height // 2), (width // 2 + offset, height)], fill=(255, 255, 255), width=4)
        draw.rectangle([60 + offset, height // 2 + 30, 140 + offset, height // 2 + 80], fill=(239, 68 + offset, 68))
        draw.rectangle([180 - offset, height // 2 + 10, 210 - offset, height // 2 + 70], fill=(16, 185, 129))

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def seed_demo_data(engine=None, storage_dir=None, reset: bool = False) -> dict[str, str]:
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
            if reset:
                logger.info("Reset requested. Removing existing demo project...")
                session.delete(existing_proj)
                session.flush()
            else:
                logger.info("Demo project already exists (ID: %s).", existing_proj.id)
                return {"project_id": existing_proj.id}

        proj = ProjectModel(
            id="proj_demo_benchmark",
            name="Multimodal AI Engineering Benchmark",
            description="Comprehensive benchmark project showcasing text classification, visual object labeling, and workspace object detection.",
            # Must match the identity the web UI resolves to (no auth header => "default_user"),
            # otherwise the seeded demo is invisible to GET /api/v1/projects.
            owner_id="default_user",
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
            label_schema={"labels": ["billing", "technical_support", "feature_request", "general_inquiry"]},
            schema_version=1,
        )
        session.add(ds_text)
        session.flush()

        # Canonical text dataset shape (see docs/STATUS.md):
        #   input text lives in record.extra_metadata["text"],
        #   the decided label lives in annotation.payload["label"].
        sample_texts = [
            ("I was charged twice for my subscription this month. Please issue a refund.", "billing", "train"),
            ("Can you add dark mode and keyboard shortcuts to the annotation editor?", "feature_request", "train"),
            ("The app crashes every time I upload a CSV file.", "technical_support", "train"),
            ("How do I invite a teammate to review my dataset?", "general_inquiry", "train"),
            ("My invoice shows a different amount than the plan I signed up for.", "billing", "val"),
            ("Export to JSONL finishes but the downloaded archive is empty.", "technical_support", "val"),
            ("Please add bulk actions so I can approve many records at once.", "feature_request", "test"),
            ("Is there a way to see who approved a specific label?", "general_inquiry", "test"),
        ]

        for i, (text, label, split) in enumerate(sample_texts, start=1):
            rec = DatasetRecordModel(
                id=f"rec_txt_demo_{i:03d}",
                dataset_id=ds_text.id,
                split=split,
                schema_version=1,
                extra_metadata={
                    "text": text,
                    "label": label,
                    "source": "customer_portal",
                    "char_count": len(text),
                },
            )
            session.add(rec)
            session.flush()

            AnnotationService.create_annotation(
                session=session,
                record_id=rec.id,
                payload={"label": label},
                origin=AnnotationOrigin.HUMAN,
                confidence=1.0,
                status=ReviewStatus.APPROVED,
            )

        logger.info("Created Text Classification dataset with %d records.", len(sample_texts))

        # 3. Image Classification Dataset (Realistic Images)
        ds_image = DatasetModel(
            id="ds_demo_shapes_classification",
            project_id=proj.id,
            name="Visual Species & Object Classifier",
            task_type=TaskType.IMAGE_CLASSIFICATION.value,
            description="Image classification demo using AI-generated 1024x1024 sample images (fixtures under tests/fixtures/demo_images; generator metadata not recorded).",
            annotation_instructions="Identify the primary foreground subject: dog or cat.",
            label_schema={"labels": ["dog", "cat"]},
            schema_version=1,
        )
        session.add(ds_image)
        session.flush()

        image_items = [
            ("golden_retriever.jpg", "dog", "train", "circle"),
            ("siamese_cat.jpg", "cat", "val", "rectangle"),
        ]

        for i, (filename, label, split, fallback) in enumerate(image_items, start=1):
            img_bytes = _load_or_generate_image(filename=filename, fallback_shape=fallback, index=i)
            report = IngestionService.ingest_bytes(
                session=session,
                dataset_id=ds_image.id,
                filename=filename,
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
                payload={"label": label},
                origin=AnnotationOrigin.HUMAN,
                confidence=1.0,
                status=ReviewStatus.APPROVED,
            )

        logger.info("Created Image Classification dataset with %d assets.", len(image_items))

        # 4. Object Detection Dataset with Published Version 1.0.0 (Realistic Scenes)
        ds_object = DatasetModel(
            id="ds_demo_autonomous_detection",
            project_id=proj.id,
            name="Scene Object Detection & Spatial Calibration",
            task_type=TaskType.OBJECT_DETECTION.value,
            description="Calibrated imagery with bounding box annotations for vehicles, pedestrians, and workspace items.",
            annotation_instructions="Draw tightly bound bounding boxes for cars, pedestrians, laptops, and accessories.",
            label_schema={"classes": ["car", "pedestrian", "cyclist", "laptop", "cup", "headphones", "tablet", "notebook"]},
            schema_version=1,
        )
        session.add(ds_object)
        session.flush()

        detection_scenes = [
            (
                "urban_street.jpg",
                "train",
                [
                    {"label": "car", "x": 0.24, "y": 0.46, "w": 0.28, "h": 0.23},
                    {"label": "pedestrian", "x": 0.74, "y": 0.42, "w": 0.12, "h": 0.31},
                ],
                "street",
            ),
            (
                "desk_workspace.jpg",
                "train",
                [
                    {"label": "laptop", "x": 0.20, "y": 0.27, "w": 0.50, "h": 0.50},
                    {"label": "cup", "x": 0.75, "y": 0.50, "w": 0.17, "h": 0.17},
                    {"label": "headphones", "x": 0.27, "y": 0.12, "w": 0.14, "h": 0.23},
                ],
                "rectangle",
            ),
            (
                "car_intersection.jpg",
                "val",
                [
                    {"label": "car", "x": 0.13, "y": 0.52, "w": 0.37, "h": 0.20},
                    {"label": "cyclist", "x": 0.65, "y": 0.48, "w": 0.28, "h": 0.29},
                ],
                "street",
            ),
            (
                "office_table.jpg",
                "test",
                [
                    {"label": "notebook", "x": 0.38, "y": 0.32, "w": 0.53, "h": 0.48},
                    {"label": "tablet", "x": 0.14, "y": 0.12, "w": 0.45, "h": 0.36},
                    {"label": "cup", "x": 0.01, "y": 0.36, "w": 0.09, "h": 0.14},
                ],
                "triangle",
            ),
        ]

        for i, (filename, split, boxes, fallback) in enumerate(detection_scenes, start=1):
            img_bytes = _load_or_generate_image(filename=filename, fallback_shape=fallback, index=i)
            report = IngestionService.ingest_bytes(
                session=session,
                dataset_id=ds_object.id,
                filename=filename,
                data=img_bytes,
                split=split,
                storage=storage,
            )
            rec_id = report.accepted_items[0].record_id

            AnnotationService.create_annotation(
                session=session,
                record_id=rec_id,
                payload={"boxes": boxes, "coordinate_system": "normalized"},
                origin=AnnotationOrigin.HUMAN,
                confidence=1.0,
                status=ReviewStatus.APPROVED,
            )

        logger.info("Created Object Detection dataset with %d scene records.", len(detection_scenes))

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
    should_reset = "--reset" in sys.argv
    result = seed_demo_data(reset=should_reset)
    print("\n Demo dataset seeding complete!")
    for k, v in result.items():
        print(f"  {k}: {v}")
