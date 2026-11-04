"""
Meta SAM 3.1 provider — object detection (boxes) behind the provider gateway.

The Meta Model API exposes SAM 3.1 on the **Responses API** (`POST /v1/responses`, `stream: true`).
The model does not answer in prose: it streams *special-token text*, one line per frame::

    <0f>1<|box;x1=10;y1=20;x2=110;y2=120;w=320;h=240;c=0.93|><|mask;x=0;y=0;data=240,320,~...|>,...

This module parses that grammar into canonical boxes (`x, y, w, h` in source-image pixels) and ignores
masks for now (boxes are what the detection schema stores; masks are a documented future slice).

Contract rules encoded here (from dev.meta.ai/docs/sam):
* one **concept prompt** per request — a short noun phrase, never an instruction and never a list;
* zero matches is a valid outcome (empty stream), not an error;
* boxes are pixel coordinates with frame dimensions `w`/`h`; convert to `x, y, width, height`;
* confidence is only present when the request sets ``include_confidence``.
"""
from __future__ import annotations

import base64
import json
import re
import time
from typing import Any, ClassVar

import httpx

from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.types import (
    ProviderAuthenticationError,
    ProviderCapability,
    ProviderError,
    ProviderRateLimitError,
    ProviderRequest,
    ProviderResponse,
    ProviderTimeoutError,
    ProviderUsage,
)

_FRAME_RE = re.compile(r"^<(\d+)f>")
_BOX_RE = re.compile(
    r"(\d+)<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)"
    r"(?:;c=([0-9]*\.?[0-9]+))?\|>"
)


def parse_sam_line(line: str) -> list[dict[str, Any]]:
    """Parse one SAM output line into boxes (canonical ``x, y, width, height`` pixels)."""
    boxes: list[dict[str, Any]] = []
    for match in _BOX_RE.finditer(line):
        object_id = int(match.group(1))
        x1, y1, x2, y2 = (int(match.group(i)) for i in (2, 3, 4, 5))
        frame_w, frame_h = int(match.group(6)), int(match.group(7))
        confidence = float(match.group(8)) if match.group(8) else None
        boxes.append(
            {
                "object_id": object_id,
                "x": max(0, min(x1, x2)),
                "y": max(0, min(y1, y2)),
                "width": max(0, abs(x2 - x1)),
                "height": max(0, abs(y2 - y1)),
                "confidence": confidence,
                "frame": {"width": frame_w, "height": frame_h},
            }
        )
    return boxes


class SamProvider(BaseProvider):
    """SAM 3.1 object detection (boxes) over the Meta Responses API."""

    name = "meta-sam"
    capabilities: ClassVar[set[ProviderCapability]] = {ProviderCapability.OBJECT_DETECTION}

    def __init__(
        self,
        name: str = "meta-sam",
        api_key: str = "",
        base_url: str = "https://api.meta.ai/v1",
        models: list[str] | None = None,
    ) -> None:
        self.name = name.lower()
        self.api_key = api_key
        self.base_url = (base_url or "https://api.meta.ai/v1").rstrip("/")
        self._models = models or ["sam-3.1"]

    def list_available_models(self) -> list[str]:
        return list(self._models)

    def annotate(self, request: ProviderRequest) -> ProviderResponse:  # pragma: no cover
        raise ProviderError(
            f"Provider '{self.name}' performs object detection; use detect().", provider=self.name
        )

    def detect(self, request: ProviderRequest) -> ProviderResponse:
        parameters = request.parameters or {}
        concept = str(parameters.get("concept") or parameters.get("prompt") or "").strip()
        if not concept:
            raise ProviderError(
                "SAM needs a short noun phrase naming the object to detect.", provider=self.name
            )
        if "," in concept or concept.lower().startswith(("segment", "detect", "find", "where")):
            # Documented failure mode: lists and instructions return zero matches; fail loudly.
            raise ProviderError(
                "SAM accepts one concept noun phrase per request (no commas, no instructions).",
                provider=self.name,
            )
        image_bytes = request.asset_bytes
        if not image_bytes:
            raise ProviderError("SAM requires image bytes.", provider=self.name)

        model = request.model or self._models[0]
        data_url = "data:image/png;base64," + base64.b64encode(image_bytes).decode("ascii")
        payload = {
            "model": model,
            "input": [
                {
                    "type": "message",
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": concept},
                        {"type": "input_image", "image_url": data_url},
                    ],
                }
            ],
            "stream": True,
        }
        if parameters.get("include_confidence", True):
            # Documented location: metadata values are strings on the Responses API.
            payload["metadata"] = {"include_confidence": "true"}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        started = time.time()
        chunks: list[str] = []
        try:
            with httpx.Client(timeout=240.0) as client, client.stream(
                "POST", f"{self.base_url}/responses", json=payload, headers=headers
            ) as response:
                    if response.status_code == 401:
                        raise ProviderAuthenticationError(
                            f"Authentication failed for {self.name}", provider=self.name
                        )
                    if response.status_code == 429:
                        raise ProviderRateLimitError(
                            f"Rate limit exceeded for {self.name}", provider=self.name
                        )
                    if response.status_code >= 400:
                        body = response.read().decode("utf-8", errors="replace")
                        raise ProviderError(
                            f"{self.name} returned HTTP {response.status_code}: {body[:200]}",
                            provider=self.name,
                        )
                    event_type = ""
                    for raw_line in response.iter_lines():
                        line = raw_line.decode("utf-8", errors="replace") if isinstance(raw_line, bytes) else raw_line
                        if not line:
                            continue
                        if line.startswith("event: "):
                            event_type = line[len("event: "):].strip()
                            continue
                        if not line.startswith("data: "):
                            continue
                        data = line[len("data: "):]
                        if data == "[DONE]":
                            break
                        try:
                            event = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        kind = event.get("type") or event_type
                        if kind == "response.output_text.delta":
                            delta = event.get("delta")
                            if isinstance(delta, str) and delta:
                                chunks.append(delta)
                        elif kind in {"response.failed", "response.error", "error"}:
                            message = json.dumps(event)[:200]
                            raise ProviderError(f"{self.name} stream failed: {message}", provider=self.name)
                        elif kind == "response.completed":
                            break
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError(
                f"SAM detection with {self.name} timed out", provider=self.name
            ) from exc
        except httpx.RequestError as exc:
            raise ProviderError(f"Connection failure to {self.name}: {exc}", provider=self.name) from exc

        text = "".join(chunks)
        boxes: list[dict[str, Any]] = []
        for line in text.splitlines():
            if not line.strip():
                continue
            frame_match = _FRAME_RE.match(line.strip())
            frame_index = int(frame_match.group(1)) if frame_match else 0
            for box in parse_sam_line(line):
                normalized = dict(box)
                normalized["frame_index"] = frame_index
                normalized["label"] = concept
                boxes.append(normalized)

        latency_ms = (time.time() - started) * 1000
        return ProviderResponse(
            payload={
                "boxes": boxes,
                "concept": concept,
                "raw_output": text[:4000],
                "model": model,
            },
            confidence=1.0,
            model=model,
            usage=ProviderUsage(),
            raw_response={"concept": concept, "boxes": len(boxes), "stream_chars": len(text)},
            latency_ms=round(latency_ms, 2),
        )
