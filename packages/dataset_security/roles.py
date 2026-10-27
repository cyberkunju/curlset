"""
Role-based access control roles and hierarchy.
"""
from enum import Enum


class UserRole(str, Enum):
    VIEWER = "viewer"
    EDITOR = "editor"
    OWNER = "owner"


ROLE_HIERARCHY = {
    UserRole.VIEWER.value: 1,
    UserRole.EDITOR.value: 2,
    UserRole.OWNER.value: 3,
}


def has_permission(user_role: str, required_role: str) -> bool:
    """Check if user_role satisfies required_role level."""
    user_level = ROLE_HIERARCHY.get(user_role.lower(), 0)
    required_level = ROLE_HIERARCHY.get(required_role.lower(), 1)
    return user_level >= required_level
