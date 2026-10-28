"""
Generic OpenAI-Compatible Provider Adapter for Groq, DeepSeek, Mistral, LocalAI, and vLLM.
Allows configuring custom base URLs and API keys while retaining standard provider interfaces.
"""
import json
import time
from typing import ClassVar

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


class OpenAICompatibleProvider(BaseProvider):
    capabilities: ClassVar[set[ProviderCapability]] = {
        ProviderCapability.TEXT_CLASSIFICATION,
        ProviderCapability.STRUCTURED_OUTPUT,
        ProviderCapability.TEXT_GENERATION,
    }

    def __init__(
        self,
        name: str,
        api_key: str = "",
        base_url: str = "http://localhost:8000/v1",
        default_models: list[str] | None = None,
    ):
        self.name = name.lower()
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._models = default_models or ["default-model"]

    def list_available_models(self) -> list[str]:
        return list(self._models)

    def annotate(self, request: ProviderRequest) -> ProviderResponse:
        start_time = time.time()
        model_name = request.model or (self._models[0] if self._models else "default-model")

        system_prompt = (
            "You are a strict data classification and labeling model. "
            "Output ONLY valid JSON: {\"label\": \"<class>\", \"confidence\": 0.95}"
        )

        user_prompt = f"Task: {request.task_type}\n"
        if request.label_schema:
            classes = request.label_schema.get("classes") or request.label_schema.get("labels") or []
            user_prompt += f"Allowed classes: {json.dumps(classes)}\n"
        if request.input_text:
            user_prompt += f"Input:\n{request.input_text}"

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        endpoint = f"{self.base_url}/chat/completions"

        try:
            with httpx.Client(timeout=35.0) as client:
                res = client.post(endpoint, json=payload, headers=headers)
                if res.status_code == 401:
                    raise ProviderAuthenticationError(f"Authentication failed for {self.name}", provider=self.name)
                if res.status_code == 429:
                    raise ProviderRateLimitError(f"Rate limit exceeded for {self.name}", provider=self.name)
                if res.status_code >= 400:
                    raise ProviderError(f"{self.name} returned HTTP {res.status_code}: {res.text[:200]}", provider=self.name)

                data = res.json()
                latency_ms = (time.time() - start_time) * 1000
                choices = data.get("choices", [])
                if not choices:
                    raise ProviderMalformedOutputError("Response contained no choices.", provider=self.name)

                content_raw = choices[0].get("message", {}).get("content", "{}")
                parsed = json.loads(content_raw)

                usage_data = data.get("usage", {})
                prompt_tokens = usage_data.get("prompt_tokens", 0)
                completion_tokens = usage_data.get("completion_tokens", 0)

                return ProviderResponse(
                    payload=parsed,
                    confidence=float(parsed.get("confidence", 0.9)),
                    model=model_name,
                    usage=ProviderUsage(
                        input_tokens=prompt_tokens,
                        output_tokens=completion_tokens,
                        total_tokens=prompt_tokens + completion_tokens,
                    ),
                    raw_response={"id": data.get("id")},
                    latency_ms=round(latency_ms, 2),
                )
        except httpx.TimeoutException:
            raise ProviderTimeoutError(f"Request to {self.name} timed out after 35s", provider=self.name)
        except httpx.RequestError as e:
            raise ProviderError(f"Connection failure to {self.name} at {self.base_url}: {e}", provider=self.name)
        except json.JSONDecodeError as e:
            raise ProviderMalformedOutputError(f"Malformed JSON from {self.name}: {e}", provider=self.name)

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        return self.annotate(request)
