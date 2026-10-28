"""
OpenAI Provider Adapter supporting GPT-4o, GPT-4o-mini, embeddings, and vision tasks.
All calls route through backend with secret redaction and error normalization.
"""
import base64
import json
import os
import time
from typing import Any, ClassVar

import httpx

from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.types import (
    ProviderAuthenticationError,
    ProviderCapability,
    ProviderError,
    ProviderMalformedOutputError,
    ProviderRateLimitError,
    ProviderRequest,
    ProviderResponse,
    ProviderTimeoutError,
    ProviderUsage,
)


class OpenAIProvider(BaseProvider):
    name: str = "openai"
    capabilities: ClassVar[set[ProviderCapability]] = {
        ProviderCapability.TEXT_CLASSIFICATION,
        ProviderCapability.IMAGE_CLASSIFICATION,
        ProviderCapability.OBJECT_DETECTION,
        ProviderCapability.STRUCTURED_OUTPUT,
        ProviderCapability.TEXT_GENERATION,
        ProviderCapability.EMBEDDINGS,
    }

    SUPPORTED_MODELS: ClassVar[list[str]] = [
        "gpt-4o",
        "gpt-4o-mini",
        "gpt-4-turbo",
        "gpt-3.5-turbo",
        "text-embedding-3-small",
    ]

    # Estimated pricing per 1M tokens (input, output) USD
    MODEL_PRICING: ClassVar[dict[str, tuple[float, float]]] = {
        "gpt-4o": (2.50, 10.00),
        "gpt-4o-mini": (0.15, 0.60),
        "gpt-4-turbo": (10.00, 30.00),
        "gpt-3.5-turbo": (0.50, 1.50),
    }

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        self.base_url = (base_url or os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")).rstrip("/")

    def list_available_models(self) -> list[str]:
        return list(self.SUPPORTED_MODELS)

    def _estimate_cost(self, model: str, prompt_tokens: int, completion_tokens: int) -> float:
        pricing = self.MODEL_PRICING.get(model, (2.50, 10.00))
        cost = (prompt_tokens / 1_000_000.0 * pricing[0]) + (completion_tokens / 1_000_000.0 * pricing[1])
        return round(cost, 6)

    def annotate(self, request: ProviderRequest) -> ProviderResponse:
        if not self.api_key:
            raise ProviderAuthenticationError(
                "OpenAI API key not configured. Add your OpenAI API key in Model Providers settings.",
                provider=self.name,
            )

        start_time = time.time()
        model_name = request.model or "gpt-4o-mini"

        # Construct prompt and system instructions
        system_instruction = (
            "You are a precise data annotation and labeling engine. "
            "You strictly analyze the provided input and return ONLY valid JSON matching the requested schema."
        )

        user_content: list[dict[str, Any]] = []

        # Instructions with label schema
        prompt_lines = []
        if request.label_schema:
            classes = request.label_schema.get("classes") or request.label_schema.get("labels") or []
            prompt_lines.append(f"Target task: {request.task_type}")
            prompt_lines.append(f"Allowed classes: {json.dumps(classes)}")
            prompt_lines.append(
                "Respond with valid JSON containing: {\"label\": \"<chosen_class>\", \"confidence\": <float 0.0-1.0>}"
            )
        else:
            prompt_lines.append(f"Analyze input for {request.task_type} and return JSON output.")

        if request.input_text:
            prompt_lines.append(f"Input text:\n{request.input_text}")

        user_content.append({"type": "text", "text": "\n\n".join(prompt_lines)})

        # Multimodal image asset handling
        if request.asset_bytes:
            b64_img = base64.b64encode(request.asset_bytes).decode("utf-8")
            user_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{b64_img}",
                    "detail": "auto",
                },
            })

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_content if request.asset_bytes else "\n\n".join(prompt_lines)},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        endpoint = f"{self.base_url}/chat/completions"

        try:
            with httpx.Client(timeout=35.0) as client:
                res = client.post(endpoint, json=payload, headers=headers)

                if res.status_code == 401:
                    raise ProviderAuthenticationError("Invalid or expired OpenAI API key.", provider=self.name)
                if res.status_code == 429:
                    raise ProviderRateLimitError("OpenAI rate limit or quota exceeded.", provider=self.name)
                if res.status_code >= 400:
                    raise ProviderError(
                        f"OpenAI API returned HTTP {res.status_code}: {res.text[:300]}",
                        provider=self.name,
                    )

                data = res.json()
                latency_ms = (time.time() - start_time) * 1000

                choices = data.get("choices", [])
                if not choices:
                    raise ProviderMalformedOutputError("OpenAI response contained no choices.", provider=self.name)

                content_raw = choices[0].get("message", {}).get("content", "{}")
                try:
                    parsed_payload = json.loads(content_raw)
                except json.JSONDecodeError as e:
                    raise ProviderMalformedOutputError(f"OpenAI returned non-JSON content: {e}", provider=self.name)

                usage_data = data.get("usage", {})
                prompt_tokens = usage_data.get("prompt_tokens", 0)
                completion_tokens = usage_data.get("completion_tokens", 0)
                total_tokens = usage_data.get("total_tokens", prompt_tokens + completion_tokens)
                est_cost = self._estimate_cost(model_name, prompt_tokens, completion_tokens)

                confidence = float(parsed_payload.get("confidence", 0.95))

                return ProviderResponse(
                    payload=parsed_payload,
                    confidence=min(1.0, max(0.0, confidence)),
                    model=model_name,
                    usage=ProviderUsage(
                        input_tokens=prompt_tokens,
                        output_tokens=completion_tokens,
                        total_tokens=total_tokens,
                        estimated_cost_usd=est_cost,
                    ),
                    raw_response={"id": data.get("id"), "model": data.get("model")},
                    latency_ms=round(latency_ms, 2),
                )

        except httpx.TimeoutException:
            raise ProviderTimeoutError(f"OpenAI request timed out after 35s ({endpoint})", provider=self.name)
        except httpx.RequestError as e:
            raise ProviderError(f"Network error connecting to OpenAI: {e}", provider=self.name)

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        return self.annotate(request)
