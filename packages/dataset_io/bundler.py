"""
Multi-Modal Record Bundler:
Resolves multi-modal file relationships from archives and manifests.
- Priority 1: Explicit manifest links (manifest.jsonl, metadata.jsonl, annotations.csv)
- Priority 2: Auto-pairing by filename stem (e.g. sample1.jpg + sample1.txt + sample1.wav)
"""
import csv
import io
import json
import os
from dataclasses import dataclass, field


@dataclass
class BundledFile:
    filename: str
    ext: str
    modality: str  # image, text, audio, document
    role: str      # primary_image, paired_text, audio_track, source_document
    data: bytes


@dataclass
class BundledRecordCandidate:
    stem: str
    split: str = "train"
    external_key: str | None = None
    label: str | None = None
    assets: list[BundledFile] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


def detect_modality_and_role(filename: str) -> tuple[str, str]:
    ext = os.path.splitext(filename.lower())[1]
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}:
        return "image", "primary_image"
    elif ext in {".wav", ".mp3", ".ogg", ".flac", ".m4a"}:
        return "audio", "audio_track"
    elif ext in {".pdf", ".docx", ".html", ".xml"}:
        return "document", "source_document"
    elif ext in {".txt", ".md", ".json"}:
        return "text", "paired_text"
    return "text", "paired_text"


class MultiModalBundler:
    """
    Orchestrates bundling of multi-modal files from raw entries and manifests.
    """

    @classmethod
    def bundle_from_entries(
        cls,
        files: dict[str, bytes],
        default_split: str = "train",
    ) -> list[BundledRecordCandidate]:
        """
        Takes a mapping of {relative_path: bytes} and returns bundled record candidates.
        """
        # 1. Check for explicit manifest files
        manifest_filename = next(
            (k for k in files if os.path.basename(k).lower() in {"manifest.jsonl", "metadata.jsonl", "annotations.csv"}),
            None,
        )

        if manifest_filename:
            return cls._bundle_from_manifest(manifest_filename, files, default_split)

        # 2. Priority 2: Automatic bundling by filename stem
        return cls._bundle_by_stem(files, default_split)

    @classmethod
    def _bundle_by_stem(
        cls,
        files: dict[str, bytes],
        default_split: str,
    ) -> list[BundledRecordCandidate]:
        by_stem: dict[str, list[tuple[str, bytes]]] = {}

        for filename, data in files.items():
            base = os.path.basename(filename)
            stem = os.path.splitext(base)[0]
            by_stem.setdefault(stem, []).append((filename, data))

        candidates: list[BundledRecordCandidate] = []
        for stem, group in by_stem.items():
            candidate = BundledRecordCandidate(stem=stem, split=default_split, external_key=stem)
            for fname, fdata in group:
                modality, role = detect_modality_and_role(fname)
                candidate.assets.append(
                    BundledFile(
                        filename=fname,
                        ext=os.path.splitext(fname.lower())[1],
                        modality=modality,
                        role=role,
                        data=fdata,
                    )
                )
            candidates.append(candidate)

        return candidates

    @classmethod
    def _bundle_from_manifest(
        cls,
        manifest_path: str,
        files: dict[str, bytes],
        default_split: str,
    ) -> list[BundledRecordCandidate]:
        manifest_bytes = files[manifest_path]
        candidates: list[BundledRecordCandidate] = []
        is_csv = manifest_path.lower().endswith(".csv")

        if is_csv:
            reader = csv.DictReader(io.StringIO(manifest_bytes.decode("utf-8", errors="replace")))
            for row in reader:
                stem = row.get("id") or row.get("external_key") or os.path.splitext(row.get("image") or row.get("file") or "item")[0]
                cand = BundledRecordCandidate(
                    stem=stem,
                    split=row.get("split", default_split),
                    external_key=stem,
                    label=row.get("label"),
                    metadata=dict(row),
                )
                for key in ("image", "file", "audio", "text_file"):
                    target_fname = row.get(key)
                    if target_fname and target_fname in files:
                        mod, role = detect_modality_and_role(target_fname)
                        cand.assets.append(
                            BundledFile(
                                filename=target_fname,
                                ext=os.path.splitext(target_fname.lower())[1],
                                modality=mod,
                                role=role,
                                data=files[target_fname],
                            )
                        )
                candidates.append(cand)
        else:
            for line in manifest_bytes.decode("utf-8", errors="replace").splitlines():
                line = line.trim() if hasattr(line, "trim") else line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                    stem = entry.get("id") or entry.get("external_key") or "rec"
                    cand = BundledRecordCandidate(
                        stem=stem,
                        split=entry.get("split", default_split),
                        external_key=stem,
                        label=entry.get("label"),
                        metadata=entry,
                    )
                    # Look up referenced file keys
                    for fpath in entry.get("files", []):
                        if fpath in files:
                            mod, role = detect_modality_and_role(fpath)
                            cand.assets.append(
                                BundledFile(
                                    filename=fpath,
                                    ext=os.path.splitext(fpath.lower())[1],
                                    modality=mod,
                                    role=role,
                                    data=files[fpath],
                                )
                            )
                    candidates.append(cand)
                except json.JSONDecodeError:
                    continue

        return candidates
