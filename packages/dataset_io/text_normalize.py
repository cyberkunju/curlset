"""
Canonical normalization of text-dataset metadata.

The platform's text features historically read three different places for the input
text (annotation payload, record metadata, asset bytes) and swallowed dataset columns
verbatim, so a CSV exported from any labelling tool produced records that the workspace,
quality engine, clustering, token simulator and exporters could not see.

This module defines ONE normalization: given raw row/record metadata, return the
canonical fields (`text`, `label`, `split`) while preserving every original key.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any

# Accepted source column names, in priority order.
TEXT_ALIASES: tuple[str, ...] = (
    "text", "sentence", "content", "document", "prompt", "instruction",
    "input", "question", "query", "utterance", "body",
)
LABEL_ALIASES: tuple[str, ...] = (
    "label", "category", "class", "intent", "target", "sentiment", "topic", "y",
)
SPLIT_ALIASES: tuple[str, ...] = ("split", "set", "partition")

VALID_SPLITS: frozenset[str] = frozenset({"train", "val", "test", "unassigned"})

# Hard bound so a single record cannot blow up the DB / prompts.
MAX_TEXT_CHARS: int = 65_536

_WS_RE = re.compile(r"\s+")


@dataclass
class TextRecordFields:
    """Normalized view of one text record."""

    text: str | None = None
    label: str | None = None
    split: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    text_source_key: str | None = None
    problems: list[str] = field(default_factory=list)

    @property
    def has_text(self) -> bool:
        return bool(self.text and self.text.strip())

    def is_valid(self) -> bool:
        return not self.problems


def _first_present(raw: dict[str, Any], aliases: tuple[str, ...]) -> tuple[str | None, Any]:
    for key in aliases:
        if key in raw and raw[key] is not None:
            return key, raw[key]
    # Case-insensitive second pass (CSV headers often arrive as "Text" / "LABEL").
    lowered = {str(k).strip().lower(): k for k in raw}
    for alias in aliases:
        real = lowered.get(alias)
        if real is not None and raw[real] is not None:
            return str(real), raw[real]
    return None, None


def _clean_text(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        # Accept numbers/bools by stringifying (common in CSV), reject containers.
        if isinstance(value, (dict, list, tuple, set)):
            return None
        value = str(value)
    text = value.strip()
    return text or None


def normalize_text_metadata(
    raw: dict[str, Any] | None,
    *,
    default_split: str | None = None,
    require_text: bool = True,
    max_chars: int = MAX_TEXT_CHARS,
) -> TextRecordFields:
    """Normalize one record's raw metadata into canonical text fields.

    All original keys are preserved in ``metadata`` (so nothing is lost), with
    ``text`` / ``label`` / ``split`` overwritten by the canonical values when found.
    """
    raw_dict: dict[str, Any] = dict(raw or {})
    fields = TextRecordFields(metadata=raw_dict)

    text_key, text_val = _first_present(raw_dict, TEXT_ALIASES)
    text = _clean_text(text_val)
    if text is not None and len(text) > max_chars:
        fields.problems.append(
            f"text exceeds {max_chars} characters (got {len(text)}); truncated"
        )
        text = text[:max_chars]
    fields.text = text
    fields.text_source_key = text_key

    if require_text and not text:
        fields.problems.append("missing or blank text")

    _label_key, label_val = _first_present(raw_dict, LABEL_ALIASES)
    label = _clean_text(label_val)
    fields.label = label

    _split_key, split_val = _first_present(raw_dict, SPLIT_ALIASES)
    split = _clean_text(split_val)
    if split is not None:
        split_norm = split.strip().lower()
        # Accept common synonyms, reject anything else loudly.
        split_norm = {"validation": "val", "dev": "val", "valid": "val",
                      "training": "train", "testing": "test"}.get(split_norm, split_norm)
        if split_norm in VALID_SPLITS:
            split = split_norm
        else:
            fields.problems.append(
                f"invalid split '{split}' (allowed: {sorted(VALID_SPLITS)})"
            )
            split = None
    elif default_split:
        split = default_split if default_split in VALID_SPLITS else None
    fields.split = split

    if text is not None:
        raw_dict["text"] = text
    if label is not None:
        raw_dict["label"] = label
    if split is not None:
        raw_dict["split"] = split

    fields.metadata = raw_dict
    return fields


def normalize_text_value(text: str | None) -> str:
    """Normalize text for duplicate detection (case + whitespace insensitive)."""
    if not text:
        return ""
    return _WS_RE.sub(" ", text.strip().lower())


def text_content_hash(text: str | None) -> str:
    """Stable content hash used for text-record dedupe on import."""
    return hashlib.sha256(normalize_text_value(text).encode("utf-8")).hexdigest()
