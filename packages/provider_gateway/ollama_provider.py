"""
Local Ollama adapter for open-weights models running offline on the developer's machine.
Zero paid credentials, zero cloud leakage.
"""
import json
import os
import time
import urllib.error
import urllib.request
from typing import ClassVar

from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderError,
    ProviderMalformedOutputError,
    ProviderRequest,
    ProviderResponse,
    ProviderTimeoutError,
    ProviderUsage,
)


class OllamaProvider(BaseProvider):
    name: str = "ollama"
    capabilities: ClassVar[set[ProviderCapability]] = {
        ProviderCapability.TEXT_CLASSIFICATION,
        ProviderCapability.STRUCTURED_OUTPUT,
    }

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")).rstrip("/")

    def list_available_models(self) -> list[str]:
        return ["llama3.2", "mistral", "qwen2.5", "phi3"]

    def annotate(self, request: ProviderRequest) -> ProviderResponse:
        start_time = time.time()
        url = f"{self.base_url}/api/generate"

        allowed_classes = []
        if request.label_schema:
            if "classes" in request.label_schema and isinstance(request.label_schema["classes"], list):
                allowed_classes = request.label_schema["classes"]
            elif "labels" in request.label_schema and isinstance(request.label_schema["labels"], list):
                allowed_classes = request.label_schema["labels"]

        prompt = (
            f"You are a strict data classifier. Classify the following input into exactly one of: {allowed_classes}.\n"
            f"Respond ONLY with valid JSON: {{\"label\": \"<chosen_class>\", \"confidence\": 0.95}}\n\n"
            f"Input: {request.input_text}\n"
        )

        body = {
            "model": request.model or "llama3.2",
            "prompt": prompt,
            "format": "json",
            "stream": False,
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                raw_text = data.get("response", "{}")
                parsed = json.loads(raw_text)

                latency_ms = (time.time() - start_time) * 1000
                prompt_eval_count = data.get("prompt_eval_count", 0)
                eval_count = data.get("eval_count", 0)

                return ProviderResponse(
                    payload=parsed,
                    confidence=float(parsed.get("confidence", 0.9)),
                    model=request.model,
                    usage=ProviderUsage(
                        input_tokens=prompt_eval_count,
                        output_tokens=eval_count,
                        total_tokens=prompt_eval_count + eval_count,
                    ),
                    raw_response={"ollama_response": raw_text},
                    latency_ms=round(latency_ms, 2),
                )
        except urllib.error.HTTPError as e:
            raise ProviderError(f"Ollama HTTP error: {e.code} {e.reason}", provider=self.name)
        except urllib.error.URLError as e:
            raise ProviderError(
                f"Local Ollama instance unreachable at {self.base_url} ({e.reason}). Ensure Ollama is running.",
                provider=self.name,
            )
        except TimeoutError:
            raise ProviderTimeoutError(f"Ollama inference timed out after 30s at {self.base_url}", provider=self.name)
        except json.JSONDecodeError as e:
            raise ProviderMalformedOutputError(f"Ollama returned malformed JSON: {e}", provider=self.name)
