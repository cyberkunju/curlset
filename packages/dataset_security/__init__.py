"""
Hosted security, multi-tenant RBAC, quotas, rate limiting, and audit logging.
"""
from packages.dataset_security.audit import AuditService
from packages.dataset_security.auth import (
    get_auth_user,
    verify_dataset_access,
    verify_project_access,
)
from packages.dataset_security.quotas import QuotaManager
from packages.dataset_security.rate_limiter import RateLimiter, global_rate_limiter
from packages.dataset_security.redaction import (
    redact_sensitive_data,
    sanitize_error_dict,
)
from packages.dataset_security.roles import UserRole, has_permission

__all__ = [
    "AuditService",
    "QuotaManager",
    "RateLimiter",
    "UserRole",
    "get_auth_user",
    "global_rate_limiter",
    "has_permission",
    "redact_sensitive_data",
    "sanitize_error_dict",
    "verify_dataset_access",
    "verify_project_access",
]
