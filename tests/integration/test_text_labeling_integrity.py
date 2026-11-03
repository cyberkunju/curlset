"""
TEXT-MVP B acceptance suite: non-forgeable labeling, explicit review workflow and bulk review.

These tests are the regression suite for the study finding C1:
the annotation POST used to accept ``{"origin": "human", "status": "approved",
"actor_id": "..."}`` and persist an already-approved "human" label without any
review decision, and the API trusted client-supplied actors.

Contract under test (docs/TEXT_MVP.md B1-B5):
- B1 manual labeling always creates origin=human / status=pending_review; review
  decisions only via POST /annotations/{id}/transition (FSM + ReviewEvent).
- B2 body-supplied origin/status/actor_id can never produce an approved label or
  a forged audit actor; the actor is derived from the request identity.
- B3 the AI orchestrator path still writes origin=model / status=pending_review
  proposals (never approved).
- B4 POST /datasets/{id}/review/bulk decides the selector-chosen annotation for
  many records in one authorized, audited call.
- B5 multiple annotations per record keep working; the shared selector picks the
  active (approved-first) annotation.

Run isolated (never the full suite):
    $env:DATABASE_URL="sqlite:///./data/t_label.db"
    $env:LOCAL_STORAGE_DIR="./data/t_label_storage"
    .venv\\Scripts\\python.exe -B -m pytest tests/integration/test_text_labeling_integrity.py -q
"""
from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select

from packages.dataset_core.annotation_selector import select_active_annotation
from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus, TaskType
from packages.dataset_core.db.models import (
    AnnotationModel,
    AnnotationRevisionModel,
    DatasetRecordModel,
    ReviewEventModel,
)
from packages.dataset_core.db.session import get_db_session, init_database
from packages.dataset_core.services.annotation_service import AnnotationService
from packages.dataset_core.services.dataset_service import DatasetService
from packages.dataset_core.services.project_service import ProjectService
from packages.dataset_core.services.record_service import RecordService
from packages.dataset_security.audit import AuditService
from services.api.main import app

client = TestClient(app)
init_database()

LABELS = ("positive", "negative", "neutral")


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def _make_dataset(
    *,
    owner_id: str = "default_user",
    record_count: int = 1,
    labels: tuple[str, ...] = LABELS,
    task_type: str = TaskType.TEXT_CLASSIFICATION.value,
) -> tuple[str, str, list[str]]:
    """Create project + dataset (+ records with metadata.text). Returns ids."""
    with get_db_session() as session:
        project = ProjectService.create_project(
            session, name=_uid("Labeling Integrity Project"), owner_id=owner_id
        )
        dataset = DatasetService.create_dataset(
            session,
            project_id=project.id,
            name=_uid("Text Dataset"),
            task_type=task_type,
            annotation_instructions="Label the intent of the input text.",
            label_schema={"labels": list(labels)},
        )
        record_ids: list[str] = []
        for index in range(record_count):
            record = RecordService.create_record(
                session,
                dataset_id=dataset.id,
                external_key=f"row_{index}",
                split="train",
                metadata={"text": f"sample text number {index}", "label": labels[0]},
            )
            record_ids.append(record.id)
        session.commit()
        return project.id, dataset.id, record_ids


def _annotation_rows(record_id: str) -> list[dict]:
    with get_db_session() as session:
        rows = session.scalars(
            select(AnnotationModel)
            .where(AnnotationModel.record_id == record_id)
            .order_by(AnnotationModel.created_at.asc(), AnnotationModel.id.asc())
        ).all()
        return [
            {
                "id": row.id,
                "origin": row.origin,
                "status": row.status,
                "payload": dict(row.payload or {}),
                "processing_run_id": row.processing_run_id,
            }
            for row in rows
        ]


def _revision_rows(annotation_id: str) -> list[dict]:
    with get_db_session() as session:
        rows = session.scalars(
            select(AnnotationRevisionModel)
            .where(AnnotationRevisionModel.annotation_id == annotation_id)
            .order_by(AnnotationRevisionModel.revision_number.asc())
        ).all()
        return [
            {
                "revision_number": row.revision_number,
                "origin": row.origin,
                "actor_id": row.actor_id,
                "payload": dict(row.payload or {}),
            }
            for row in rows
        ]


def _review_events(annotation_id: str) -> list[dict]:
    with get_db_session() as session:
        rows = session.scalars(
            select(ReviewEventModel)
            .where(ReviewEventModel.annotation_id == annotation_id)
            .order_by(ReviewEventModel.created_at.asc())
        ).all()
        return [
            {
                "actor_id": row.actor_id,
                "from_status": row.from_status,
                "to_status": row.to_status,
                "reason": row.reason,
            }
            for row in rows
        ]


def _audit_actions(project_id: str) -> list[str]:
    with get_db_session() as session:
        events = AuditService.list_events(session, project_id, limit=500)
    return [event["action"] for event in events]


def _post_annotation(record_id: str, body: dict, headers: dict | None = None):
    return client.post(f"/api/v1/records/{record_id}/annotations", json=body, headers=headers or {})


def _transition(annotation_id: str, body: dict, headers: dict | None = None):
    return client.post(
        f"/api/v1/annotations/{annotation_id}/transition", json=body, headers=headers or {}
    )


def _bulk(dataset_id: str, body: dict, headers: dict | None = None):
    return client.post(
        f"/api/v1/datasets/{dataset_id}/review/bulk", json=body, headers=headers or {}
    )


# --------------------------------------------------------------------------- #
# B1 / B2 — manual labeling is server-derived, decisions are explicit
# --------------------------------------------------------------------------- #
def test_forged_approved_human_label_is_impossible_over_http():
    _, _, [record_id] = _make_dataset(record_count=1)

    # The exact payload that used to create an approved annotation directly (C1).
    forged = _post_annotation(
        record_id,
        {
            "payload": {"label": "positive"},
            "origin": "human",
            "status": "approved",
            "actor_id": "forged_admin",
            "confidence": 0.99,
        },
    )
    assert forged.status_code == 201, forged.text
    body = forged.json()
    assert body["status"] == "pending_review", "client-supplied status must be ignored"
    assert body["origin"] == "human"

    rows = _annotation_rows(record_id)
    assert len(rows) == 1
    assert rows[0]["status"] == "pending_review"
    assert rows[0]["origin"] == "human"
    # forging must not leave an approved annotation behind anywhere
    assert [row for row in rows if row["status"] == "approved"] == []

    # The initial revision actor comes from the request identity, not the body.
    revisions = _revision_rows(rows[0]["id"])
    assert revisions[0]["actor_id"] == "default_user"
    assert revisions[0]["origin"] == "human"

    # Rejected / model origins cannot be claimed either — the server forces human.
    second = _post_annotation(
        record_id,
        {"payload": {"label": "negative"}, "origin": "model", "status": "proposed"},
    )
    assert second.status_code == 201, second.text
    assert second.json()["origin"] == "human"
    assert second.json()["status"] == "pending_review"

    # Payload validation is still enforced at the trust boundary.
    invalid = _post_annotation(record_id, {"payload": {"label": "wildly_invalid_class"}})
    assert invalid.status_code == 422
    assert "not in the allowed label set" in invalid.json()["error"]["message"]


def test_review_decision_requires_explicit_transition_and_records_server_actor():
    _, _, [record_id] = _make_dataset(owner_id="tenant_labeler", record_count=1)
    headers = {"X-User-Id": "tenant_labeler"}

    created = _post_annotation(
        record_id,
        {
            "payload": {"label": "negative"},
            "origin": "model",
            "status": "approved",
            "actor_id": "forged_admin",
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    annotation = created.json()
    assert annotation["status"] == "pending_review"
    assert annotation["origin"] == "human"

    # Only the explicit transition performs (and audits) the decision.
    approved = _transition(
        annotation["id"],
        {"next_status": "approved", "actor_id": "forged_admin", "reason": "verified by reviewer"},
        headers=headers,
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    events = _review_events(annotation["id"])
    assert len(events) >= 2  # creation + approval
    assert events[-1]["from_status"] == "pending_review"
    assert events[-1]["to_status"] == "approved"
    assert events[-1]["actor_id"] == "tenant_labeler", "actor must be derived from the request identity"
    assert events[-1]["reason"] == "verified by reviewer"
    assert all(event["actor_id"] != "forged_admin" for event in events)

    revisions = _revision_rows(annotation["id"])
    assert revisions[0]["actor_id"] == "tenant_labeler"

    # The FSM still rejects illegal moves through the API.
    illegal = _transition(annotation["id"], {"next_status": "proposed"}, headers=headers)
    assert illegal.status_code == 400
    assert illegal.json()["error"]["code"] == "INVALID_STATE_TRANSITION"

    # A different tenant cannot decide this annotation.
    intruder = _transition(annotation["id"], {"next_status": "rejected"}, headers={"X-User-Id": "tenant_intruder"})
    assert intruder.status_code == 403


def test_payload_revision_preserves_origin_and_invalidates_prior_decision():
    _, _, [record_id] = _make_dataset(owner_id="tenant_rev", record_count=1)
    headers = {"X-User-Id": "tenant_rev"}

    created = _post_annotation(record_id, {"payload": {"label": "positive"}}, headers=headers)
    assert created.status_code == 201, created.text
    annotation_id = created.json()["id"]

    assert _transition(annotation_id, {"next_status": "approved"}, headers=headers).status_code == 200

    # Client sends origin/status/actor again on the revision — all ignored.
    updated = client.put(
        f"/api/v1/annotations/{annotation_id}",
        json={
            "payload": {"label": "negative"},
            "origin": "model",
            "status": "pending_review",
            "actor_id": "forged_admin",
            "change_reason": "corrected after re-reading the text",
        },
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["origin"] == "human", "provenance must not be rewritable by an edit"
    # Editing an approved label invalidates the approval -> back into the queue.
    assert body["status"] == "needs_correction"
    assert body["payload"]["label"] == "negative"

    revisions = _revision_rows(annotation_id)
    assert len(revisions) == 2
    assert revisions[1]["origin"] == "human"
    assert revisions[1]["actor_id"] == "tenant_rev"
    assert revisions[1]["payload"]["label"] == "negative"

    events = _review_events(annotation_id)
    assert events[-1]["from_status"] == "approved"
    assert events[-1]["to_status"] == "needs_correction"
    assert events[-1]["actor_id"] == "tenant_rev"


def test_model_annotation_never_becomes_human_by_editing():
    _, _, [record_id] = _make_dataset(record_count=1)
    with get_db_session() as session:
        proposal = AnnotationService.create_annotation(
            session,
            record_id,
            payload={"label": "positive"},
            origin=AnnotationOrigin.MODEL,
            status=ReviewStatus.PENDING_REVIEW,
            actor_id="model:fake-classifier-v1",
        )
        session.commit()

    updated = client.put(
        f"/api/v1/annotations/{proposal.id}",
        json={"payload": {"label": "negative"}, "origin": "human", "actor_id": "forged_human"},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["origin"] == "model", "model provenance must survive a human payload edit"
    revisions = _revision_rows(proposal.id)
    assert revisions[-1]["origin"] == "model"


# --------------------------------------------------------------------------- #
# B3 — the AI orchestrator path keeps working, still pending_review
# --------------------------------------------------------------------------- #
def test_ai_annotation_path_still_creates_pending_model_proposals():
    _, dataset_id, record_ids = _make_dataset(record_count=2)

    response = client.post(
        f"/api/v1/datasets/{dataset_id}/ai-annotate",
        json={"provider": "fake", "model": "fake-classifier-v1", "limit": 5},
    )
    assert response.status_code == 202, response.text
    assert response.json()["processed_items"] == 2

    for record_id in record_ids:
        rows = _annotation_rows(record_id)
        assert len(rows) == 1, "orchestrator must create exactly one proposal per record"
        assert rows[0]["origin"] == "model"
        assert rows[0]["status"] == "pending_review", "model proposals must never be auto-approved"
        assert rows[0]["processing_run_id"], "run provenance is required"

    # Raw revision provenance (provider/model/usage) survives.
    with get_db_session() as session:
        annotation = session.scalar(
            select(AnnotationModel).where(AnnotationModel.record_id == record_ids[0])
        )
        revisions = session.scalars(
            select(AnnotationRevisionModel).where(
                AnnotationRevisionModel.annotation_id == annotation.id
            )
        ).all()
        revision_origin = revisions[0].origin
        model_metadata = dict(revisions[0].model_metadata or {})
    assert revision_origin == "model"
    assert model_metadata.get("provider") == "fake"
    assert model_metadata.get("model") == "fake-classifier-v1"


# --------------------------------------------------------------------------- #
# B4 — bulk review
# --------------------------------------------------------------------------- #
def test_bulk_review_decides_selector_annotation_for_many_records():
    project_id, dataset_id, record_ids = _make_dataset(record_count=5)

    # Two manual pending labels + one imported pending label; two records stay unannotated.
    for record_id in record_ids[:2]:
        assert _post_annotation(record_id, {"payload": {"label": "positive"}}).status_code == 201
    with get_db_session() as session:
        AnnotationService.create_annotation(
            session,
            record_ids[2],
            payload={"label": "negative"},
            origin=AnnotationOrigin.IMPORTED,
            status=ReviewStatus.PENDING_REVIEW,
            actor_id="importer",
        )
        session.commit()

    approved = _bulk(
        dataset_id,
        {"record_ids": record_ids, "action": "approve", "reason": "batch verified"},
    )
    assert approved.status_code == 200, approved.text
    result = approved.json()
    assert result["updated"] == 3
    assert result["skipped"] == 2, "unannotated records must be skipped, not failed"
    assert result["errors"] == []

    for record_id in record_ids[:3]:
        ann = _annotation_rows(record_id)[-1]
        assert ann["status"] == "approved"
        events = _review_events(ann["id"])
        assert events[-1]["to_status"] == "approved"
        assert events[-1]["reason"] == "batch verified"
        assert events[-1]["actor_id"] == "default_user"

    # Audit trail: one batch entry + one entry per updated record.
    actions = _audit_actions(project_id)
    assert "BULK_REVIEW" in actions
    assert actions.count("REVIEW_APPROVED") >= 3

    # approved -> needs_correction -> rejected are all legal FSM moves via bulk.
    needs_correction = _bulk(dataset_id, {"record_ids": record_ids[:3], "action": "needs_correction"})
    assert needs_correction.status_code == 200
    assert needs_correction.json()["updated"] == 3
    assert all(_annotation_rows(rid)[-1]["status"] == "needs_correction" for rid in record_ids[:3])

    rejected = _bulk(dataset_id, {"record_ids": record_ids[:3], "action": "reject"})
    assert rejected.status_code == 200
    assert rejected.json()["updated"] == 3
    assert all(_annotation_rows(rid)[-1]["status"] == "rejected" for rid in record_ids[:3])

    # Idempotent: repeating the same decision skips already-decided records.
    repeat = _bulk(dataset_id, {"record_ids": record_ids[:3], "action": "reject"})
    assert repeat.status_code == 200
    assert repeat.json()["updated"] == 0
    assert repeat.json()["skipped"] == 3


def test_bulk_review_reports_errors_without_mutating_other_datasets():
    _, dataset_id, record_ids = _make_dataset(record_count=2)
    _, _, other_record_ids = _make_dataset(record_count=1)

    assert _post_annotation(record_ids[0], {"payload": {"label": "positive"}}).status_code == 201
    with get_db_session() as session:
        AnnotationService.create_annotation(
            session,
            other_record_ids[0],
            payload={"label": "negative"},
            origin=AnnotationOrigin.IMPORTED,
            status=ReviewStatus.PENDING_REVIEW,
            actor_id="importer",
        )
        session.commit()

    response = _bulk(
        dataset_id,
        {
            "record_ids": [record_ids[0], record_ids[1], other_record_ids[0], "rec_does_not_exist"],
            "action": "approve",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["updated"] == 1
    assert body["skipped"] == 1  # record_ids[1] has no annotation
    error_ids = {issue["record_id"] for issue in body["errors"]}
    assert error_ids == {other_record_ids[0], "rec_does_not_exist"}

    # The foreign dataset record was NOT approved by this request.
    other_rows = _annotation_rows(other_record_ids[0])
    assert other_rows[-1]["status"] == "pending_review"

    # Request validation: empty list and unknown action are rejected.
    assert _bulk(dataset_id, {"record_ids": [], "action": "approve"}).status_code == 422
    assert _bulk(dataset_id, {"record_ids": record_ids, "action": "delete"}).status_code == 422


def test_bulk_review_is_project_scoped():
    _, dataset_id, record_ids = _make_dataset(owner_id="tenant_owner", record_count=2)
    owner_headers = {"X-User-Id": "tenant_owner"}
    assert _post_annotation(record_ids[0], {"payload": {"label": "positive"}}, headers=owner_headers).status_code == 201

    intruder = _bulk(
        dataset_id,
        {"record_ids": record_ids, "action": "approve"},
        headers={"X-User-Id": "tenant_intruder"},
    )
    assert intruder.status_code == 403
    assert intruder.json()["error"]["code"] == "PROJECT_OWNERSHIP_VIOLATION"
    assert _annotation_rows(record_ids[0])[-1]["status"] == "pending_review"

    allowed = _bulk(
        dataset_id,
        {"record_ids": record_ids, "action": "approve"},
        headers=owner_headers,
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["updated"] == 1


# --------------------------------------------------------------------------- #
# B5 — multiple annotations per record + shared selector
# --------------------------------------------------------------------------- #
def test_multiple_annotations_coexist_and_selector_prefers_approved():
    _, _, [record_id] = _make_dataset(record_count=1)

    # Older imported annotation gets approved explicitly.
    with get_db_session() as session:
        imported = AnnotationService.create_annotation(
            session,
            record_id,
            payload={"label": "positive"},
            origin=AnnotationOrigin.IMPORTED,
            status=ReviewStatus.PENDING_REVIEW,
            actor_id="importer",
        )
        session.commit()
    assert _transition(imported.id, {"next_status": "approved"}).status_code == 200

    # A newer pending human annotation must not displace the approved decision.
    human = _post_annotation(record_id, {"payload": {"label": "negative"}})
    assert human.status_code == 201, human.text

    with get_db_session() as session:
        record = session.get(DatasetRecordModel, record_id)
        annotations = list(record.annotations)
        assert len(annotations) == 2, "a record must be able to hold imported + human annotations"
        active = select_active_annotation(annotations)
        assert active is not None
        assert active.id == imported.id, "selector must prefer the approved annotation"
        assert active.status == ReviewStatus.APPROVED.value

    # The pending human annotation is still individually transitionable.
    assert _transition(human.json()["id"], {"next_status": "approved"}).status_code == 200
    with get_db_session() as session:
        record = session.get(DatasetRecordModel, record_id)
        active = select_active_annotation(list(record.annotations))
        assert active is not None
        assert active.status == ReviewStatus.APPROVED.value


def test_record_detail_and_queue_expose_selector_chosen_annotation():
    """B5: the API views must agree with the shared selector, not "newest wins"."""
    _, dataset_id, [record_id] = _make_dataset(record_count=1)

    # 1) older imported annotation, explicitly approved
    with get_db_session() as session:
        imported = AnnotationService.create_annotation(
            session,
            record_id,
            payload={"label": "positive"},
            origin=AnnotationOrigin.IMPORTED,
            status=ReviewStatus.PENDING_REVIEW,
            actor_id="importer",
        )
        session.commit()
    assert _transition(imported.id, {"next_status": "approved"}).status_code == 200

    # 2) newer, still-pending human annotation (must NOT shadow the approval)
    human = _post_annotation(record_id, {"payload": {"label": "negative"}})
    assert human.status_code == 201, human.text
    human_id = human.json()["id"]

    detail = client.get(f"/api/v1/records/{record_id}")
    assert detail.status_code == 200, detail.text
    detail_body = detail.json()
    assert detail_body["annotation"]["id"] == imported.id
    assert detail_body["annotation"]["status"] == "approved"
    assert detail_body["annotation"]["origin"] == "imported"
    assert detail_body["annotation"]["payload"]["label"] == "positive"
    # revisions/events belong to the selected annotation, not the newest one
    assert {rev["actor_id"] for rev in detail_body["revisions"]} == {"importer"}
    assert detail_body["review_events"][-1]["to_status"] == "approved"

    queue = client.get(f"/api/v1/datasets/{dataset_id}/queue")
    assert queue.status_code == 200, queue.text
    item = queue.json()["items"][0]
    assert item["annotation_id"] == imported.id
    assert item["review_status"] == "approved"
    assert item["annotation_payload"]["label"] == "positive"

    # Status filtering is applied to the selector-chosen status.
    approved_only = client.get(f"/api/v1/datasets/{dataset_id}/queue?review_status=approved").json()
    assert approved_only["total"] == 1
    pending_only = client.get(f"/api/v1/datasets/{dataset_id}/queue?review_status=pending_review").json()
    assert pending_only["total"] == 0
    unannotated_only = client.get(f"/api/v1/datasets/{dataset_id}/queue?review_status=unannotated").json()
    assert unannotated_only["total"] == 0

    # Once both are approved the selector is deterministic: newest approved wins.
    assert _transition(human_id, {"next_status": "approved"}).status_code == 200
    detail_after = client.get(f"/api/v1/records/{record_id}").json()
    assert detail_after["annotation"]["id"] == human_id
    assert detail_after["annotation"]["status"] == "approved"
