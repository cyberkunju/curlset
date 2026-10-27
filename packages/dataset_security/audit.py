"""
Audit trail logging service for tracking security, administrative, and data lifecycle actions.
"""
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from packages.dataset_core.db.models import AuditLogModel
from packages.dataset_security.redaction import redact_sensitive_data


class AuditService:
    """Records and queries immutable audit trail entries."""

    @classmethod
    def record_event(
        cls,
        session: Session,
        project_id: str | None,
        user_id: str,
        action: str,
        resource_type: str,
        resource_id: str | None = None,
        details: dict[str, Any] | None = None,
        ip_address: str | None = None,
    ) -> AuditLogModel:
        """Create and persist an auditable security/operational event with sensitive fields redacted."""
        safe_details = redact_sensitive_data(details or {})

        entry = AuditLogModel(
            id=f"audit_{uuid.uuid4().hex[:16]}",
            project_id=project_id,
            user_id=user_id,
            action=action.upper(),
            resource_type=resource_type,
            resource_id=resource_id,
            details=safe_details,
            ip_address=ip_address,
        )
        session.add(entry)
        session.flush()
        return entry

    @classmethod
    def list_events(
        cls,
        session: Session,
        project_id: str,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        """Query recent audit events for a project, newest first."""
        query = (
            select(AuditLogModel)
            .where(AuditLogModel.project_id == project_id)
            .order_by(AuditLogModel.created_at.desc())
            .limit(limit)
        )
        results = session.scalars(query).all()
        return [
            {
                "id": log.id,
                "project_id": log.project_id,
                "user_id": log.user_id,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "details": log.details,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in results
        ]
