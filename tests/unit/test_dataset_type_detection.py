"""Dataset-type catalogue + natural-language detection tests."""
from __future__ import annotations

from packages.dataset_core.dataset_types import DATASET_TYPES, list_dataset_types
from packages.generation_jobs.service import draft_plan

NOTE = "i need an dataset for bottle labeling. for the manufacturing and to detect the label mistakes."


def test_catalogue_covers_the_whole_taxonomy():
    ids = {row["id"] for row in list_dataset_types()}
    # every tier of the roadmap is represented
    for expected in (
        "text", "image", "audio", "video", "multimodal", "tabular", "time_series",
        "geospatial", "three_d", "motion", "graph", "code", "scientific", "medical",
        "sensor_iot", "neurophysiological", "robotics", "transactional",
        "object_detection", "image_text", "document_ocr",
    ):
        assert expected in ids, expected
    statuses = {row.status for row in DATASET_TYPES}
    assert statuses == {"available", "beta", "planned"}
    available = {row.id for row in DATASET_TYPES if row.status == "available"}
    assert available == {"text", "image"}


def test_bottle_label_inspection_prompt_detects_object_detection_and_asks():
    plan = draft_plan(NOTE)
    assert plan.dataset_type == "object_detection", plan.dataset_type
    assert plan.task_type == "object_detection"
    assert plan.needs_type_choice is True
    assert plan.questions[0].id == "dataset_type"
    option_ids = {option["id"] for option in plan.questions[0].options}
    assert "object_detection" in option_ids
    assert "image" in option_ids
    assert any("object detection" in note.lower() for note in plan.notes)


def test_image_prompt_also_confirms_type_instead_of_silently_generating():
    plan = draft_plan("An image classification dataset of bottle photos, classes: good label, misaligned label")
    assert plan.dataset_type in {"image", "object_detection"}
    assert plan.needs_type_choice is True
    assert plan.questions[0].id == "dataset_type"


def test_audio_and_video_prompts_are_detected_honestly():
    audio = draft_plan("Dataset of 200 speech recordings with transcripts for call centre audio")
    assert audio.dataset_type == "audio"
    assert audio.task_type == "audio_transcription"
    assert audio.needs_type_choice is True

    video = draft_plan("surveillance video clips with action sequences")
    assert video.dataset_type == "video"
    assert video.dataset_type_status == "planned"
    assert any("roadmap" in note.lower() or "not available" in note.lower() for note in video.notes)


def test_plain_text_prompt_needs_no_type_question():
    plan = draft_plan("1000 support tickets labelled by intent: billing, technical, feature")
    assert plan.dataset_type == "text"
    assert plan.task_type == "text_classification"
    assert plan.needs_type_choice is False
    assert all(question.id != "dataset_type" for question in plan.questions)


def test_planned_type_never_becomes_a_generation_promise():
    plan = draft_plan("point clouds of rooms with 3d meshes")
    assert plan.dataset_type == "three_d"
    assert plan.dataset_type_status == "planned"
    # task_type falls back honestly; the wizard reads the status and refuses to generate
    assert plan.task_type in {"text_classification", "object_detection"}
