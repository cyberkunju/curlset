"""
Simulated model provider for ensemble experiments.

Why this exists: a real confidence-weighted ensemble needs three *diverse* models with known
error profiles to be validated at all. FakeProvider returns identical output for every model,
so it cannot exercise calibration, weighting, disagreement, or correlated-error detection.

This provider simulates a model with configurable behaviour:
  * ``accuracy``        — probability of emitting the correct label (correctness derived from a
                          deterministic keyword classifier over the input text, i.e. the
                          "ground truth proxy" the real models are trying to reproduce).
  * ``overconfidence``  — how much probability mass is piled onto the emitted label, producing
                          the systematic overconfidence real LLMs show (so calibration has work).
  * ``hard_rate``       — fraction of samples that are intrinsically hard. Hard samples raise the
                          error probability for *every* model, which creates **correlated errors** —
                          the failure mode that decides whether an ensemble is trustworthy.
  * ``shared_bias``     — per-provider baises for specific classes, so models are not uniformly
                          good (this is what per-class weighting is for).

Deterministic: every output is derived from a hash of (model name, text), so experiments are
reproducible and costs are zero. Clearly named ``sim-*`` so nobody mistakes it for a real model.
"""
from __future__ import annotations

import hashlib
import math
from typing import ClassVar

from packages.provider_gateway.base import BaseProvider
from packages.provider_gateway.types import (
    ProviderCapability,
    ProviderRequest,
    ProviderResponse,
    ProviderUsage,
)

# Keyword groups used as the deterministic "ground truth proxy". Mirrors the intent fixture.
_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("billing", ("charged", "invoice", "card", "payment", "refund", "subscription", "plan",
                 "billing", "receipt", "price", "discount", "cancelled", "billed")),
    ("feature_request", ("add ", "dark mode", "bulk", "support", "search box", "multi-label",
                         "would help", "it would be great", "please add", "schedule")),
    ("technical_support", ("crash", "shortcut", "export", "queue", "upload", "error", "lag",
                           "canvas", "fails", "spins", "stutter", "stale", "500")),
    ("general_inquiry", ("how do", "where can", "is there", "documentation", "invite",
                         "who approved", "difference between", "do you offer", "which browsers",
                         "contact support", "retain", "training available")),
]


def _digest(*parts: str) -> int:
    return int.from_bytes(hashlib.sha256("|".join(parts).encode("utf-8")).digest()[:8], "big")


def truth_proxy(text: str) -> str:
    """Public wrapper: the deterministic ground-truth proxy used by simulated models."""
    return _truth_proxy(text)


def _truth_proxy(text: str) -> str:
    lowered = text.lower()
    for label, keywords in _RULES:
        if any(keyword in lowered for keyword in keywords):
            return label
    return "general_inquiry"


class SimulatedEnsembleProvider(BaseProvider):
    """A deterministic, zero-cost model with a known error profile."""

    capabilities: ClassVar[set[ProviderCapability]] = {
        ProviderCapability.TEXT_CLASSIFICATION,
        ProviderCapability.IMAGE_CLASSIFICATION,
        ProviderCapability.STRUCTURED_OUTPUT,
        ProviderCapability.TEXT_GENERATION,
    }

    def __init__(
        self,
        name: str,
        *,
        accuracy: float = 0.9,
        overconfidence: float = 3.0,
        hard_rate: float = 0.1,
        shared_bias: dict[str, float] | None = None,
        cost_per_1k_tokens: float = 0.0,
    ) -> None:
        if not 0.0 <= accuracy <= 1.0:
            raise ValueError("accuracy must be in [0, 1]")
        self.name = name
        self.accuracy = accuracy
        self.overconfidence = max(0.1, overconfidence)
        self.hard_rate = max(0.0, min(0.9, hard_rate))
        self.shared_bias = shared_bias or {}
        self.cost_per_1k_tokens = cost_per_1k_tokens
        self._models = [f"{name}-classifier-v1"]

    def list_available_models(self) -> list[str]:
        return list(self._models)

    def _is_hard(self, text: str) -> bool:
        # Intrinsically hard samples are shared across models -> correlated errors.
        return (_digest("hard", text) % 1_000_000) / 1_000_000.0 < self.hard_rate

    def _effective_accuracy(self, truth: str) -> float:
        accuracy = self.accuracy
        # Per-class bias: some models are worse on specific classes.
        accuracy -= self.shared_bias.get(truth, 0.0)
        return min(0.995, max(0.02, accuracy))

    def annotate(self, request: ProviderRequest) -> ProviderResponse:
        text = request.input_text or ""
        if not text and request.asset_bytes:
            # Image/audio input: use the content hash as the deterministic "text" so the same
            # asset yields the same truth for every simulated model (and different images differ).
            import hashlib

            text = hashlib.sha256(request.asset_bytes).hexdigest()
        classes: list[str] = []
        if request.label_schema:
            classes = list(
                request.label_schema.get("labels") or request.label_schema.get("classes") or []
            )
        truth = _truth_proxy(text)
        # If the text explicitly names an allowed class, treat that as the intended label. This keeps
        # the simulator usable for arbitrary user-defined classes (e.g. "correct usage"), which the
        # Simple-Mode wizard needs in order to demonstrate a successful generate→verify cycle.
        explicit_label: str | None = None
        if classes:
            # Longest match wins: "correct usage" is a substring of "incorrect usage", so a plain
            # first-match search would mislabel every incorrect-usage example as correct usage.
            named = [label for label in classes if label.lower() in text.lower()]
            if named:
                explicit_label = max(named, key=len)
                truth = explicit_label
        if classes:
            # The task defines the label space: a simulated model must never emit an
            # out-of-schema class (real providers sometimes do — callers must sanitise too).
            pool = list(dict.fromkeys(classes))
            if truth not in pool:
                # Truth depends on the TEXT only: two simulated models must share the same
                # underlying answer, otherwise they would disagree systematically rather than
                # the realistic way (mostly agree, occasionally both wrong on hard samples).
                truth = pool[_digest("truth", text) % len(pool)]
        else:
            pool = list(dict.fromkeys(
                [truth, "billing", "technical_support", "feature_request", "general_inquiry"]
            ))

        # A verifier that can read an explicit label cue should report it: used only for simulated
        # generation verification (generated texts carry a class clause). Real fixtures never do, so
        # the correlated-failure behaviour used by the ensemble experiments is unchanged.
        if explicit_label is not None:
            return ProviderResponse(
                payload={
                    "label": explicit_label,
                    "probs": {label: (0.95 if label == explicit_label else 0.05 / max(1, len(pool) - 1))
                              for label in pool},
                },
                confidence=0.95,
                model=request.model or self._models[0],
                usage=ProviderUsage(input_tokens=len(text) // 4, output_tokens=8, total_tokens=len(text) // 4 + 8),
            )

        # Ambiguous ("hard") samples are ones every model gets wrong, and they converge on the
        # SAME wrong label — this is what makes errors *correlated*, the failure mode an ensemble
        # audit must be able to detect (Conditional independence would hide it.)
        hard = self._is_hard(text)
        if hard:
            correct = False
        else:
            correct = (_digest(self.name, "correct", text) % 1_000_000) / 1_000_000.0 < self._effective_accuracy(truth)

        wrong = [candidate for candidate in pool if candidate != truth]
        if correct or not wrong:
            label = truth
        elif hard:
            label = wrong[_digest("shared-wrong", text) % len(wrong)]
        else:
            label = wrong[_digest(self.name, "wrong", text) % len(wrong)]

        # Emit an overconfident distribution: high mass on the (possibly wrong) label.
        raw = []
        for candidate in pool:
            if candidate == label:
                raw.append(self.overconfidence)
            else:
                # deterministic small variation so distributions are not identical
                raw.append(-1.0 + ((_digest(self.name, candidate, text) % 1000) / 1000.0))
        peak = max(raw)
        exps = [math.exp(value - peak) for value in raw]
        total = sum(exps) or 1.0
        probs = {candidate: value / total for candidate, value in zip(pool, exps, strict=True)}

        tokens_in = max(1, len(text) // 4)
        tokens_out = 24
        cost = (tokens_in + tokens_out) / 1000.0 * self.cost_per_1k_tokens
        return ProviderResponse(
            payload={"label": label, "probs": probs, "confidence": probs[label]},
            confidence=probs[label],
            model=request.model or self._models[0],
            usage=ProviderUsage(
                input_tokens=tokens_in,
                output_tokens=tokens_out,
                total_tokens=tokens_in + tokens_out,
                estimated_cost_usd=round(cost, 6),
            ),
            raw_response={"simulated": True, "name": self.name, "correct": correct},
            latency_ms=0.0,
        )




    _GEN_TEMPLATES: ClassVar[dict[str, list[str]]] = {
        "billing": [
            "I was charged for {a} {b} and need a refund.",
            "My invoice lists {a} that I never bought ({b}).",
            "The payment for {a} failed again {b}.",
            "Please refund {a} from the last {b}.",
        ],
        "technical_support": [
            "The app crashes on {a} after {b}.",
            "Uploading {a} returns an error during {b}.",
            "The {a} queue spins forever after {b}.",
            "Export to {a} fails with a 500 error {b}.",
        ],
        "feature_request": [
            "Please add {a} for the {b} screen.",
            "It would help to add {a} to {b}.",
            "Could you add support for {a} in {b}?",
            "We would like to schedule {a} for {b}.",
        ],
        "general_inquiry": [
            "How do I {a} inside the {b}?",
            "Where can I find documentation about {a} in {b}?",
            "Is there a limit on {a} for {b}?",
            "Do you offer training for {a} in {b}?",
        ],
    }
    _GEN_SLOTS: ClassVar[dict[str, list[str]]] = {
        "a": ["storage", "seats", "exports", "reviews", "labels", "archives",
              "webhooks", "templates", "reports", "filters", "versions", "tags"],
        "b": ["yesterday", "last week", "this morning", "during onboarding",
              "after the upgrade", "on mobile", "in the EU region", "at month end"],
    }

    # Independently combined pools. Measured empirically against the anti-collapse metric
    # (unique trigram ratio must stay above 0.35): with these sizes a 1,000-item batch scores ~0.46,
    # while four small canned templates scored ~0.17 and were correctly rejected as collapse.
    _GEN_SUBJECTS: ClassVar[list[str]] = [
        "customer", "user", "lead", "admin", "owner", "reviewer", "manager", "agent",
        "engineer", "analyst", "client", "operator", "editor", "buyer", "tester", "moderator",
        "visitor", "guest", "sponsor", "partner", "vendor",
    ]
    _GEN_ACTIONS: ClassVar[list[str]] = [
        "reported", "noticed", "flagged", "described", "escalated", "asked", "documented",
        "raised", "mentioned", "questioned", "disputed", "observed", "confirmed", "queried",
        "highlighted", "requested", "recorded", "measured", "reopened", "retested",
    ]
    _GEN_OBJECTS: ClassVar[list[str]] = [
        "duplicate charge", "export button", "invoice mismatch", "slow upload",
        "comparison view", "missing confirmation", "unclear error", "weekly digest",
        "stale badge", "search filter", "broken link", "review queue", "timeout",
        "label picker", "merge conflict", "onboarding step", "audit trail", "batch import",
        "status page", "retry policy", "billing cycle", "seat count", "data refresh",
        "file preview", "key rotation", "plan change", "usage report", "quota warning",
        "webhook delivery", "schema update", "backup restore", "access request",
        "role assignment", "email template", "note field", "filter preset", "sample row",
        "queue position", "progress panel", "version diff",
    ]
    _GEN_DETAILS: ClassVar[list[str]] = [
        "this morning", "last week", "after upgrading", "on mobile", "in staging",
        "during onboarding", "at month end", "under load", "in the EU region", "before release",
        "after import", "on tablet", "during review", "in production", "after renaming",
        "at peak time", "in the demo", "under quota", "after cleanup", "during migration",
        "before signup", "after logout", "while searching", "during export", "at midnight",
        "after paging", "under SSL", "while offline", "during training", "after merging",
        "in the sandbox", "while sorting", "after filtering", "during upload", "before publish",
        "after rollback", "in the archive", "while trimming", "during validation", "after dedupe",
    ]
    _GEN_ENDS: ClassVar[list[str]] = [
        "again", "twice", "now", "today", "still", "briefly", "once more", "yesterday",
        "repeatedly", "later", "sooner", "already", "before", "afterwards", "instead",
        "meanwhile", "again today", "once again", "just now", "for now",
    ]
    _GEN_CUES: ClassVar[list[str]] = [
        "Example of {label}.", "Labelled {label}.", "Counts as {label}.", "{label}.",
    ]

    def _pick(self, pool: list[str], salt: str, target: str, index: int) -> str:
        return pool[_digest(self.name, salt, target, str(index)) % len(pool)]

    def generate(self, request: ProviderRequest) -> ProviderResponse:
        """Deterministic synthetic text generation (simulated, zero cost).

        Emits label-carrying but lexically varied sentences so the gated-generation pipeline can be
        exercised end to end in development without any paid model call.
        """
        parameters = request.parameters or {}
        target = str(parameters.get("target_class") or "billing")
        index = int(parameters.get("index") or 0)
        subject = self._pick(self._GEN_SUBJECTS, "subject", target, index)
        action = self._pick(self._GEN_ACTIONS, "action", target, index)
        thing = self._pick(self._GEN_OBJECTS, "object", target, index)
        detail = self._pick(self._GEN_DETAILS, "detail", target, index)
        ending = self._pick(self._GEN_ENDS, "ending", target, index)
        cue = self._GEN_CUES[index % len(self._GEN_CUES)].format(label=target)
        # The trailing cue lets the independent simulated verifier recover the intended class for
        # any user-defined class name; keeping it short avoids inflating repeated trigrams.
        text = f"{subject} {action} {thing} {detail} {ending}. {cue}"
        return ProviderResponse(
            payload={"text": text, "target_class": target},
            confidence=0.9,
            model=request.model or self._models[0],
            usage=ProviderUsage(input_tokens=12, output_tokens=24, total_tokens=36),
            raw_response={"simulated": True, "generation": True},
        )

def build_simulated_trio(
    *,
    strong_accuracy: float = 0.93,
    medium_accuracy: float = 0.88,
    weak_accuracy: float = 0.80,
    hard_rate: float = 0.12,
) -> list[SimulatedEnsembleProvider]:
    """Three models with deliberately different competence and per-class weaknesses.

    Matches the real deployment shape: three different families that are individually good,
    disagree on hard samples, and are not uniformly strong across classes.
    """
    return [
        SimulatedEnsembleProvider(
            "sim-strong",
            accuracy=strong_accuracy,
            overconfidence=3.5,
            hard_rate=hard_rate,
            shared_bias={"general_inquiry": 0.06},
        ),
        SimulatedEnsembleProvider(
            "sim-medium",
            accuracy=medium_accuracy,
            overconfidence=2.5,
            hard_rate=hard_rate,
            shared_bias={"billing": 0.08},
        ),
        SimulatedEnsembleProvider(
            "sim-weak",
            accuracy=weak_accuracy,
            overconfidence=5.0,
            hard_rate=hard_rate,
            shared_bias={"technical_support": 0.10},
        ),
    ]

    # ---------------------------------------------------------------- generation ---
