"""
Storage backend abstraction and local-first filesystem storage.
"""
from abc import ABC, abstractmethod
from pathlib import Path


class StorageBackend(ABC):
    @abstractmethod
    def write_bytes(self, key: str, data: bytes) -> str:
        """Write raw bytes to the specified opaque key. Returns stored path/URI."""

    @abstractmethod
    def read_bytes(self, key: str) -> bytes:
        """Read raw bytes from the specified opaque storage key."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Check if the given key exists in storage."""

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Delete object at key if present."""


class LocalStorageBackend(StorageBackend):
    def __init__(self, root_dir: str = "./data/storage"):
        self.root_path = Path(root_dir).resolve()
        self.root_path.mkdir(parents=True, exist_ok=True)

    def _resolve_key_path(self, key: str) -> Path:
        # Prevent any path traversal in storage keys
        clean_key = key.replace("\\", "/").strip("/").replace("..", "")
        dest = (self.root_path / clean_key).resolve()
        if not str(dest).startswith(str(self.root_path)):
            raise ValueError(f"Storage key '{key}' resolves outside storage root.")
        return dest

    def write_bytes(self, key: str, data: bytes) -> str:
        target = self._resolve_key_path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "wb") as f:
            f.write(data)
        return str(target)

    def read_bytes(self, key: str) -> bytes:
        target = self._resolve_key_path(key)
        if not target.exists():
            raise FileNotFoundError(f"Storage key '{key}' does not exist.")
        with open(target, "rb") as f:
            return f.read()

    def exists(self, key: str) -> bool:
        target = self._resolve_key_path(key)
        return target.exists()

    def delete(self, key: str) -> bool:
        target = self._resolve_key_path(key)
        if target.exists():
            target.unlink()
            return True
        return False


_default_storage: StorageBackend | None = None


def get_storage_backend() -> StorageBackend:
    global _default_storage
    if _default_storage is None:
        from services.api.config import settings
        if settings.STORAGE_BACKEND == "local":
            _default_storage = LocalStorageBackend(root_dir=settings.LOCAL_STORAGE_DIR)
        else:
            # Fallback to local
            _default_storage = LocalStorageBackend(root_dir="./data/storage")
    return _default_storage
