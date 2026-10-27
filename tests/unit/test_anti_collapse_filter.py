import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from packages.dataset_core.db.models import (
    Base,
    DatasetModel,
    DatasetRecordModel,
    ProjectModel,
)
from packages.dataset_synthesis.models import SynthesisBatchRequest
from packages.dataset_synthesis.service import SynthesisService
from packages.provider_gateway.fake_provider import FakeProvider


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        proj = ProjectModel(id="proj_synth", name="SynthProj", description="")
        session.add(proj)
        ds = DatasetModel(
            id="ds_synth",
            project_id="proj_synth",
            name="Synth Dataset",
            task_type="text_classification",
            label_schema={"classes": ["tech", "sports"]},
        )
        session.add(ds)
        session.commit()
        yield session


def test_anti_collapse_filter_rejects_repetitive_candidates(db_session, monkeypatch):
    # Seed an existing record
    existing = DatasetRecordModel(
        id="rec_existing",
        dataset_id="ds_synth",
        split="train",
        extra_metadata={"text": "The quick brown fox jumps over the lazy dog repeatedly."},
    )
    db_session.add(existing)
    db_session.commit()

    # Create a mock provider returning repetitive variant (> 0.72 3-gram Jaccard)
    class RepetitiveMockProvider(FakeProvider):
        def generate(self, req):
            resp = super().generate(req)
            # Return almost identical text
            resp.payload["text"] = "The quick brown fox jumps over the lazy dog repeatedly!"
            return resp

    monkeypatch.setattr(SynthesisService, "get_provider", lambda _: RepetitiveMockProvider())

    req = SynthesisBatchRequest(
        dataset_id="ds_synth",
        target_class="tech",
        count=3,
        prompt_template="Generate {class_name}",
        provider_name="fake",
    )

    summary = SynthesisService.generate_synthetic_batch(db_session, req)
    # Because all 3 generated candidates are near-identical to the existing record (>0.72 3-gram overlap),
    # the anti-collapse filter must reject them!
    assert summary.anti_collapse_rejected_count > 0
    assert summary.accepted_count == 0
