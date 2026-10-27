"""
Integration test suite for Phase 12: Synthetic-data generation & lineage tracking.
- Provider capability validation
- Schema vocabulary enforcement
- Batch synthesis with deterministic lineage & prompt configuration
- Review state gate: synthetic annotations MUST default to pending_review
- Duplicate prevention: exact duplicate hashes dropped
- Lineage query endpoint & real/synthetic ratio reporting
"""
from typing import ClassVar

import pytest
from httpx import ASGITransport, AsyncClient

from packages.dataset_core.constants import AnnotationOrigin, ReviewStatus, TaskType
from packages.dataset_core.db.models import (
    DatasetModel,
    DatasetRecordModel,
    ProjectModel,
)
from packages.dataset_core.db.session import get_db_session, init_database
from packages.dataset_quality.engine import QualityEngine
from packages.dataset_synthesis.service import SynthesisService
from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderRequest,
    ProviderResponse,
)
from services.api.main import app


class DummyUnsupportedProvider(BaseProvider):
    name = "unsupported_dummy"
    capabilities: ClassVar[set[ProviderCapability]] = {ProviderCapability.TEXT_CLASSIFICATION}  # Missing TEXT_GENERATION

    def list_available_models(self) -> list[str]:

        return ["unsupported-model"]

    def annotate(self, request: ProviderRequest) -> ProviderResponse:
        raise NotImplementedError()


@pytest.fixture(autouse=True)
def setup_database():
    init_database()
    with get_db_session() as session:
        proj = session.query(ProjectModel).filter_by(id="proj_phase12_synth").first()
        if not proj:
            proj = ProjectModel(
                id="proj_phase12_synth",
                name="Phase 12 Synthesis Project",
                description="Testing synthetic data generation",
            )
            session.add(proj)

        ds = session.query(DatasetModel).filter_by(id="ds_phase12_synth").first()
        if not ds:
            ds = DatasetModel(
                id="ds_phase12_synth",
                project_id="proj_phase12_synth",
                name="Synthesis Benchmark Dataset",
                description="Dataset for testing synthetic generation",
                task_type=TaskType.TEXT_CLASSIFICATION.value,
                schema_version=1,
                label_schema={"classes": ["positive", "neutral", "negative"]},
            )
            session.add(ds)
        else:
            # Purge any leftover records from prior test runs
            session.query(DatasetRecordModel).filter_by(dataset_id="ds_phase12_synth").delete()
        session.commit()

    SynthesisService.register_provider("unsupported", DummyUnsupportedProvider())



class TestSyntheticGenerationLifecycle:
    @pytest.mark.asyncio
    async def test_provider_capability_enforcement(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post(
                "/api/v1/datasets/ds_phase12_synth/synthesize",
                json={
                    "target_class": "positive",
                    "count": 3,
                    "provider_name": "unsupported",
                    "model_name": "unsupported-model",
                },
            )
            assert res.status_code == 422
            data = res.json()
            assert "TEXT_GENERATION" in data["detail"]["message"]

    @pytest.mark.asyncio
    async def test_target_class_schema_validation(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post(
                "/api/v1/datasets/ds_phase12_synth/synthesize",
                json={
                    "target_class": "unrecognized_class_xyz",
                    "count": 2,
                    "provider_name": "fake",
                    "model_name": "fake-text-generator-v1",
                },
            )
            assert res.status_code == 422
            data = res.json()
            assert "not in dataset schema" in data["detail"]["message"]

    @pytest.mark.asyncio
    async def test_batch_synthesis_lineage_and_review_gate(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            res = await client.post(
                "/api/v1/datasets/ds_phase12_synth/synthesize",
                json={
                    "target_class": "positive",
                    "count": 4,
                    "prompt_template": "Generate positive user sentiment: {class_name}",
                    "template_version": "v1.2-beta",
                    "seed": 101,
                    "provider_name": "fake",
                    "model_name": "fake-text-generator-v1",
                    "split": "train",
                },
            )
            assert res.status_code == 201, res.text
            summary = res.json()
            assert summary["requested_count"] == 4
            assert summary["accepted_count"] == 4
            assert summary["duplicate_count"] == 0
            assert summary["target_class"] == "positive"
            assert len(summary["record_ids"]) == 4

            # Verify in database: origin="synthetic" and status="pending_review"
            with get_db_session() as session:
                first_rec_id = summary["record_ids"][0]
                rec = session.query(DatasetRecordModel).filter_by(id=first_rec_id).first()
                assert rec is not None
                assert rec.extra_metadata["lineage"]["source"] == "synthetic"
                assert rec.extra_metadata["lineage"]["template_version"] == "v1.2-beta"
                assert rec.extra_metadata["lineage"]["seed"] == 101

                ann = rec.annotations[0]
                assert ann.origin == AnnotationOrigin.SYNTHETIC.value
                # Rule 6 invariant: synthetic samples must default to PENDING_REVIEW
                assert ann.status == ReviewStatus.PENDING_REVIEW.value
                assert ann.payload["label"] == "positive"

    @pytest.mark.asyncio
    async def test_duplicate_dropping(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. First run generates 3 samples
            res1 = await client.post(
                "/api/v1/datasets/ds_phase12_synth/synthesize",
                json={
                    "target_class": "positive",
                    "count": 3,
                    "prompt_template": "Generate positive user sentiment: {class_name}",
                    "template_version": "v1.2-beta",
                    "seed": 202,
                    "provider_name": "fake",
                    "model_name": "fake-text-generator-v1",
                },
            )
            assert res1.status_code == 201
            assert res1.json()["accepted_count"] == 3

            # 2. Re-running with identical seed & parameters drops duplicates
            res2 = await client.post(
                "/api/v1/datasets/ds_phase12_synth/synthesize",
                json={
                    "target_class": "positive",
                    "count": 3,
                    "prompt_template": "Generate positive user sentiment: {class_name}",
                    "template_version": "v1.2-beta",
                    "seed": 202,
                    "provider_name": "fake",
                    "model_name": "fake-text-generator-v1",
                },
            )
            assert res2.status_code == 201
            summary = res2.json()
            assert summary["duplicate_count"] == 3
            assert summary["accepted_count"] == 0

    @pytest.mark.asyncio
    async def test_synthetic_lineage_and_quality_disclosure(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # Generate batch first
            gen_res = await client.post(
                "/api/v1/datasets/ds_phase12_synth/synthesize",
                json={
                    "target_class": "neutral",
                    "count": 3,
                    "prompt_template": "Generate neutral user sentiment: {class_name}",
                    "template_version": "v1.0",
                    "seed": 303,
                    "provider_name": "fake",
                    "model_name": "fake-text-generator-v1",
                },
            )
            assert gen_res.status_code == 201

            res = await client.get("/api/v1/datasets/ds_phase12_synth/synthetic-lineage")
            assert res.status_code == 200
            lineage = res.json()
            assert lineage["synthetic_records"] > 0
            assert lineage["synthetic_ratio"] > 0.0
            assert len(lineage["runs"]) >= 1

        # Check QualityEngine reports synthetic proportion
        with get_db_session() as session:
            report = QualityEngine.validate_dataset(session=session, dataset_id="ds_phase12_synth")
            synth_findings = [f for f in report.findings if f.rule_id == "INFO_SYNTHETIC_PROPORTION"]
            assert len(synth_findings) == 1
            assert synth_findings[0].count == lineage["synthetic_records"]


