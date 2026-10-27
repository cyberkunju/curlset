"""
Provider Gateway registry managing provider lifecycle, bounded retries,
and strict secret redaction.
"""
import re
from typing import Any

from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.fake_provider import FakeProvider
from packages.provider_gateway.ollama_provider import OllamaProvider
from packages.provider_gateway.types import (
    ProviderError,
    ProviderRateLimitError,
    ProviderRequest,
    ProviderResponse,
    ProviderTimeoutError,
)

SECRET_KEY_PATTERNS = [
    re.compile(r"api[-_]?key", re.IGNORECASE),
    re.compile(r"auth(orization)?", re.IGNORECASE),
    re.compile(r"secret", re.IGNORECASE),
    re.compile(r"password", re.IGNORECASE),
    re.compile(r"token", re.IGNORECASE),
]


def redact_secrets(data: Any) -> Any:
    """Recursively scrub any sensitive authentication values or headers."""
    if isinstance(data, dict):
        scrubbed = {}
        for k, v in data.items():
            if any(pattern.search(k) for pattern in SECRET_KEY_PATTERNS):
                scrubbed[k] = "[REDACTED]"
            else:
                scrubbed[k] = redact_secrets(v)
        return scrubbed
    if isinstance(data, list):
        return [redact_secrets(item) for item in data]
    return data


class ProviderGateway:
    _instance: "ProviderGateway | None" = None

    def __init__(self):
        self._providers: dict[str, BaseProvider] = {}
        # Register standard default providers
        self.register_provider(FakeProvider())
        self.register_provider(OllamaProvider())

    @classmethod
    def get_instance(cls) -> "ProviderGateway":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def register_provider(self, provider: BaseProvider) -> None:
        self._providers[provider.name.lower()] = provider

    def get_provider(self, name: str) -> BaseProvider:
        key = name.lower()
        if key not in self._providers:
            raise ProviderError(f"Provider '{name}' is not registered or supported.", provider=name)
        return self._providers[key]

    def list_providers(self) -> list[dict[str, Any]]:
        result = []
        for name, p in self._providers.items():
            result.append({
                "name": name,
                "capabilities": [c.value for c in p.capabilities],
                "models": p.list_available_models(),
            })
        return result

    def execute(
        self,
        provider_name: str,
        request: ProviderRequest,
        max_retries: int = 1,
    ) -> ProviderResponse:
        """
        Execute request with bounded retry on transient rate-limits or timeouts.
        Logs and returns secret-redacted payloads.
        """
        provider = self.get_provider(provider_name)
        attempts = 0
        last_error: Exception | None = None

        while attempts <= max_retries:
            try:
                response = provider.annotate(request)
                response.raw_response = redact_secrets(response.raw_response)
                return response
            except (ProviderRateLimitError, ProviderTimeoutError) as e:
                attempts += 1
                last_error = e
                if attempts > max_retries:
                    raise
            except Exception:
                # Permanent or validation errors must not be retried
                raise

        if last_error:
            raise last_error
        raise ProviderError("Unexpected failure executing provider inference.", provider=provider_name)
