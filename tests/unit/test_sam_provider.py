"""Unit tests: SAM output grammar, provider transport, and guard rails."""
from __future__ import annotations

from unittest.mock import patch

import pytest

from packages.provider_gateway.sam_provider import SamProvider, parse_sam_line
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderError,
    ProviderRequest,
)

LINE = (
    "<0f>1<|box;x1=10;y1=20;x2=110;y2=120;w=320;h=240;c=0.93|>"
    "<|mask;x=0;y=0;data=240,320,~abc|>,"
    "3<|box;x1=5;y1=6;x2=15;y2=26;w=320;h=240|>"
    "<|mask;x=0;y=0;data=240,320,~def|>"
)


def test_parse_line_extracts_boxes_with_confidence():
    boxes = parse_sam_line(LINE)
    assert len(boxes) == 2
    first, second = boxes
    assert first["object_id"] == 1
    assert (first["x"], first["y"], first["width"], first["height"]) == (10, 20, 100, 100)
    assert first["confidence"] == 0.93
    assert first["frame"] == {"width": 320, "height": 240}
    assert second["object_id"] == 3
    assert second["confidence"] is None
    assert (second["x"], second["y"], second["width"], second["height"]) == (5, 6, 10, 20)


def test_parse_swapped_coordinates_yield_positive_size():
    line = "<0f>1<|box;x1=110;y1=120;x2=10;y2=20;w=320;h=240|><|mask;x=0;y=0;data=240,320,~x|>"
    boxes = parse_sam_line(line)
    assert boxes[0]["x"] == 10 and boxes[0]["width"] == 100


def test_zero_matches_are_valid():
    assert parse_sam_line("") == []
    assert parse_sam_line("<0f>") == []


def test_provider_advertises_object_detection_only():
    provider = SamProvider(api_key="k")
    assert ProviderCapability.OBJECT_DETECTION in provider.capabilities
    assert ProviderCapability.IMAGE_GENERATION not in provider.capabilities


def test_missing_concept_and_image_are_rejected():
    provider = SamProvider(api_key="k")
    with pytest.raises(ProviderError):
        provider.detect(ProviderRequest(model="sam-3.1", task_type="object_detection", asset_bytes=b"x"))
    with pytest.raises(ProviderError):
        provider.detect(ProviderRequest(
            model="sam-3.1", task_type="object_detection",
            asset_bytes=b"", parameters={"concept": "apple"},
        ))


def test_lists_and_instructions_are_rejected_before_network():
    provider = SamProvider(api_key="k")
    for bad in ("apple, pear", "detect the apple", "where is the apple?"):
        with pytest.raises(ProviderError):
            provider.detect(ProviderRequest(
                model="sam-3.1", task_type="object_detection",
                asset_bytes=b"\x89PNG", parameters={"concept": bad},
            ))


def test_stream_parses_deltas_into_boxes():
    events = [
        'event: response.output_text.delta',
        f'data: {"{"}"type": "response.output_text.delta", "delta": {LINE!r}{"}"}'.replace("'", '"'),
        'data: {"type": "response.completed"}',
    ]

    class _FakeStream:
        status_code = 200

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def iter_lines(self):
            return [line.encode() for line in events]

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def stream(self, *args, **kwargs):
            return _FakeStream()

    provider = SamProvider(api_key="k")
    with patch("packages.provider_gateway.sam_provider.httpx.Client", _FakeClient):
        response = provider.detect(ProviderRequest(
            model="sam-3.1", task_type="object_detection",
            asset_bytes=b"\x89PNG", parameters={"concept": "apple"},
        ))
    assert response.payload["concept"] == "apple"
    assert len(response.payload["boxes"]) == 2
    assert response.payload["boxes"][0]["label"] == "apple"
    assert response.payload["boxes"][0]["frame_index"] == 0
