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
