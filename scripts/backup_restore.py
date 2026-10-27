"""
Safe backup, restore, and integrity verification utility for the AI Dataset Engineering Platform.
Backs up metadata database and media assets into an integrity-verified archive.
"""
import argparse
import hashlib
import json
import logging
import os
import shutil
import sqlite3
import tarfile
import tempfile
from datetime import UTC, datetime

from packages.dataset_core.db.session import (
    get_default_database_url,
    get_engine,
    reset_database,
)
from services.api.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] (backup) %(message)s")
logger = logging.getLogger("backup_restore")


def _compute_file_sha256(filepath: str) -> str:
    """Compute cryptographic SHA-256 digest of a file on disk."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def create_backup(
    output_archive_path: str,
    database_url: str | None = None,
    storage_dir: str | None = None,
) -> dict:
    """
    Creates a tar.gz backup archive containing:
      1. Database snapshot (database.db or dump)
      2. Storage directory assets
      3. backup_manifest.json with SHA-256 checksums
    """
    db_url = database_url or get_default_database_url()
    store_dir = storage_dir or settings.LOCAL_STORAGE_DIR

    logger.info("Starting platform backup...")
    logger.info("Source DB: %s | Source Storage: %s", db_url, store_dir)

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as staging_dir:
        db_staging = os.path.join(staging_dir, "database.db")
        storage_staging = os.path.join(staging_dir, "storage")

        # 1. Backup Database
        if db_url.startswith("sqlite:///"):
            sqlite_path = db_url.replace("sqlite:///", "")
            if not os.path.isabs(sqlite_path):
                sqlite_path = os.path.abspath(sqlite_path)

            if os.path.exists(sqlite_path):
                # Use sqlite3 online backup to ensure consistency even under active writes
                src_conn = sqlite3.connect(sqlite_path)
                dst_conn = sqlite3.connect(db_staging)
                with dst_conn:
                    src_conn.backup(dst_conn)
                src_conn.close()
                dst_conn.close()
                logger.info("Backed up SQLite database from %s", sqlite_path)
            else:
                # Create empty DB
                conn = sqlite3.connect(db_staging)
                conn.close()
                logger.warning("Database file %s does not exist; created empty snapshot.", sqlite_path)
        else:
            # Generic/Postgres placeholder marker
            with open(db_staging, "w", encoding="utf-8") as f:
                f.write(f"# Remote database URL: {db_url}\n")

        # 2. Backup Storage
        os.makedirs(storage_staging, exist_ok=True)
        if os.path.exists(store_dir):
            for item in os.listdir(store_dir):
                s = os.path.join(store_dir, item)
                d = os.path.join(storage_staging, item)
                if os.path.isdir(s):
                    shutil.copytree(s, d)
                else:
                    shutil.copy2(s, d)
            logger.info("Copied storage assets from %s", store_dir)

        # 3. Generate Manifest
        manifest = {
            "backup_version": "1.0",
            "created_at_utc": datetime.now(UTC).isoformat(),
            "database_url_type": "sqlite" if db_url.startswith("sqlite") else "postgres",
            "files": {},
        }

        for root, _, files in os.walk(staging_dir):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, staging_dir)
                if rel_path == "backup_manifest.json":
                    continue
                file_sha = _compute_file_sha256(full_path)
                file_size = os.path.getsize(full_path)
                manifest["files"][rel_path.replace("\\", "/")] = {
                    "sha256": file_sha,
                    "size_bytes": file_size,
                }

        manifest_path = os.path.join(staging_dir, "backup_manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, sort_keys=True)

        # 4. Assemble Archive
        os.makedirs(os.path.dirname(os.path.abspath(output_archive_path)), exist_ok=True)
        with tarfile.open(output_archive_path, "w:gz") as tar:
            tar.add(staging_dir, arcname="")

    logger.info("Backup archive successfully written to: %s", output_archive_path)
    return manifest


def verify_backup(archive_path: str) -> dict:
    """
    Verifies that the backup archive is intact and matches all SHA-256 checksums in the manifest.
    Raises ValueError if corrupted or invalid.
    """
    if not os.path.exists(archive_path):
        raise FileNotFoundError(f"Backup archive not found: {archive_path}")

    logger.info("Verifying backup integrity for: %s", archive_path)

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as extract_dir:
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(extract_dir, filter="data")

        manifest_file = os.path.join(extract_dir, "backup_manifest.json")
        if not os.path.exists(manifest_file):
            raise ValueError("Corrupt backup: missing backup_manifest.json")

        with open(manifest_file, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        for rel_path, expected in manifest.get("files", {}).items():
            actual_file = os.path.join(extract_dir, rel_path.replace("/", os.sep))
            if not os.path.exists(actual_file):
                raise ValueError(f"Corrupt backup: missing expected file {rel_path}")

            actual_sha = _compute_file_sha256(actual_file)
            if actual_sha != expected["sha256"]:
                raise ValueError(
                    f"Integrity check failed for {rel_path}: expected {expected['sha256']}, got {actual_sha}"
                )

    logger.info("Backup integrity verified successfully (%d files checked).", len(manifest.get("files", {})))
    return manifest


def restore_backup(
    archive_path: str,
    target_database_url: str | None = None,
    target_storage_dir: str | None = None,
) -> None:
    """
    Verifies integrity and restores database snapshot and storage files.
    """
    # 1. Verify before touching anything
    verify_backup(archive_path)

    db_url = target_database_url or get_default_database_url()
    store_dir = target_storage_dir or settings.LOCAL_STORAGE_DIR

    logger.info("Restoring platform data...")

    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as extract_dir:
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(extract_dir, filter="data")

        # Restore database
        if db_url.startswith("sqlite:///"):
            sqlite_path = db_url.replace("sqlite:///", "")
            if not os.path.isabs(sqlite_path):
                sqlite_path = os.path.abspath(sqlite_path)

            os.makedirs(os.path.dirname(sqlite_path), exist_ok=True)
            db_extracted = os.path.join(extract_dir, "database.db")
            if os.path.exists(db_extracted):
                shutil.copy2(db_extracted, sqlite_path)
                logger.info("Restored SQLite database to %s", sqlite_path)

        # Restore storage
        os.makedirs(store_dir, exist_ok=True)
        storage_extracted = os.path.join(extract_dir, "storage")
        if os.path.exists(storage_extracted):
            for item in os.listdir(storage_extracted):
                s = os.path.join(storage_extracted, item)
                d = os.path.join(store_dir, item)
                if os.path.isdir(s):
                    if os.path.exists(d):
                        shutil.rmtree(d)
                    shutil.copytree(s, d)
                else:
                    shutil.copy2(s, d)
            logger.info("Restored storage directory to %s", store_dir)

    logger.info("Restore complete!")


def reset_dev_environment(database_url: str | None = None, storage_dir: str | None = None) -> None:
    """
    Explicit development reset: drops and recreates all database tables and clears local storage.
    """
    engine = get_engine(database_url)
    store_dir = storage_dir or settings.LOCAL_STORAGE_DIR

    logger.warning("Resetting development environment (database tables & storage)...")
    reset_database(engine)

    if os.path.exists(store_dir):
        for item in os.listdir(store_dir):
            p = os.path.join(store_dir, item)
            if os.path.isdir(p):
                shutil.rmtree(p)
            else:
                os.remove(p)
    else:
        os.makedirs(store_dir, exist_ok=True)

    logger.info("Development environment reset completed successfully.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Dataset Engineering Platform Backup & Restore")
    subparsers = parser.add_subparsers(dest="command")

    backup_parser = subparsers.add_parser("backup", help="Create an integrity-verified backup archive")
    backup_parser.add_argument("--output", "-o", required=True, help="Target .tar.gz archive path")

    verify_parser = subparsers.add_parser("verify", help="Verify backup archive integrity")
    verify_parser.add_argument("--input", "-i", required=True, help="Backup .tar.gz archive path")

    restore_parser = subparsers.add_parser("restore", help="Restore database and assets from backup")
    restore_parser.add_argument("--input", "-i", required=True, help="Backup .tar.gz archive path")

    reset_parser = subparsers.add_parser("reset-dev", help="Explicitly reset local dev database and storage")
    reset_parser.add_argument("--confirm", action="store_true", required=True, help="Confirm destructive reset")

    args = parser.parse_args()
    if args.command == "backup":
        create_backup(args.output)
    elif args.command == "verify":
        verify_backup(args.input)
    elif args.command == "restore":
        restore_backup(args.input)
    elif args.command == "reset-dev":
        reset_dev_environment()
    else:
        parser.print_help()
