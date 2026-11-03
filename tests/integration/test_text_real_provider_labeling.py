"""
TEXT MVP — real-provider labeling (F1/F3 provenance through the REAL HTTP adapter).

Everything else in the text MVP is proven with ``FakeProvider``, which never leaves the
process. This module proves the *real* provider path: the production ``OpenAIProvider``
adapter performs real HTTP (``httpx``) POSTs to an OpenAI-compatible endpoint, parses and
validates the model output, and the resulting proposals carry honest model provenance that
the accuracy evaluator can consume.

Hermetic by construction: the endpoint is a local stub HTTP server bound to 127.0.0.1, so no
external network access and no API key/credential is required. The stub echoes deterministic
labels so accuracy can be hand-computed.

Acceptance criteria covered: F1 (gold vs model, never self-compare), F3 (provenance), B3
(model proposals are pending_review, never auto-approved), plus provider failure isolation
(auth failure and malformed output must not corrupt the dataset).
"""
from __future__ import annotations

import json
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, ClassVar

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from packages.dataset_core.db.models import AnnotationModel
from packages.dataset_core.db.session import get_db_session
from packages.dataset_security.rate_limiter import global_rate_limiter
from packages.provider_gateway.gateway import ProviderGateway
from packages.provider_gateway.openai_provider import OpenAIProvider
from services.api.main import app

# ---------------------------------------------------------------- stub server ---

# Deterministic keyword classifier used by the stubbed "model". Ordered: the first group
# that matches wins, which makes the expected accuracy hand-computable (15/15 on the
# fixture CSV below).
_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("billing", ("charged", "invoice", "card", "payment", "refund", "subscription", "plan")),
    ("feature_request", ("add ", "dark mode", "bulk", "support", "search box", "multi-label")),
    ("technical_support", ("crash", "shortcut", "export", "queue", "upload", "error", "lag", "canvas")),
    ("general_inquiry", ("how do", "where can", "is there", "documentation", "invite", "who approved")),
]

FIXTURE_CSV = """text,label
"I was charged twice for my subscription this month. Please issue a refund.",billing
"My invoice shows a different amount than the plan I signed up for.",billing
"Can you update the credit card on file for my account?",billing
"The app crashes every time I try to upload a CSV file.",technical_support
"Keyboard shortcut for next record does not work in the annotation editor.",technical_support
"Export to JSONL finishes but the downloaded archive is empty.",technical_support
"Dark mode would make long labelling sessions much easier on the eyes.",feature_request
"Please add bulk actions so I can approve many records at once.",feature_request
"Could you support importing parquet files in addition to CSV?",feature_request
"How do I invite a teammate to review my dataset?",general_inquiry
"Where can I find documentation about the annotation guidelines?",general_inquiry
"Is there a way to see who approved a specific label?",general_inquiry
"Payment failed with error code 4021 and now my plan is suspended.",billing
"The review queue keeps showing the same record after I approve it.",technical_support
"Add a keyboard shortcut to jump straight to the quality dashboard please.",feature_request
"""


class _State:
    """Shared mutable state for the stub server (reset per test)."""

    calls: ClassVar[list[dict[str, Any]]] = []
    mode: str = "ok"  # ok | malformed | unauthorized | server_error


def _classify(text: str) -> str:
    lowered = text.lower()
    for label, keywords in _RULES:
        if any(k in lowered for k in keywords):
            return label
    return "general_inquiry"


class _StubHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args: Any) -> None:  # silence stderr noise
        return

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            request = json.loads(raw)
        except json.JSONDecodeError:
            request = {}

        auth = self.headers.get("Authorization", "")
        model = request.get("model", "")
        messages = request.get("messages", []) or []
        prompt = ""
        for message in messages:
            if message.get("role") == "user":
                content = message.get("content")
                prompt = content if isinstance(content, str) else json.dumps(content)

        _State.calls.append({
            "path": self.path,
            "auth": auth,
            "model": model,
            "response_format": request.get("response_format"),
            "prompt": prompt,
        })

        if not self.path.endswith("/chat/completions"):
            self._json(404, {"error": {"message": "not found"}})
            return
        if _State.mode == "unauthorized":
            self._json(401, {"error": {"message": "Invalid API key"}})
            return
        if _State.mode == "server_error":
            self._json(500, {"error": {"message": "upstream exploded"}})
            return

        if _State.mode == "malformed":
            content = "this is not json at all"
        else:
            idx = prompt.find("Input text:")
            if idx == -1:
                idx = prompt.find("Input:")
            snippet = prompt[idx + 11:] if idx != -1 else prompt
            label = _classify(snippet)
            content = json.dumps({"label": label, "confidence": 0.91})

        self._json(200, {
            "id": f"chatcmpl-{uuid.uuid4().hex[:12]}",
            "object": "chat.completion",
            "model": model or "stub-model",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }],
            "usage": {"prompt_tokens": max(1, len(prompt) // 4), "completion_tokens": 12,
                      "total_tokens": max(1, len(prompt) // 4) + 12},
        })


@pytest.fixture(scope="module")
def stub_server():
    server = ThreadingHTTPServer(("127.0.0.1", 0), _StubHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/v1"
    finally:
        server.shutdown()
        server.server_close()


@pytest.fixture()
def client():
    # Module-scoped TestClient would leak the lifespan DB between tests; per-test is cheap here.
    with TestClient(app) as c:
        yield c


def _reset_gateway_provider() -> None:
    """Restore the built-in (credential-less) OpenAI registration this test replaces."""
    ProviderGateway.get_instance().register_provider(OpenAIProvider())


@pytest.fixture(autouse=True)
def _clean_state(stub_server):
    _State.calls = []
    _State.mode = "ok"
    global_rate_limiter.reset()
    yield
    _State.mode = "ok"
    _reset_gateway_provider()


# ------------------------------------------------------------------ helpers ----


def _make_text_dataset(client: TestClient) -> tuple[str, str]:
    """Create project + text dataset and import a 15-row labelled CSV.

    Returns (project_id, dataset_id). Every row becomes an ``imported``/``pending_review``
    annotation (pre-existing ground truth from a labelled file).
    """
    suffix = uuid.uuid4().hex[:8]
    project = client.post("/api/v1/projects", json={"name": f"Real provider {suffix}"}).json()
    dataset = client.post(f"/api/v1/projects/{project['id']}/datasets", json={
        "name": f"Support {suffix}",
        "task_type": "text_classification",
        "label_schema": {"labels": ["billing", "technical_support", "feature_request", "general_inquiry"]},
    }).json()
    response = client.post(
        f"/api/v1/datasets/{dataset['id']}/import/file",
        files={"file": ("tickets.csv", FIXTURE_CSV.encode(), "text/csv")},
    )
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["accepted_count"] == 15, report
    return project["id"], dataset["id"]


def _register_provider(client: TestClient, base_url: str) -> dict[str, Any]:
    global_rate_limiter.reset()
    response = client.post("/api/v1/provider-credentials", json={
        "provider": "openai",
        "label": "Local stub (OpenAI-compatible)",
        "api_key": "sk-stub-key-12345",
        "base_url": base_url,
        "models": ["gpt-4o-mini"],
        "is_default": True,
    })
    assert response.status_code in (200, 201), response.text
    return response.json()


def _approve_all(client: TestClient, dataset_id: str) -> list[str]:
    queue = client.get(f"/api/v1/datasets/{dataset_id}/queue", params={"limit": 100}).json()
    record_ids = [item["id"] for item in queue["items"]]
    global_rate_limiter.reset()
    bulk = client.post(f"/api/v1/datasets/{dataset_id}/review/bulk",
                       json={"record_ids": record_ids, "action": "approve", "reason": "gold"})
    assert bulk.status_code == 200, bulk.text
    return record_ids


def _model_annotations(dataset_id: str) -> list[dict[str, Any]]:
    """Model-origin annotation rows as plain dicts (session-safe)."""
    with get_db_session() as session:
        rows = session.scalars(
            select(AnnotationModel).where(
                AnnotationModel.dataset_id == dataset_id,
                AnnotationModel.origin == "model",
            )
        ).all()
        return [
            {
                "id": row.id,
                "status": row.status,
                "origin": row.origin,
                "processing_run_id": row.processing_run_id,
                "payload": dict(row.payload or {}),
            }
            for row in rows
        ]


# -------------------------------------------------------------------- tests ----


def test_real_openai_adapter_labels_dataset_and_accuracy_is_measured(client, stub_server):
    """The production OpenAI adapter performs real HTTP and its proposals are scored."""
    _project_id, dataset_id = _make_text_dataset(client)
    _approve_all(client, dataset_id)
    credential = _register_provider(client, stub_server)

    # Key is stored masked, never returned in clear text.
    assert "sk-stub-key-12345" not in json.dumps(credential)

    global_rate_limiter.reset()
    run = client.post(f"/api/v1/datasets/{dataset_id}/ai-annotate", json={
        "provider": "openai",
        "model": "gpt-4o-mini",
        "only_unannotated": False,
        "limit": 100,
    })
    assert run.status_code == 202, run.text
    run_body = run.json()
    assert run_body["processed_items"] == 15, run_body
    assert run_body["failed_items"] == 0, run_body

    # --- real transport happened: the stub was called once per record ---
    assert len(_State.calls) == 15, len(_State.calls)
    assert all(c["path"].endswith("/chat/completions") for c in _State.calls)
    assert all(c["auth"] == "Bearer sk-stub-key-12345" for c in _State.calls)
    assert all(c["model"] == "gpt-4o-mini" for c in _State.calls)
    assert all(c["response_format"] == {"type": "json_object"} for c in _State.calls)
    # the prompt actually carried the record's text
    assert any("charged twice" in c["prompt"] for c in _State.calls)

    # --- proposals are model-origin, pending_review, with provenance, never approved ---
    proposals = _model_annotations(dataset_id)
    assert len(proposals) == 15
    assert {p["status"] for p in proposals} == {"pending_review"}
    assert {p["origin"] for p in proposals} == {"model"}
    assert all(p["processing_run_id"] == run_body["id"] for p in proposals)
    assert {p["payload"].get("label") for p in proposals} <= {
        "billing", "technical_support", "feature_request", "general_inquiry"
    }

    # --- accuracy against the gold (imported, approved) labels, measured honestly ---
    global_rate_limiter.reset()
    evaluation = client.post(f"/api/v1/datasets/{dataset_id}/evaluation/run",
                             json={"split": "train"})
    assert evaluation.status_code == 200, evaluation.text
    report = evaluation.json()
    assert report["total_samples"] == 15, report
    # The stub classifier agrees with every fixture label by construction.
    assert report["accuracy"] == pytest.approx(1.0), report
    assert report["gold_source"] in {"imported_approved", "human_and_imported_approved"}
    assert report["candidate_source"] == "model"
    assert report["metadata"]["provider"] == "openai"
    assert report["metadata"]["model"] == "gpt-4o-mini"
    assert report["confusion_matrix"], report

    # --- persisted and retrievable ---
    runs = client.get(f"/api/v1/datasets/{dataset_id}/evaluation/runs").json()
    assert len(runs) >= 1
    assert runs[0]["total_samples"] == 15

    # --- the approved gold annotation outranks the proposal: publishing is allowed, but
    # --- the frozen manifest must contain the GOLD label, never the unapproved model output.
    freeze = client.post(f"/api/v1/datasets/{dataset_id}/versions", json={"version_tag": "1.0.0"})
    assert freeze.status_code == 200, freeze.text
    manifest = client.get(f"/api/v1/versions/{freeze.json()['id']}/manifest").json()
    assert manifest["record_count"] == 15
    for record in manifest["records"]:
        annotation = record["annotation"]
        assert annotation is not None, record
        assert annotation["origin"] == "imported", annotation
        assert annotation["status"] == "approved", annotation
        assert annotation["payload"]["label"] == record["metadata"]["label"], record
    # no model-origin annotation leaked into the immutable snapshot
    assert all(r["annotation"]["origin"] != "model" for r in manifest["records"])


def test_malformed_provider_output_fails_items_without_corrupting_dataset(client, stub_server):
    """A model that returns non-JSON is isolated per record: failed items, no bad annotations."""
    _project_id, dataset_id = _make_text_dataset(client)
    _approve_all(client, dataset_id)
    _register_provider(client, stub_server)
    _State.mode = "malformed"

    global_rate_limiter.reset()
    run = client.post(f"/api/v1/datasets/{dataset_id}/ai-annotate", json={
        "provider": "openai", "model": "gpt-4o-mini", "only_unannotated": False, "limit": 3,
    })
    assert run.status_code == 202, run.text
    body = run.json()
    assert body["failed_items"] == 3, body
    assert body["processed_items"] == 0, body
    assert body["status"] == "failed", body
    # no model annotations were persisted for the failed records
    assert _model_annotations(dataset_id) == []
    # dataset remains valid/publishable with its gold labels only
    validation = client.post(f"/api/v1/datasets/{dataset_id}/validate").json()
    assert validation["is_publishable"] is True, validation


def test_authentication_failure_is_reported_and_isolated(client, stub_server):
    """A rejected key surfaces as run failures, never as silently missing data."""
    _project_id, dataset_id = _make_text_dataset(client)
    _approve_all(client, dataset_id)
    _register_provider(client, stub_server)
    _State.mode = "unauthorized"

    global_rate_limiter.reset()
    run = client.post(f"/api/v1/datasets/{dataset_id}/ai-annotate", json={
        "provider": "openai", "model": "gpt-4o-mini", "only_unannotated": False, "limit": 2,
    })
    assert run.status_code == 202, run.text
    body = run.json()
    assert body["failed_items"] == 2, body
    assert _model_annotations(dataset_id) == []
    detail = client.get(f"/api/v1/runs/{body['id']}").json()
    assert any("auth" in (item.get("error_message") or "").lower()
               or "invalid" in (item.get("error_message") or "").lower()
               for item in detail["items"]), detail
