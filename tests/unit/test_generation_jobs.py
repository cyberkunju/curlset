"""Unit tests for Simple-Mode plan drafting and the honest ETA tracker."""
from __future__ import annotations

import time

from packages.generation_jobs.service import (
    ETA_MIN_SAMPLES,
    ETA_WINDOW,
    _Progress,
    draft_plan,
)

# ------------------------------------------------------------------ plan drafting ---


def test_plan_extracts_count_and_explicit_classes():
    plan = draft_plan(
        "A dataset for identifying whether an English sentence uses 'these' correctly, "
        "about 300 examples: correct usage, incorrect usage"
    )
    assert plan.suggested_total == 300
    assert plan.classes == ["correct usage", "incorrect usage"]
    assert plan.task_type == "text_classification"
    assert len(plan.questions) == 3
    assert {question.id for question in plan.questions} == {"count", "classes", "difficulty"}


def test_plan_questions_always_have_examples_and_defaults():
    plan = draft_plan("spam detection dataset with 120 examples")
    for question in plan.questions:
        assert question.example, question
        assert question.default is not None, question
    assert plan.suggested_total == 120
    assert plan.classes == ["Spam", "Ham"]


def test_plan_detects_non_text_task_and_asks_to_confirm():
    plan = draft_plan("an image classification dataset for cats and dogs, 500 examples")
    assert plan.task_type == "image_classification"
    assert plan.dataset_type == "image"
    assert plan.needs_type_choice is True
    assert plan.questions[0].id == "dataset_type"
    assert any("image generation is available" in note.lower() for note in plan.notes)


def test_plan_prefers_sample_labels_when_uploaded():
    plan = draft_plan(
        "make a dataset like this sample",
        sample_rows=[{"text": "a", "label": "alpha"}, {"text": "b", "label": "beta"}],
    )
    assert plan.classes == ["alpha", "beta"]
    assert plan.detected_from_sample is True
    assert not any("upload a sample" in note.lower() for note in plan.notes)


def test_plan_never_invents_more_than_eight_classes():
    prompt = "dataset about " + ", ".join(f"class{i}" for i in range(20)) + ""
    prompt = "labels: " + ", ".join(f"c{i}" for i in range(20))
    plan = draft_plan(prompt)
    assert 1 <= len(plan.classes) <= 8


def test_plan_serialises_for_the_wizard():
    payload = draft_plan("grammar dataset about 60 examples").to_dict()
    assert payload["per_class"] >= 1
    assert isinstance(payload["questions"], list)
    assert all("question" in question for question in payload["questions"])


# ----------------------------------------------------------------------- ETA logic ---


def test_eta_is_unknown_until_enough_samples():
    tracker = _Progress()
    for _ in range(ETA_MIN_SAMPLES - 1):
        tracker.mark()
        time.sleep(0.001)
    assert tracker.eta(done=ETA_MIN_SAMPLES - 1, total=100) is None


def test_eta_uses_measured_throughput():
    tracker = _Progress()
    for _ in range(ETA_MIN_SAMPLES):
        tracker.mark()
        time.sleep(0.01)  # ~10ms per item
    eta = tracker.eta(done=ETA_MIN_SAMPLES, total=ETA_MIN_SAMPLES + 10)
    assert eta is not None
    # 10 remaining items at roughly 10ms each -> tens of milliseconds, not minutes
    assert 0 < eta < 5


def test_eta_is_none_when_finished():
    tracker = _Progress()
    for _ in range(ETA_MIN_SAMPLES):
        tracker.mark()
    assert tracker.eta(done=5, total=5) is None


def test_rate_window_is_bounded():
    tracker = _Progress()
    for _ in range(ETA_WINDOW + 25):
        tracker.mark()
    assert len(tracker.timestamps) <= ETA_WINDOW
