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
    }

    def __init__(self, simulation_mode: str = "normal"):
        self.simulation_mode = simulation_mode

    def list_available_models(self) -> list[str]:
        return [
            "fake-classifier-v1",
            "fake-vision-v1",
            "fake-detector-v1",
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
