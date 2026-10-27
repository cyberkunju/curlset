"""
Domain exceptions and error categorization.
"""
from typing import Any


class DomainError(Exception):
    """Base domain exception with structured error code and message."""

    def __init__(
        self,
        message: str,
        code: str = "DOMAIN_ERROR",
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}


class DomainValidationError(DomainError):
    """Raised when an entity or payload fails domain validation constraints."""

    def __init__(self, message: str, field: str | None = None, details: dict[str, Any] | None = None):
        super().__init__(message, code="VALIDATION_ERROR", details=details)
        if field:
            self.details["field"] = field


class InvalidStateTransitionError(DomainError):
    """Raised when an illegal status transition is requested."""

    def __init__(self, from_state: str, to_state: str, details: dict[str, Any] | None = None):
        super().__init__(
            f"Illegal state transition from '{from_state}' to '{to_state}'",
            code="INVALID_STATE_TRANSITION",
            details=details,
        )
        self.details["from_state"] = from_state
        self.details["to_state"] = to_state


class ResourceNotFoundError(DomainError):
    """Raised when a requested resource does not exist."""

    def __init__(self, resource_type: str, resource_id: str):
        super().__init__(
            f"{resource_type} with ID '{resource_id}' not found",
            code="RESOURCE_NOT_FOUND",
            details={"resource_type": resource_type, "resource_id": resource_id},
        )


class ProjectOwnershipError(DomainError):
    """Raised when an operation violates project boundaries or ownership checks."""

    def __init__(self, message: str = "Access denied: resource belongs to a different project"):
        super().__init__(message, code="PROJECT_OWNERSHIP_VIOLATION")


class ImmutableVersionError(DomainError):
    """Raised when an attempt is made to mutate a published dataset version."""

    def __init__(self, version_id: str):
        super().__init__(
            f"Dataset version '{version_id}' is published and immutable.",
            code="IMMUTABLE_VERSION_VIOLATION",
            details={"version_id": version_id},
        )


class PublishingBlockedError(DomainError):
    """Raised when a dataset cannot be published due to blocking quality findings."""

    def __init__(self, message: str, blocking_count: int, findings: list[dict[str, Any]] | None = None):
        super().__init__(
            message,
            code="PUBLISHING_BLOCKED",
            details={"blocking_count": blocking_count, "findings": findings or []},
        )


class SSRFBlockedError(DomainError):
    """Raised when an outbound URL fetch targets a forbidden private or loopback IP."""

    def __init__(self, target_url: str, reason: str):
        super().__init__(
            f"Outbound request to '{target_url}' blocked by SSRF defense: {reason}",
            code="SSRF_TARGET_BLOCKED",
            details={"target_url": target_url, "reason": reason},
        )


class RightsViolationError(DomainError):
    """Raised when an action violates dataset rights or license policies."""

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        super().__init__(
            message,
            code="RIGHTS_VIOLATION",
            details=details or {},
        )


class QuotaExceededError(DomainError):
    """Raised when a storage, record, or resource quota is exceeded."""

    def __init__(self, resource: str, current: int, limit: int, unit: str = "bytes"):
        super().__init__(
            f"Quota exceeded for {resource}: current {current} {unit} exceeds limit of {limit} {unit}",
            code="QUOTA_EXCEEDED",
            details={"resource": resource, "current": current, "limit": limit, "unit": unit},
        )


class RateLimitExceededError(DomainError):
    """Raised when request rate limit is exceeded."""

    def __init__(self, retry_after: int = 60, message: str = "Rate limit exceeded. Please retry later."):
        super().__init__(
            message,
            code="RATE_LIMIT_EXCEEDED",
            details={"retry_after": retry_after},
        )
        self.retry_after = retry_after


class AccessForbiddenError(DomainError):
    """Raised when an authenticated user lacks permissions for a project resource."""

    def __init__(self, message: str = "Access forbidden for this project resource", details: dict[str, Any] | None = None):
        super().__init__(message, code="ACCESS_FORBIDDEN", details=details)

