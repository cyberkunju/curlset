"""
Provider types, capability definitions, and normalized exception hierarchy.
"""
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ProviderCapability(str, Enum):
    TEXT_CLASSIFICATION = "text_classification"
    IMAGE_CLASSIFICATION = "image_classification"
    OBJECT_DETECTION = "object_detection"
    STRUCTURED_OUTPUT = "structured_output"
    EMBEDDINGS = "embeddings"


class ProviderRequest(BaseModel):
    model: str
    task_type: str
    input_text: str | None = None
    asset_bytes: bytes | None = None
    label_schema: dict[str, Any] | None = None
    prompt_template: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)


class ProviderUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0


class ProviderResponse(BaseModel):
    payload: dict[str, Any]
    confidence: float = 1.0
    model: str
    usage: ProviderUsage = Field(default_factory=ProviderUsage)
    raw_response: dict[str, Any] = Field(default_factory=dict)
    latency_ms: float = 0.0


# Normalized exception hierarchy
class ProviderError(Exception):
    def __init__(self, message: str, provider: str = "", details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.provider = provider
        self.details = details or {}


class ProviderAuthenticationError(ProviderError):
    pass


class ProviderTimeoutError(ProviderError):
    pass


class ProviderRateLimitError(ProviderError):
    pass


class ProviderMalformedOutputError(ProviderError):
    pass
