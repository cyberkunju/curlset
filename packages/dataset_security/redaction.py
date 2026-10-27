"""
Redaction engine to prevent secret, token, and sensitive payload leakage.
"""
from typing import Any

SENSITIVE_KEY_SUBSTRINGS = (
    "api_key",
    "apikey",
    "secret",
    "token",
    "authorization",
    "password",
    "passwd",
    "bearer",
    "private_key",
    "client_secret",
)


def redact_sensitive_data(val: Any) -> Any:
    """Recursively traverse data structures and mask sensitive keys."""
    if isinstance(val, dict):
        sanitized = {}
        for k, v in val.items():
            k_lower = str(k).lower()
            if any(sub in k_lower for sub in SENSITIVE_KEY_SUBSTRINGS):
                sanitized[k] = "***REDACTED***"
            else:
                sanitized[k] = redact_sensitive_data(v)
        return sanitized
    elif isinstance(val, list):
        return [redact_sensitive_data(item) for item in val]
    elif isinstance(val, tuple):
        return tuple(redact_sensitive_data(item) for item in val)
    elif isinstance(val, str):
        # Detect common API key patterns in raw string values
        val_lower = val.lower()
        if "sk-" in val or "bearer " in val_lower or "api_key=" in val_lower:
            return "***REDACTED***"
        return val
    return val


def sanitize_error_dict(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    """Sanitize error messages and details dictionaries before returning to client."""
    safe_details = redact_sensitive_data(details or {})
    safe_message = redact_sensitive_data(message)
    return {
        "code": code,
        "message": safe_message,
        "details": safe_details,
    }
