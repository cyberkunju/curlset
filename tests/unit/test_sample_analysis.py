"""Unit tests for sample-guided analysis (uploaded file -> labels, style, plan inputs)."""
from __future__ import annotations

import io
import zipfile

from packages.generation_jobs.sample_analysis import analyze_sample

CSV = (
    "text,label\n"
    "I was charged twice for my subscription,billing\n"
    "The app crashes when I export,technical_support\n"
    "Please refund my invoice,billing\n"
    "Uploading a file returns an error,technical_support\n"
)


def test_csv_detects_text_and_label_columns_and_classes():
    analysis = analyze_sample("sample.csv", CSV.encode())
    assert analysis.modality == "text"
    assert analysis.detected_format == "csv"
    assert analysis.row_count == 4
    assert analysis.text_column == "text"
    assert analysis.label_column == "label"
    assert analysis.classes == ["billing", "technical_support"]
    assert analysis.class_counts == {"billing": 2, "technical_support": 2}
    assert len(analysis.samples) == 3
    assert analysis.avg_words > 0
    assert "words" in analysis.style_hint


def test_jsonl_is_parsed_row_by_row():
    payload = (
        b'{"text": "Great product", "label": "positive"}\n'
        b'{"text": "Terrible support", "label": "negative"}\n'
    )
    analysis = analyze_sample("sample.jsonl", payload)
    assert analysis.detected_format == "jsonl"
    assert analysis.row_count == 2
    assert analysis.classes == ["positive", "negative"]
    assert analysis.samples[0] == "Great product"


def test_plain_text_is_one_sample_per_line():
    analysis = analyze_sample("lines.txt", b"first example\n\nsecond example \n")
    assert analysis.detected_format == "txt"
    assert analysis.row_count == 2
    assert analysis.text_column == "text"
    assert analysis.samples == ["first example", "second example"]


def test_zip_finds_a_text_member_and_reports_it():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("notes/readme.md", "not a dataset")
        archive.writestr("data/inner.csv", CSV)
    analysis = analyze_sample("bundle.zip", buffer.getvalue())
    assert analysis.detected_format == "zip>csv"
    assert analysis.row_count == 4
    assert analysis.classes == ["billing", "technical_support"]
    assert "data/inner.csv" in analysis.archive_members


def test_zip_without_text_members_explains_the_limitation():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("photo.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 20)
    analysis = analyze_sample("images.zip", buffer.getvalue())
    assert analysis.modality == "archive"
    assert analysis.row_count == 0
    assert any("no csv" in note.lower() for note in analysis.notes)


def test_image_is_accepted_as_reference_only_with_explicit_note():
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 40
    analysis = analyze_sample("photo.png", png)
    assert analysis.modality == "image"
    assert any("does not reproduce" in note.lower() or "not reproduce" in note.lower()
               for note in analysis.notes)


def test_csv_without_label_column_says_so():
    csv_payload = "sentence\nFirst sentence here\nSecond sentence here\n"
    analysis = analyze_sample("nolm.csv", csv_payload.encode())
    assert analysis.label_column is None
    assert analysis.classes == []
    assert any("no label column" in note.lower() for note in analysis.notes)


def test_empty_file_is_handled():
    analysis = analyze_sample("empty.csv", b"")
    assert analysis.row_count == 0
    assert analysis.notes


def test_style_hint_reflects_length():
    short = "ok yes no\nfine good bad\n"
    analysis = analyze_sample("short.txt", short.encode())
    assert "very short" in analysis.style_hint
