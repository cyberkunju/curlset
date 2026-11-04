"""
Deterministic Fake AI Provider for automated tests and offline development.
Requires 0 credentials, 0 cost, and enables repeatable testing of all error modes.
"""
import hashlib
import time
from typing import ClassVar

from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.types import (
    ProviderAuthenticationError,
    ProviderCapability,
    ProviderRateLimitError,
    ProviderRequest,
    ProviderResponse,
    ProviderTimeoutError,
    ProviderUsage,
)


class FakeProvider(BaseProvider):
    name: str = "fake"
    capabilities: ClassVar[set[ProviderCapability]] = {
        ProviderCapability.TEXT_CLASSIFICATION,
        ProviderCapability.IMAGE_CLASSIFICATION,
        ProviderCapability.OBJECT_DETECTION,
        ProviderCapability.STRUCTURED_OUTPUT,
        ProviderCapability.TEXT_GENERATION,
        # NOTE: no IMAGE_GENERATION — this provider returns text samples, not image bytes.
    }

    def __init__(self, simulation_mode: str = "normal"):
        self.simulation_mode = simulation_mode

    def detect(self, request: ProviderRequest) -> ProviderResponse:
        """Deterministic offline boxes (truthful OBJECT_DETECTION capability)."""
        concept = str((request.parameters or {}).get("concept") or "object")
        return ProviderResponse(
            payload={
                "concept": concept,
                "boxes": [{
                    "x": 4, "y": 6, "width": 20, "height": 16, "confidence": 0.5,
                    "object_id": 1, "frame_index": 0, "frame": {"width": 64, "height": 64},
                    "label": concept,
                }],
                "model": (self._models[0] if getattr(self, "_models", None) else "fake"),
            },
            confidence=0.5,
            model=(self._models[0] if getattr(self, "_models", None) else "fake"),
        )

    def list_available_models(self) -> list[str]:
        return [
            "fake-classifier-v1",
            "fake-vision-v1",
            "fake-detector-v1",
            "fake-text-generator-v1",
            "fake-image-generator-v1",
        ]


    def annotate(self, request: ProviderRequest) -> ProviderResponse:
        start_time = time.time()

        # Simulate failure modes when requested
        if self.simulation_mode == "timeout":
            raise ProviderTimeoutError("Inference timed out after 30s.", provider=self.name)
        if self.simulation_mode == "rate_limit":
            raise ProviderRateLimitError("Rate limit exceeded (429 Too Many Requests).", provider=self.name)
        if self.simulation_mode == "auth_error":
            raise ProviderAuthenticationError("Invalid API Key or unauthorized access.", provider=self.name)
        if self.simulation_mode == "malformed":
            return ProviderResponse(
                payload={"corrupt_key": 12345},  # Missing 'label'
                confidence=0.5,
                model=request.model,
                usage=ProviderUsage(input_tokens=10, output_tokens=5, total_tokens=15),
                raw_response={"error": "corrupt"},
                latency_ms=(time.time() - start_time) * 1000,
            )

        # Determine allowed classes from label schema
        classes = ["positive", "neutral", "negative"]
        if request.label_schema:
            if "classes" in request.label_schema and isinstance(request.label_schema["classes"], list):
                classes = [str(c) for c in request.label_schema["classes"]]
            elif "labels" in request.label_schema and isinstance(request.label_schema["labels"], list):
                classes = [str(c) for c in request.label_schema["labels"]]

        # Deterministic label selection based on content or hash
        seed_str = request.input_text or (str(len(request.asset_bytes)) if request.asset_bytes else "default_seed")
        hash_val = int(hashlib.sha256(seed_str.encode("utf-8")).hexdigest()[:8], 16)
        chosen_class = classes[hash_val % len(classes)]

        # Keyword heuristics for text if applicable
        if request.input_text:
            lower = request.input_text.lower()
            if any(w in lower for w in ["good", "great", "excellent", "clean", "superb"]) and "positive" in classes:
                chosen_class = "positive"
            elif any(w in lower for w in ["bad", "terrible", "defective", "corrupt", "awful"]) and "negative" in classes:
                chosen_class = "negative"

        payload = {"label": chosen_class}
        if request.task_type == "text_classification":
            payload["rationale"] = f"Deterministic fake inference matched '{chosen_class}'."
        elif request.task_type == "object_detection":
            payload = {
                "boxes": [
                    {"label": chosen_class, "x": 50, "y": 50, "w": 200, "h": 150, "confidence": 0.92}
                ]
            }

        latency_ms = (time.time() - start_time) * 1000

        return ProviderResponse(
            payload=payload,
            confidence=0.92,
            model=request.model or "fake-classifier-v1",
            usage=ProviderUsage(input_tokens=25, output_tokens=12, total_tokens=37, estimated_cost_usd=0.0),
            raw_response={"fake_decision": chosen_class, "seed_hash": hash_val},
            latency_ms=round(latency_ms, 2),
        )

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        """Generate synthetic text or image samples deterministically."""
        start_time = time.time()

        if self.simulation_mode == "timeout":
            raise ProviderTimeoutError("Synthetic generation timed out after 30s.", provider=self.name)
        if self.simulation_mode == "rate_limit":
            raise ProviderRateLimitError("Rate limit exceeded for synthetic generation.", provider=self.name)
        if self.simulation_mode == "auth_error":
            raise ProviderAuthenticationError("Unauthorized generation request.", provider=self.name)
        if self.simulation_mode == "malformed":
            return ProviderResponse(
                payload={"corrupted_gen": True},
                confidence=0.0,
                model=request.model,
                usage=ProviderUsage(input_tokens=5, output_tokens=2, total_tokens=7),
            )

        target_class = request.parameters.get("target_class", "positive")
        index = request.parameters.get("index", 0)
        seed = request.parameters.get("seed", 42)

        # Diverse template pools for text generation
        sample_corpora = {
            "positive": [
                "Exceptional performance and outstanding reliability under heavy production load.",
                "The interface is remarkably responsive, intuitive, and beautifully designed.",
                "Clean implementation with superb error diagnostics and comprehensive documentation.",
                "Delivered accurate predictions with exceptionally low latency and high stability.",
                "Outstanding user experience, highly recommended for professional enterprise workflows.",
            ],
            "negative": [
                "Encountered unexpected system degradation, unhandled exceptions, and poor performance.",
                "Defective output schema caused critical pipeline interruption during processing.",
                "Extremely sluggish response times with frequent connection timeouts under normal usage.",
                "Inconsistent validation checks failed to identify corrupt and malformed input records.",
                "Frustrating UX with confusing navigation, dead ends, and missing error feedback.",
            ],
            "neutral": [
                "The model processed the incoming batch and returned standard status code 200.",
                "Telemetry shows typical baseline resource utilization during the evaluation cycle.",
                "Standard data formatting was applied according to configuration schema version 1.",
                "The scheduled backup script executed at standard midnight interval as configured.",
                "The sensor reported nominal ambient temperature and pressure readings without anomaly.",
            ],
        }

        pool = sample_corpora.get(target_class, sample_corpora["neutral"])
        selected_text = pool[(index + seed) % len(pool)]
        # Inject deterministic unique salt per index so duplicates only happen if requested
        unique_text = f"{selected_text} [Synth-{target_class.upper()} #{index}]"

        payload = {
            "text": unique_text,
            "target_class": target_class,
            "prompt_template": request.prompt_template or "Generate high-quality samples for {class_name}",
            "index": index,
        }

        latency_ms = (time.time() - start_time) * 1000

        return ProviderResponse(
            payload=payload,
            confidence=0.95,
            model=request.model or "fake-text-generator-v1",
            usage=ProviderUsage(input_tokens=40, output_tokens=25, total_tokens=65, estimated_cost_usd=0.0),
            raw_response={"synthetic_mode": True, "index": index, "target_class": target_class},
            latency_ms=round(latency_ms, 2),
        )

