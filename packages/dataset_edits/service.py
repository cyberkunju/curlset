"""
Natural-language dataset editing: turn a plain instruction into explicit, previewable operations.

Design rules (the reason this is not "just run an LLM over the rows"):

* The instruction is parsed **deterministically** into a small set of named operations. What cannot
  be done is reported as unsupported with a reason — never silently ignored.
* Every operation is **previewed with real counts** against the database before anything changes.
* Destructive-looking edits are implemented as **reversible state changes** (review rejection instead
  of hard deletion, stored before-state for text changes) and are recorded as change sets.
* Text rewriting ("make it more formal") needs a provider, so it is reported as unsupported in this
  build instead of being faked with deterministic string mangling.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.constants import ReviewStatus
from packages.dataset_core.db.models import (
    AnnotationModel,
    DatasetEditModel,
    DatasetModel,
    DatasetRecordModel,
)
from packages.dataset_core.exceptions import (
    DomainValidationError,
    ResourceNotFoundError,
)
from packages.dataset_core.id_generator import generate_id
from packages.dataset_core.services.annotation_service import AnnotationService

#: Upper bound on rows an edit may touch in one operation (keeps requests bounded).
MAX_AFFECTED = 2000


@dataclass
class EditOperation:
    kind: str                                  # add_examples | reject_label | rename_label | shorten_text | unsupported
    description: str
    count: int = 0
    supported: bool = True
    destructive: bool = False
    warning: str = ""
    args: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "description": self.description,
            "count": self.count,
            "supported": self.supported,
            "destructive": self.destructive,
            "warning": self.warning,
            "args": self.args,
        }


@dataclass
class EditPlan:
    dataset_id: str
    instruction: str
    operations: list[EditOperation] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "dataset_id": self.dataset_id,
            "instruction": self.instruction,
            "operations": [operation.to_dict() for operation in self.operations],
            "warnings": self.warnings,
            "notes": self.notes,
            "applies_changes": any(op.supported for op in self.operations),
            "reversible": all(op.kind != "add_examples" for op in self.operations if op.supported),
        }


def _labels(dataset: DatasetModel) -> list[str]:
    schema = dataset.label_schema or {}
    return [str(label) for label in (schema.get("labels") or schema.get("classes") or [])]


def _annotations_with_label(session: Session, dataset_id: str, label: str) -> list[AnnotationModel]:
    rows = session.scalars(
        select(AnnotationModel).where(AnnotationModel.dataset_id == dataset_id)
    ).all()
    matched = [row for row in rows if isinstance(row.payload, dict) and str(row.payload.get("label")) == label]
    return matched[:MAX_AFFECTED]


def _records_with_text(session: Session, dataset_id: str) -> list[DatasetRecordModel]:
    return list(session.scalars(
        select(DatasetRecordModel).where(DatasetRecordModel.dataset_id == dataset_id).limit(MAX_AFFECTED)
    ).all())


def _record_text(record: DatasetRecordModel) -> str:
    return str((record.extra_metadata or {}).get("text") or "")


def plan_edit(session: Session, dataset_id: str, instruction: str) -> EditPlan:
    """Parse an instruction into operations with real counts. Never mutates."""
    dataset = session.get(DatasetModel, dataset_id)
    if not dataset:
        raise ResourceNotFoundError("Dataset", dataset_id)
    text = (instruction or "").strip()
    if not text:
        raise DomainValidationError("Describe the change you want.", field="instruction")

    plan = EditPlan(dataset_id=dataset_id, instruction=text)
    lowered = text.lower()
    labels = _labels(dataset)
    matched_label = next((label for label in labels if label.lower() in lowered), None)

    # --- add examples ---------------------------------------------------------------
    add_match = re.search(r"add\s+(\d{1,5})\s+(?:more\s+)?(?:examples?|rows?|samples?)", lowered)
    if add_match:
        count = max(1, min(int(add_match.group(1)), 2000))
        target = matched_label or (labels[0] if len(labels) == 1 else None)
        where = f" for “{target}”" if target else f" spread across {len(labels)} classes"
        plan.operations.append(EditOperation(
            kind="add_examples",
            description=f"Generate {count} new example(s){where}",
            count=count,
            args={"count": count, "class": target, "labels": labels},
            warning="Generated rows arrive as pending review — they are never auto-approved.",
        ))
        plan.warnings.append(
            "Adding examples needs a generation provider; the preview cannot promise a duration. "
            "Progress and a measured time estimate appear once the job starts."
        )

    # --- rename a label -------------------------------------------------------------
    rename_match = re.search(r"rename\s+(?:the\s+)?(?:label|class|category)?\s*['\u201c\"]?(.+?)['\u201d\"]?\s+to\s+['\u201c\"]?(.+?)['\u201d\"]?\s*$", text, re.IGNORECASE)
    if rename_match:
        old_candidate = rename_match.group(1).strip().strip("'\"")
        new_label = rename_match.group(2).strip().strip("'\"")
        old_label = next((label for label in labels if label.lower() == old_candidate.lower()), None)
        if old_label is None:
            plan.operations.append(EditOperation(
                kind="unsupported",
                description=f"I could not find a label called “{old_candidate}”.",
                supported=False,
                args={"known_labels": labels},
                warning="Use one of the existing labels.",
            ))
        else:
            affected = _annotations_with_label(session, dataset_id, old_label)
            plan.operations.append(EditOperation(
                kind="rename_label",
                description=f"Rename label “{old_label}” → “{new_label}” ({len(affected)} annotation(s))",
                count=len(affected),
                args={"old": old_label, "new": new_label},
                warning="Renaming appends a revision and returns affected rows to review.",
            ))

    # --- remove / exclude a label ---------------------------------------------------
    if re.search(r"\b(remove|delete|drop|exclude)\b", lowered) and matched_label and not rename_match:
        affected = _annotations_with_label(session, dataset_id, matched_label)
        plan.operations.append(EditOperation(
            kind="reject_label",
            description=f"Reject {len(affected)} example(s) labelled “{matched_label}” (kept, not deleted)",
            count=len(affected),
            args={"label": matched_label},
            warning="This is reversible: rows are rejected, not deleted, and can be restored.",
        ))

    # --- shorten text ---------------------------------------------------------------
    if re.search(r"\b(shorten|shrink|truncate|shorter)\b", lowered):
        words_match = re.search(r"(\d{1,3})\s*words?", lowered)
        target_words = int(words_match.group(1)) if words_match else 12
        target_words = max(3, min(target_words, 400))
        affected = [
            record for record in _records_with_text(session, dataset_id)
            if len(_record_text(record).split()) > target_words
        ]
        plan.operations.append(EditOperation(
            kind="shorten_text",
            description=f"Shorten {len(affected)} example(s) to at most {target_words} words",
            count=len(affected),
            args={"target_words": target_words},
            warning="Text changes are reversible (previous text is stored in the change set).",
        ))

    # --- anything else --------------------------------------------------------------
    if not plan.operations:
        plan.operations.append(EditOperation(
            kind="unsupported",
            description="I could not map that instruction to a supported change.",
            supported=False,
            args={"known_labels": labels},
            warning=(
                "Supported today: add N examples, rename label X to Y, remove examples labelled X, "
                "shorten examples to N words. Rewriting tone/style needs a configured provider and is "
                "not implemented."
            ),
        ))
        plan.notes.append(
            "Try: “add 50 more examples”, “rename billing to invoices”, "
            "“remove examples labelled technical_support”, “shorten examples to 10 words”."
        )
    return plan


def apply_edit(
    session: Session,
    dataset_id: str,
    instruction: str,
    *,
    actor_id: str = "default_user",
    provider: str | None = None,
    model: str | None = None,
    verifier_providers: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    """Execute the plan, recording a reversible change set."""
    plan = plan_edit(session, dataset_id, instruction)
    dataset = session.get(DatasetModel, dataset_id)
    if not dataset:
        raise ResourceNotFoundError("Dataset", dataset_id)

    supported = [operation for operation in plan.operations if operation.supported]
    if not supported:
        raise DomainValidationError(
            plan.operations[0].warning or "Nothing in that instruction can be applied.",
            field="instruction",
        )

    dataset_edit = DatasetEditModel(
        id=generate_id("edit"),
        dataset_id=dataset_id,
        instruction=plan.instruction,
        plan_json=plan.to_dict(),
        status="applied",
        affected_counts_json={},
        reversal_json={},
        actor_id=actor_id,
    )
    session.add(dataset_edit)
    session.flush()

    reversal: dict[str, Any] = {}
    counts: dict[str, int] = {}
    job_id: str | None = None
    notes: list[str] = []

    for operation in supported:
        kind = operation.kind

        if kind == "add_examples":
            from packages.generation_jobs.service import create_job

            if not provider or not model:
                raise DomainValidationError(
                    "Adding examples needs a generation provider and model.", field="provider"
                )
            labels = list(operation.args.get("labels") or [])
            target = operation.args.get("class")
            classes = [target] if target else labels
            total = int(operation.args.get("count") or 1)
            per_class = max(1, round(total / max(1, len(classes))))
            job = create_job(
                session,
                prompt=plan.instruction,
                classes=classes,
                per_class=per_class,
                provider=provider,
                model=model,
                verifier_providers=verifier_providers or [],
                dataset_id=dataset_id,
                description=plan.instruction,
            )
            session.flush()
            job_id = job.id
            counts["add_examples"] = per_class * len(classes)
            notes.append("Generation started; progress is available through the job endpoint.")
            # NOTE: the runner is started by the API route *after* commit; starting it here would race
            # the uncommitted row and leave the job stuck in "pending".

        elif kind == "reject_label":
            label = str(operation.args["label"])
            annotations = _annotations_with_label(session, dataset_id, label)
            previous = []
            for annotation in annotations:
                if annotation.status == ReviewStatus.REJECTED.value:
                    continue
                previous.append({"id": annotation.id, "status": annotation.status})
                AnnotationService.transition_review_status(
                    session=session,
                    annotation_id=annotation.id,
                    next_status=ReviewStatus.REJECTED,
                    actor_id=actor_id,
                    reason="Natural-language edit: remove label",
                )
            reversal.setdefault("reject_label", []).append({"label": label, "previous": previous})
            counts["reject_label"] = len(previous)

        elif kind == "rename_label":
            old_label = str(operation.args["old"])
            new_label = str(operation.args["new"])
            schema = dict(dataset.label_schema or {})
            schema_labels = [str(label) for label in (schema.get("labels") or schema.get("classes") or [])]
            schema["labels"] = [new_label if label == old_label else label for label in schema_labels]
            schema.pop("classes", None)
            dataset.label_schema = schema
            previous = []
            for annotation in _annotations_with_label(session, dataset_id, old_label):
                previous.append({"id": annotation.id, "label": old_label})
                AnnotationService.update_annotation_payload(
                    session=session,
                    annotation_id=annotation.id,
                    payload={**(annotation.payload or {}), "label": new_label},
                    actor_id=actor_id,
                    change_reason=f"Natural-language edit: rename {old_label} -> {new_label}",
                )
            reversal.setdefault("rename_label", []).append(
                {"old": old_label, "new": new_label, "annotations": previous,
                 "schema_before": {"labels": schema_labels}}
            )
            counts["rename_label"] = len(previous)

        elif kind == "shorten_text":
            target_words = int(operation.args["target_words"])
            changed = []
            for record in _records_with_text(session, dataset_id):
                text = _record_text(record)
                words = text.split()
                if len(words) <= target_words:
                    continue
                shortened = " ".join(words[:target_words]).rstrip(" ,.;:") + "…"
                metadata = dict(record.extra_metadata or {})
                metadata["text"] = shortened
                metadata["edited"] = {"kind": "shorten_text", "change_set": dataset_edit.id}
                record.extra_metadata = metadata
                changed.append({"record_id": record.id, "before": text})
            reversal.setdefault("shorten_text", []).append({"records": changed})
            counts["shorten_text"] = len(changed)

    dataset_edit.affected_counts_json = counts
    dataset_edit.reversal_json = reversal
    dataset_edit.job_id = job_id
    session.flush()

    payload = plan.to_dict()
    payload.update({
        "change_set_id": dataset_edit.id,
        "status": "applied",
        "counts": counts,
        "job_id": job_id,
        "notes": notes,
    })
    return payload


def list_change_sets(session: Session, dataset_id: str, *, limit: int = 20) -> list[dict[str, Any]]:
    rows = session.scalars(
        select(DatasetEditModel)
        .where(DatasetEditModel.dataset_id == dataset_id)
        .order_by(DatasetEditModel.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": row.id,
            "instruction": row.instruction,
            "status": row.status,
            "counts": row.affected_counts_json or {},
            "job_id": row.job_id,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "undoable": row.status == "applied" and bool(row.reversal_json),
        }
        for row in rows
    ]


def undo_change_set(session: Session, change_set_id: str, *, actor_id: str = "default_user") -> dict[str, Any]:
    """Reverse a change set using its stored before-state."""
    dataset_edit = session.get(DatasetEditModel, change_set_id)
    if not dataset_edit:
        raise ResourceNotFoundError("DatasetEdit", change_set_id)
    if dataset_edit.status != "applied":
        raise DomainValidationError(f"Change set is '{dataset_edit.status}', not undoable.", field="status")
    reversal = dict(dataset_edit.reversal_json or {})
    if not reversal:
        raise DomainValidationError(
            "This change set has no stored previous state (for example, it started a generation job).",
            field="reversal",
        )

    dataset = session.get(DatasetModel, dataset_edit.dataset_id)
    if not dataset:
        raise ResourceNotFoundError("Dataset", dataset_edit.dataset_id)

    restored: dict[str, int] = {}

    for entry in reversal.get("reject_label", []):
        for item in entry.get("previous", []):
            AnnotationService.transition_review_status(
                session=session,
                annotation_id=item["id"],
                next_status=ReviewStatus(item["status"]),
                actor_id=actor_id,
                reason="Undo natural-language edit",
            )
        restored["reject_label"] = restored.get("reject_label", 0) + len(entry.get("previous", []))

    for entry in reversal.get("rename_label", []):
        old_label, new_label = entry["old"], entry["new"]
        schema = dict(dataset.label_schema or {})
        schema_labels = [str(label) for label in (schema.get("labels") or [])]
        schema["labels"] = [old_label if label == new_label else label for label in schema_labels]
        dataset.label_schema = schema
        for item in entry.get("annotations", []):
            annotation = session.get(AnnotationModel, item["id"])
            if annotation is None:
                continue
            AnnotationService.update_annotation_payload(
                session=session,
                annotation_id=annotation.id,
                payload={**(annotation.payload or {}), "label": old_label},
                actor_id=actor_id,
                change_reason=f"Undo rename: {new_label} -> {old_label}",
            )
        restored["rename_label"] = restored.get("rename_label", 0) + len(entry.get("annotations", []))

    for entry in reversal.get("shorten_text", []):
        for item in entry.get("records", []):
            record = session.get(DatasetRecordModel, item["record_id"])
            if record is None:
                continue
            metadata = dict(record.extra_metadata or {})
            metadata["text"] = item["before"]
            metadata.pop("edited", None)
            record.extra_metadata = metadata
        restored["shorten_text"] = restored.get("shorten_text", 0) + len(entry.get("records", []))

    dataset_edit.status = "undone"
    session.flush()
    return {"change_set_id": dataset_edit.id, "status": "undone", "restored": restored}
