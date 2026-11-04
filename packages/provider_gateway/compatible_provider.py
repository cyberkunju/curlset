"""
Generic OpenAI-Compatible Provider Adapter for Groq, DeepSeek, Mistral, LocalAI, and vLLM.
Allows configuring custom base URLs and API keys while retaining standard provider interfaces.
"""
import base64
import json
import time
from typing import ClassVar

import httpx

from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.pricing import estimate_cost
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


def extract_json_object(content: str, *, provider: str = "") -> dict:
    """Pull the first JSON object out of a model response.

    Real reasoning models wrap JSON in markdown fences, prepend prose, or append a trailing
    sentence. Strict ``json.loads`` fails on all three, which would turn a perfectly good label
    into a failed item — so extraction is deliberate and bounded.
    """
    if not content or not content.strip():
        raise ProviderMalformedOutputError(
            f"{provider or 'Provider'} returned empty content (a reasoning model may have spent its "
            "whole completion budget on hidden reasoning tokens; raise the completion limit).",
            provider=provider,
        )
    text = content.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if text.count("```") >= 2 else text.lstrip("`")
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ProviderMalformedOutputError(
            f"{provider or 'Provider'} returned no JSON object: {content[:160]!r}", provider=provider
        )
    try:
        parsed = json.loads(text[start:end + 1])
    except json.JSONDecodeError as exc:
        raise ProviderMalformedOutputError(
            f"{provider or 'Provider'} returned invalid JSON: {exc}", provider=provider
        ) from exc
    if not isinstance(parsed, dict):
        raise ProviderMalformedOutputError(
            f"{provider or 'Provider'} returned JSON that is not an object", provider=provider
        )
    return parsed


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
        max_completion_tokens: int | None = None,
    ):
        self.name = name.lower()
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self._models = default_models or ["default-model"]
        # Reasoning models spend hidden reasoning tokens inside the completion budget: without a
        # generous limit they return empty content. Callers can pin it per provider.
        self.max_completion_tokens = max_completion_tokens

    @property
    def _token_param(self) -> str:
        """Newer OpenAI reasoning models reject `max_tokens`; other servers accept either."""
        model = (self._models[0] if self._models else "").lower()
        return "max_completion_tokens" if model.startswith(("gpt-5", "gpt-6", "o1", "o3", "o4")) else "max_tokens"

    def list_available_models(self) -> list[str]:
        return list(self._models)

    def _chat_completion(
        self,
        system_prompt: str,
        user_prompt: str,
        model_name: str,
        *,
        temperature: float = 0.2,
        image_bytes: bytes | None = None,
        image_mime: str = "image/png",
    ) -> ProviderResponse:
        """One chat completion with provider-compatible parameter handling.

        Transport-optional parameters (temperature / response_format / token limit) live outside the
        base payload so they can be stripped and retried when an endpoint rejects them — e.g. the
        gpt-5/6 family rejects ``temperature`` while other servers accept it.
        """
        start_time = time.time()

        user_content: object = user_prompt
        if image_bytes:
            # Multimodal chat payloads carry the image as a data URL next to the instructions.
            user_content = [
                {"type": "text", "text": user_prompt},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{image_mime};base64,{base64.b64encode(image_bytes).decode('ascii')}"
                    },
                },
            ]

        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        }

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        endpoint = f"{self.base_url}/chat/completions"

        optional_params: dict[str, object] = {}
        if self.max_completion_tokens:
            optional_params[self._token_param] = int(self.max_completion_tokens)
        optional_params["response_format"] = {"type": "json_object"}
        optional_params["temperature"] = temperature
        try:
            with httpx.Client(timeout=90.0) as client:
                response = None
                for _attempt in range(3):
                    attempt_payload = {**payload, **optional_params}
                    response = client.post(endpoint, json=attempt_payload, headers=headers)
                    if response.status_code < 400:
                        break
                    if response.status_code == 401:
                        raise ProviderAuthenticationError(
                            f"Authentication failed for {self.name}", provider=self.name
                        )
                    if response.status_code == 429:
                        raise ProviderRateLimitError(
                            f"Rate limit exceeded for {self.name}", provider=self.name
                        )
                    body = response.text
                    stripped = False
                    if response.status_code == 400:
                        if "temperature" in body and "temperature" in optional_params:
                            optional_params.pop("temperature", None)
                            stripped = True
                        if "response_format" in body and "response_format" in optional_params:
                            optional_params.pop("response_format", None)
                            stripped = True
                    if stripped:
                        continue
                    raise ProviderError(
                        f"{self.name} returned HTTP {response.status_code}: {body[:200]}",
                        provider=self.name,
                    )
                if response is None:  # pragma: no cover - defensive
                    raise ProviderError(f"{self.name} did not return a response", provider=self.name)
                if response.status_code >= 400:
                    raise ProviderError(
                        f"{self.name} returned HTTP {response.status_code}: {response.text[:200]}",
                        provider=self.name,
                    )

                data = response.json()
                latency_ms = (time.time() - start_time) * 1000
                choices = data.get("choices", [])
                if not choices:
                    raise ProviderMalformedOutputError("Response contained no choices.", provider=self.name)

                content_raw = choices[0].get("message", {}).get("content") or ""
                parsed = extract_json_object(str(content_raw), provider=self.name)

                usage_data = data.get("usage", {})
                prompt_tokens = usage_data.get("prompt_tokens", 0)
                completion_tokens = usage_data.get("completion_tokens", 0)
                cost_usd, _priced = estimate_cost(
                    self.name, model_name, prompt_tokens, completion_tokens
                )

                return ProviderResponse(
                    payload=parsed,
                    confidence=float(parsed.get("confidence", 0.9)),
                    model=model_name,
                    usage=ProviderUsage(
                        input_tokens=prompt_tokens,
                        output_tokens=completion_tokens,
                        total_tokens=prompt_tokens + completion_tokens,
                        estimated_cost_usd=cost_usd,
                    ),
                    raw_response={"id": data.get("id"), "content": str(content_raw)[:4000]},
                    latency_ms=round(latency_ms, 2),
                )
        except httpx.TimeoutException:
            raise ProviderTimeoutError(f"Request to {self.name} timed out after 35s", provider=self.name)
        except httpx.RequestError as e:
            raise ProviderError(f"Connection failure to {self.name} at {self.base_url}: {e}", provider=self.name)
        except json.JSONDecodeError as e:
            raise ProviderMalformedOutputError(f"Malformed JSON from {self.name}: {e}", provider=self.name)

    def annotate(self, request: ProviderRequest) -> ProviderResponse:
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

        return self._chat_completion(
            system_prompt,
            user_prompt,
            model_name,
            image_bytes=request.asset_bytes,
        )

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        """Generate one synthetic training example for a target label.

        Honest scope: one example per call. The wizard's job layer calls this once per item; batching
        several examples per request is a cost optimisation for a later phase, not a capability
        claim. ``style_hint`` and ``seed_examples`` come from an uploaded sample when the user
        provided one, so real providers imitate the sample's style instead of guessing.
        """
        model_name = request.model or (self._models[0] if self._models else "default-model")
        parameters = request.parameters or {}
        target = str(parameters.get("target_class") or "").strip()
        difficulty = str(parameters.get("difficulty") or "mixed")
        style_hint = str(parameters.get("style_hint") or "").strip()
        seed_examples = [str(item) for item in (parameters.get("seed_examples") or [])][:5]
        classes = [str(item) for item in (parameters.get("labels") or [])][:12]
        descriptors = str(parameters.get("description") or "").strip()

        system_prompt = (
            "You generate high-quality synthetic training data. Output ONLY valid JSON: "
            "{\"text\": \"<one example>\", \"label\": \"<class>\"}. "
            "Never repeat wording from previous examples; be specific and natural."
        )

        user_prompt = f"Task: {request.task_type}\n"
        if descriptors:
            user_prompt += f"Dataset description: {descriptors}\n"
        if classes:
            user_prompt += f"Allowed labels: {json.dumps(classes)}\n"
        if target:
            user_prompt += f"Write exactly one example whose label is: {target}\n"
        user_prompt += f"Difficulty: {difficulty}\n"
        if style_hint:
            user_prompt += f"Copy this style: {style_hint}\n"
        if seed_examples:
            user_prompt += "Match the style of these existing examples:\n"
            for index, example in enumerate(seed_examples, start=1):
                user_prompt += f"{index}. {example}\n"
        user_prompt += "Return one NEW example only."

        response = self._chat_completion(system_prompt, user_prompt, model_name, temperature=0.9)

        text = str(response.payload.get("text") or "").strip()
        if not text:
            raise ProviderMalformedOutputError(
                f"{self.name} returned no 'text' field when generating", provider=self.name
            )
        label = str(response.payload.get("label") or target).strip()
        if classes and label not in classes:
            # A provider that invents a label breaks the class contract: fall back to the requested
            # label rather than silently admitting an out-of-schema class.
            label = target

        return ProviderResponse(
            payload={"text": text, "target_class": label, "style_hint": style_hint},
            confidence=float(response.payload.get("confidence", 0.85)),
            model=model_name,
            usage=response.usage,
            raw_response=response.raw_response,
            latency_ms=response.latency_ms,
        )
