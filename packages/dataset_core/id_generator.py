"""
Deterministic and collision-resistant stable ID generator for domain entities.
"""
import secrets
import string
import time

PREFIX_MAP = {
    "project": "prj",
    "dataset": "ds",
    "record": "rec",
    "asset": "ast",
    "annotation": "ann",
    "revision": "rev",
    "source": "src",
    "run": "run",
    "run_item": "item",
    "version": "ver",
    "version_item": "vi",
    "export": "exp",
    "event": "evt",
}


def generate_id(entity_type: str) -> str:
    """
    Generate a stable, human-readable, prefixed identifier.
    Format: <prefix>_<timestamp_hex><random_token>
    e.g. prj_653a1f8b2c4e9
    """
    prefix = PREFIX_MAP.get(entity_type, entity_type[:3])
    timestamp_hex = hex(int(time.time() * 1000))[2:]
    alphabet = string.ascii_lowercase + string.digits
    random_suffix = "".join(secrets.choice(alphabet) for _ in range(6))
    return f"{prefix}_{timestamp_hex}{random_suffix}"
