"""
Abstract base class for all AI model providers.
"""
from abc import ABC, abstractmethod
from typing import ClassVar

from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderRequest,
    ProviderResponse,
)


class BaseProvider(ABC):
    name: str = "base"
    capabilities: ClassVar[set[ProviderCapability]] = set()

    def supports_capability(self, capability: ProviderCapability) -> bool:
        return capability in self.capabilities

    @abstractmethod
    def annotate(self, request: ProviderRequest) -> ProviderResponse:
        """
        Execute model inference and return normalized ProviderResponse.
        Must raise normalized ProviderError subclasses on failures.
        """

    @abstractmethod
    def list_available_models(self) -> list[str]:
        """Return list of supported/configured model identifiers."""
