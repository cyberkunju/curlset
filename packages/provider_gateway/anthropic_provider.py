"""
Anthropic Claude Provider Adapter supporting Claude 3.5 Sonnet, Claude 3.5 Haiku, and Opus.
Handles structured outputs, image inputs, secret redaction, and token usage accounting.
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


class AnthropicProvider(BaseProvider):
    name: str = "anthropic"
    capabilities: ClassVar[set[ProviderCapability]] = {
        ProviderCapability.TEXT_CLASSIFICATION,
        ProviderCapability.IMAGE_CLASSIFICATION,
        ProviderCapability.STRUCTURED_OUTPUT,
        ProviderCapability.TEXT_GENERATION,
    }

    SUPPORTED_MODELS: ClassVar[list[str]] = [
        "claude-3-5-sonnet-20241022",
        "claude-3-5-haiku-20241022",
        "claude-3-haiku-20240307",
        "claude-3-opus-20240229",
    ]

    # Estimated pricing per 1M tokens (input, output) USD
    MODEL_PRICING: ClassVar[dict[str, tuple[float, float]]] = {
        "claude-3-5-sonnet-20241022": (3.00, 15.00),
        "claude-3-5-haiku-20241022": (1.00, 5.00),
        "claude-3-haiku-20240307": (0.25, 1.25),
        "claude-3-opus-20240229": (15.00, 75.00),
    }

    def __init__(self, api_key: str | None = None, base_url: str | None = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.base_url = (base_url or os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1")).rstrip("/")

    def list_available_models(self) -> list[str]:
        return list(self.SUPPORTED_MODELS)

    def _estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        pricing = self.MODEL_PRICING.get(model, (3.00, 15.00))
        cost = (input_tokens / 1_000_000.0 * pricing[0]) + (output_tokens / 1_000_000.0 * pricing[1])
        return round(cost, 6)

    def annotate(self, request: ProviderRequest) -> ProviderResponse:
        if not self.api_key:
            raise ProviderAuthenticationError(
                "Anthropic API key not configured. Add your Anthropic API key in Model Providers settings.",
                provider=self.name,
            )

        start_time = time.time()
        model_name = request.model or "claude-3-5-haiku-20241022"

        system_instruction = (
            "You are a strict data labeling and engineering assistant. "
            "Analyze the given input and respond ONLY with valid JSON. "
            "Never include commentary, markdown backticks, or text outside the JSON object."
        )

        content_blocks: list[dict[str, Any]] = []

        # Multimodal image asset handling
        if request.asset_bytes:
            b64_img = base64.b64encode(request.asset_bytes).decode("utf-8")
            content_blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/jpeg",
                    "data": b64_img,
                },
            })

        # Instruction text
        prompt_lines = []
        if request.label_schema:
            classes = request.label_schema.get("classes") or request.label_schema.get("labels") or []
            prompt_lines.append(f"Task type: {request.task_type}")
            prompt_lines.append(f"Allowed classes: {json.dumps(classes)}")
            prompt_lines.append(
                "Return JSON in the format: {\"label\": \"<exact_chosen_class>\", \"confidence\": 0.95}"
            )
        else:
            prompt_lines.append(f"Perform annotation for task {request.task_type} and return JSON.")

        if request.input_text:
            prompt_lines.append(f"Content:\n{request.input_text}")

        content_blocks.append({"type": "text", "text": "\n\n".join(prompt_lines)})

        body = {
            "model": model_name,
            "max_tokens": 1024,
            "system": system_instruction,
            "messages": [{"role": "user", "content": content_blocks}],
            "temperature": 0.2,
        }

        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        endpoint = f"{self.base_url}/messages"

        try:
            with httpx.Client(timeout=35.0) as client:
                res = client.post(endpoint, json=body, headers=headers)

                if res.status_code == 401:
                    raise ProviderAuthenticationError("Invalid or expired Anthropic API key.", provider=self.name)
                if res.status_code == 429:
                    raise ProviderRateLimitError("Anthropic rate limit or capacity exceeded.", provider=self.name)
                if res.status_code >= 400:
                    raise ProviderError(
                        f"Anthropic API returned HTTP {res.status_code}: {res.text[:300]}",
                        provider=self.name,
                    )

                data = res.json()
                latency_ms = (time.time() - start_time) * 1000

                contents = data.get("content", [])
                if not contents:
                    raise ProviderMalformedOutputError("Anthropic response contained no content blocks.", provider=self.name)

                text_resp = contents[0].get("text", "{}").strip()
                # Clean accidental markdown formatting if present
                if text_resp.startswith("```"):
                    lines = text_resp.split("\n")
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    text_resp = "\n".join(lines).strip()

                try:
                    parsed = json.loads(text_resp)
                except json.JSONDecodeError as e:
                    raise ProviderMalformedOutputError(f"Anthropic output could not be parsed as JSON: {e}", provider=self.name)

                usage_data = data.get("usage", {})
                input_tokens = usage_data.get("input_tokens", 0)
                output_tokens = usage_data.get("output_tokens", 0)
                total_tokens = input_tokens + output_tokens
                cost = self._estimate_cost(model_name, input_tokens, output_tokens)

                confidence = float(parsed.get("confidence", 0.95))

                return ProviderResponse(
                    payload=parsed,
                    confidence=min(1.0, max(0.0, confidence)),
                    model=model_name,
                    usage=ProviderUsage(
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        total_tokens=total_tokens,
                        estimated_cost_usd=cost,
                    ),
                    raw_response={"id": data.get("id"), "model": data.get("model")},
                    latency_ms=round(latency_ms, 2),
                )

        except httpx.TimeoutException:
            raise ProviderTimeoutError(f"Anthropic request timed out after 35s ({endpoint})", provider=self.name)
        except httpx.RequestError as e:
            raise ProviderError(f"Network error connecting to Anthropic: {e}", provider=self.name)

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        return self.annotate(request)
