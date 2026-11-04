"""
Sample-guided generation: analyse an uploaded sample so the generator can imitate it.

The user can bring a CSV/JSONL/JSON/TXT file, a ZIP of files, or images. We do **not** promise to
reproduce images; what we honestly offer is:
  * infer the task type and the label set (with counts),
  * infer the writing style (length, a few representative samples),
  * turn that into an editable plan and a style hint + seed examples for the generator.

Everything is bounded: uploads go through the same safety validator as dataset import, archives are
size/entry capped, and only a small number of rows/samples are retained.
"""
from __future__ import annotations

import csv
import io
import json
import statistics
import zipfile
from dataclasses import dataclass, field
from typing import Any

from packages.dataset_io.safety import (
    sanitize_archive_entry_path,
    validate_archive_bounds,
    validate_file_safety,
)

#: Column names commonly used for the input text and the label.
_TEXT_COLUMNS = ("text", "content", "sentence", "input", "prompt", "instruction", "review",
                 "ticket", "message", "question", "body")
_LABEL_COLUMNS = ("label", "labels", "class", "category", "target", "intent", "sentiment",
                  "answer", "output", "topic")

_MAX_ROWS = 5_000
_MAX_SAMPLES = 3
_MAX_ARCHIVE_ENTRIES = 50
_MAX_MEMBER_BYTES = 20 * 1024 * 1024


@dataclass
class SampleAnalysis:
    """What we honestly detected from an uploaded sample."""

    modality: str = "unknown"                 # text | image | archive | unknown
    detected_format: str = ""
    row_count: int = 0
    text_column: str | None = None
    label_column: str | None = None
    classes: list[str] = field(default_factory=list)
    class_counts: dict[str, int] = field(default_factory=dict)
    samples: list[str] = field(default_factory=list)
    seed_examples: list[str] = field(default_factory=list)
    avg_words: float = 0.0
    p95_words: int = 0
    style_hint: str = ""
    archive_members: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "modality": self.modality,
            "detected_format": self.detected_format,
            "row_count": self.row_count,
            "text_column": self.text_column,
            "label_column": self.label_column,
            "classes": self.classes,
            "class_counts": self.class_counts,
            "samples": self.samples,
            "seed_examples": self.seed_examples,
            "avg_words": round(self.avg_words, 1),
            "p95_words": self.p95_words,
            "style_hint": self.style_hint,
            "archive_members": self.archive_members,
            "notes": self.notes,
        }


def _style_stats(texts: list[str]) -> tuple[float, int, str]:
    if not texts:
        return (0.0, 0, "")
    word_counts = sorted(len(text.split()) for text in texts)
    average = statistics.fmean(word_counts)
    p95 = word_counts[min(len(word_counts) - 1, int(len(word_counts) * 0.95))]
    if average <= 8:
        length = "very short phrases"
    elif average <= 20:
        length = "short sentences"
    elif average <= 45:
        length = "medium sentences"
    else:
        length = "long passages"
    hint = f"{length} (~{average:.0f} words each), keep the same tone and formatting"
    return (average, p95, hint)


def _rows_to_analysis(rows: list[dict[str, Any]], *, detected_format: str) -> SampleAnalysis:
    analysis = SampleAnalysis(detected_format=detected_format, row_count=len(rows))
    if not rows:
        analysis.notes.append("The file contained no rows we could read.")
        return analysis

    columns = [str(key) for key in rows[0]]
    lowered = {column.lower(): column for column in columns}

    text_column = next((lowered[name] for name in _TEXT_COLUMNS if name in lowered), None)
    if text_column is None:
        # Fall back to the column with the longest average string value.
        best, best_len = None, -1.0
        for column in columns:
            values = [str(row.get(column) or "") for row in rows[:200]]
            average = statistics.fmean(len(value) for value in values) if values else 0.0
            if average > best_len:
                best, best_len = column, average
        text_column = best
    analysis.text_column = text_column

    label_column = next((lowered[name] for name in _LABEL_COLUMNS if name in lowered), None)
    analysis.label_column = label_column

    texts = [str(row.get(text_column) or "").strip() for row in rows[:2000] if text_column]
    texts = [text for text in texts if text]
    analysis.seed_examples = texts[:5]
    analysis.samples = texts[:_MAX_SAMPLES]
    analysis.avg_words, analysis.p95_words, analysis.style_hint = _style_stats(texts)

    if label_column:
        counts: dict[str, int] = {}
        for row in rows:
            value = row.get(label_column)
            if value in (None, ""):
                continue
            key = str(value).strip()
            counts[key] = counts.get(key, 0) + 1
        analysis.class_counts = dict(sorted(counts.items(), key=lambda item: -item[1]))
        analysis.classes = list(analysis.class_counts)
    if not analysis.classes:
        analysis.notes.append(
            "No label column was detected, so the plan starts with placeholder classes you can rename."
        )
    if analysis.row_count > _MAX_ROWS:
        analysis.notes.append(f"Only the first {_MAX_ROWS} rows were inspected.")
    return analysis


def _parse_text_rows(text: str, filename: str) -> tuple[list[dict[str, Any]], str]:
    name = filename.lower()
    if name.endswith((".jsonl", ".ndjson")):
        rows: list[dict[str, Any]] = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(value, dict):
                rows.append(value)
            elif isinstance(value, str):
                rows.append({"text": value})
            if len(rows) >= _MAX_ROWS:
                break
        return rows, "jsonl"

    if name.endswith(".json"):
        try:
            value = json.loads(text)
        except json.JSONDecodeError:
            return [], "json"
        if isinstance(value, list):
            rows = [row if isinstance(row, dict) else {"text": str(row)} for row in value[:_MAX_ROWS]]
            return rows, "json"
        if isinstance(value, dict):
            for candidate in ("rows", "records", "data", "items", "examples"):
                nested = value.get(candidate)
                if isinstance(nested, list):
                    rows = [row if isinstance(row, dict) else {"text": str(row)}
                            for row in nested[:_MAX_ROWS]]
                    return rows, "json"
            return [value], "json"
        return [], "json"

    if name.endswith(".csv") or "," in text.split("\n", 1)[0]:
        reader = csv.DictReader(io.StringIO(text))
        rows = []
        for index, row in enumerate(reader):
            if index >= _MAX_ROWS:
                break
            rows.append({str(key): value for key, value in row.items() if key is not None})
        return rows, "csv"

    # Plain text: one sample per non-empty line.
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return [{"text": line} for line in lines[:_MAX_ROWS]], "txt"


def analyze_sample(filename: str, data: bytes, *, max_bytes: int = 25 * 1024 * 1024) -> SampleAnalysis:
    """Analyse an uploaded sample and return what can honestly be inferred from it."""
    mime, modality = validate_file_safety(filename, data, max_bytes=max_bytes)
    analysis = SampleAnalysis()

    if modality == "archive" or mime == "application/zip":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                entries = [entry for entry in archive.infolist() if not entry.is_dir()]
                validate_archive_bounds(
                    archive,
                    max_entries=_MAX_ARCHIVE_ENTRIES,
                    max_decompressed_bytes=64 * 1024 * 1024,
                )
                analysis.modality = "archive"
                analysis.detected_format = "zip"
                names: list[str] = []
                for entry in entries:
                    safe_name = sanitize_archive_entry_path(entry.filename)
                    if safe_name is None or entry.file_size > _MAX_MEMBER_BYTES:
                        continue
                    names.append(safe_name)
                analysis.archive_members = names[:20]
                for entry in entries:
                    safe_name = sanitize_archive_entry_path(entry.filename)
                    if safe_name is None or entry.file_size > _MAX_MEMBER_BYTES:
                        continue
                    if safe_name.lower().endswith((".csv", ".jsonl", ".ndjson", ".json", ".txt")):
                        inner = analyze_sample(
                            safe_name, archive.read(entry), max_bytes=_MAX_MEMBER_BYTES
                        )
                        inner.modality = "text"
                        inner.detected_format = f"zip>{inner.detected_format}"
                        inner.archive_members = analysis.archive_members
                        inner.notes.append(f"Pattern inferred from '{safe_name}' inside the ZIP.")
                        return inner
                analysis.notes.append(
                    "The ZIP contains no CSV/JSONL/JSON/TXT file, so no label or style pattern could be "
                    "inferred. Images can guide labels and style, but generated output is text."
                )
                return analysis
        except zipfile.BadZipFile:
            analysis.notes.append("The upload looks like a ZIP but could not be opened.")
            return analysis

    if modality == "image" or (mime or "").startswith("image/"):
        analysis.modality = "image"
        analysis.detected_format = mime or "image"
        analysis.notes.append(
            "Images are accepted as a style/label reference only. This build generates text; it does "
            "not reproduce or synthesise images."
        )
        return analysis

    if modality in {"text", "document"} or (mime or "").startswith("text/") or mime == "application/json":
        try:
            text = data.decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001 - a decode failure is a user-visible note, not a crash
            analysis.notes.append("The file could not be decoded as UTF-8 text.")
            return analysis
        rows, detected = _parse_text_rows(text, filename)
        parsed = _rows_to_analysis(rows, detected_format=detected)
        parsed.modality = "text"
        return parsed

    analysis.modality = "unknown"
    analysis.detected_format = mime or "unknown"
    analysis.notes.append(
        "Unsupported sample type for analysis. Supported: CSV, JSONL, JSON, TXT, ZIP of those, images."
    )
    return analysis
