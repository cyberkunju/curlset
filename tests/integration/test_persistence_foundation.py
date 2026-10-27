"""
Integration tests for database models, migrations/schema initialization,
and service-level persistence with SQLite in-memory engine.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from packages.dataset_core.constants import (
    AnnotationOrigin,
    AssetModality,
    AssetRole,
    ExportFormat,
    LicenseStatus,
    ReviewStatus,
    TaskType,
)
from packages.dataset_core.db.base import Base
from packages.dataset_core.db.models import (
    DatasetVersionModel,
    ExportArtifactModel,
    VersionItemModel,
)
from packages.dataset_core.exceptions import (
    DomainValidationError,
    InvalidStateTransitionError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_core.services.dataset_service import DatasetService
from packages.dataset_core.services.project_service import ProjectService
from packages.dataset_core.services.record_service import RecordService


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine)
    session = session_factory()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


def test_complete_persistence_round_trip(test_db):
    session = test_db

    # 1. Create Project
    project = ProjectService.create_project(
        session=session,
        name="Defect Detection Research",
        description="Dataset engineering for factory visual QA",
        owner_id="user_researcher",
    )
    assert project.id.startswith("prj_")
    assert project.name == "Defect Detection Research"

    # 2. Create Dataset
    dataset = DatasetService.create_dataset(
        session=session,
        project_id=project.id,
        name="Surface Cracks",
        task_type=TaskType.IMAGE_CLASSIFICATION.value,
        annotation_instructions="Label only visible fractures on surface.",
        label_schema={"labels": ["crack", "normal"]},
    )
    assert dataset.id.startswith("ds_")
    assert dataset.schema_version == 1

    # 3. Create Record
    record = RecordService.create_record(
        session=session,
        dataset_id=dataset.id,
        external_key="sample_001.jpg",
        split="train",
        metadata={"camera_id": "cam_alpha_4"},
    )
    assert record.id.startswith("rec_")
    assert record.dataset_id == dataset.id

    # 4. Create and Link Asset
    sha256_mock = "e" * 64
    asset = RecordService.create_asset(
        session=session,
        dataset_id=dataset.id,
        storage_key="assets/sample_001.jpg",
        modality=AssetModality.IMAGE,
        mime_type="image/jpeg",
        byte_size=2048,
        sha256=sha256_mock,
        original_filename="sample_001.jpg",
        dimensions={"width": 640, "height": 480},
    )
    assert asset.id.startswith("ast_")

    RecordService.link_asset_to_record(
        session=session,
        record_id=record.id,
        asset_id=asset.id,
        role=AssetRole.PRIMARY_IMAGE,
    )

    # 5. Attach Source Record
    source = RecordService.attach_source_record(
        session=session,
        record_id=record.id,
        source_type="upload",
        license_status=LicenseStatus.APPROVED_FOR_INTENDED_USE,
        creator_attribution="Internal Quality Lab",
        terms_notes="Authorized for model training",
    )
    assert source.id.startswith("src_")
    assert source.license_status == LicenseStatus.APPROVED_FOR_INTENDED_USE.value

    # 6. Create Annotation with Append-Only Revision
    annotation = AnnotationService.create_annotation(
        session=session,
        record_id=record.id,
        payload={"label": "crack"},
        origin=AnnotationOrigin.HUMAN,
        status=ReviewStatus.PENDING_REVIEW,
        actor_id="user_researcher",
    )
    assert annotation.id.startswith("ann_")
    assert annotation.status == ReviewStatus.PENDING_REVIEW.value

    revisions = AnnotationService.get_revisions(session, annotation.id)
    assert len(revisions) == 1
    assert revisions[0].revision_number == 1
    assert revisions[0].payload == {"label": "crack"}

    # 7. Update Annotation (creates revision 2 without mutating revision 1)
    updated_ann = AnnotationService.update_annotation_payload(
        session=session,
        annotation_id=annotation.id,
        payload={"label": "normal"},
        actor_id="senior_reviewer",
        change_reason="Re-evaluated by lab specialist: scratch not crack",
    )
    assert updated_ann.payload == {"label": "normal"}

    revisions_after = AnnotationService.get_revisions(session, annotation.id)
    assert len(revisions_after) == 2
    assert revisions_after[0].revision_number == 1
    assert revisions_after[0].payload == {"label": "crack"}
    assert revisions_after[1].revision_number == 2
    assert revisions_after[1].payload == {"label": "normal"}

    # 8. Approve Annotation via State Machine
    approved_ann = AnnotationService.transition_review_status(
        session=session,
        annotation_id=annotation.id,
        next_status=ReviewStatus.APPROVED,
        actor_id="senior_reviewer",
        reason="Verified and approved",
    )
    assert approved_ann.status == ReviewStatus.APPROVED.value

    events = AnnotationService.get_review_events(session, annotation.id)
    assert len(events) >= 2  # initial creation + approve

    # 9. Test Publishing Dataset Version & VersionItem
    version_id = generate_id("version")
    ver_manifest_hash = "f" * 64
    ds_version = DatasetVersionModel(
        id=version_id,
        dataset_id=dataset.id,
        version_number=1,
        version_tag="v1.0.0",
        manifest_hash=ver_manifest_hash,
        manifest_storage_key="manifests/v1.0.0.json",
        record_count=1,
        schema_version=dataset.schema_version,
        quality_summary={"approved_count": 1, "unreviewed_count": 0},
    )
    session.add(ds_version)

    vi_id = generate_id("version_item")
    version_item = VersionItemModel(
        id=vi_id,
        version_id=version_id,
        record_id=record.id,
        annotation_revision_id=updated_ann.current_revision_id,
        asset_ids=[asset.id],
    )
    session.add(version_item)

    # 10. Test Export Artifact Record
    exp_id = generate_id("export")
    exp_hash = "c" * 64
    export_artifact = ExportArtifactModel(
        id=exp_id,
        version_id=version_id,
        format=ExportFormat.JSONL.value,
        exporter_version="1.0.0",
        storage_key="exports/v1.0.0.jsonl",
        byte_size=512,
        sha256=exp_hash,
        record_count=1,
    )
    session.add(export_artifact)
    session.flush()

    assert ds_version.id == version_id
    assert export_artifact.format == "jsonl"


def test_illegal_review_state_transition_raises_error(test_db):
    session = test_db
    project = ProjectService.create_project(session, name="Safety Proj")
    dataset = DatasetService.create_dataset(
        session, project.id, "Safety DS", TaskType.TEXT_CLASSIFICATION.value
    )
    record = RecordService.create_record(session, dataset.id)
    ann = AnnotationService.create_annotation(
        session,
        record.id,
        payload={"label": "positive"},
        origin=AnnotationOrigin.HUMAN,
        status=ReviewStatus.PROPOSED,
    )

    # Cannot transition directly from proposed to approved
    with pytest.raises(InvalidStateTransitionError) as exc_info:
        AnnotationService.transition_review_status(session, ann.id, ReviewStatus.APPROVED)
    assert "Illegal state transition" in str(exc_info.value)


def test_model_proposal_cannot_be_directly_approved(test_db):
    session = test_db
    project = ProjectService.create_project(session, name="AI Proj")
    dataset = DatasetService.create_dataset(
        session, project.id, "AI DS", TaskType.IMAGE_CLASSIFICATION.value
    )
    record = RecordService.create_record(session, dataset.id)

    # Direct creation of model proposal as approved is forbidden
    with pytest.raises(DomainValidationError) as exc_info:
        AnnotationService.create_annotation(
            session,
            record.id,
            payload={"label": "damaged"},
            origin=AnnotationOrigin.MODEL,
            status=ReviewStatus.APPROVED,
        )
    assert "Model-generated annotations cannot be directly created as approved" in str(exc_info.value)
