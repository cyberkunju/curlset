"""
Generate a HARD labeled intent fixture for ensemble evaluation.

The first fixture was saturated (all three frontier models 95-97.5% accurate, 100% precise on their
top-confidence quartile), so ensemble lift was mathematically impossible to observe. This fixture is
built around **implicit intent**: the surface vocabulary deliberately avoids the giveaway words
("invoice", "crash", "add", "how do I") and the classification has to be inferred from what the
person is actually trying to achieve.

Difficulty mechanisms:
  * **implicit intent** — billing expressed as "two weeks and the money still has not come back";
  * **no class keyword** — technical expressed as "it dies at 60 percent every single time";
  * **cross-domain vocabulary** — a general question that mentions "invoice"; a feature request about money;
  * **short fragments** — "Save does nothing.", "Who owns this account?";
  * **affect / frustration** — "Cheaper to cancel than keep arguing.";
  * **near-miss pairs** — sounds like one class, belongs to another by intent.

Gold labels are authored per template (one intent each), which keeps ground truth defensible even
though the surface is noisy. Target model accuracy: roughly 70-85%.

Usage:
    python scripts/generate_hard_fixture.py [--per-class 75] [--seed 11]
"""
from __future__ import annotations

import argparse
import csv
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "examples" / "text_intents_hard.csv"

LABELS = ["billing", "technical_support", "feature_request", "general_inquiry"]

SLOTS: dict[str, list[str]] = {
    "amount": ["twice this month", "again", "a third time", "for the wrong period", "in the wrong currency",
               "for seats we cancelled", "after the trial", "before the renewal date", "for a plan we left"],
    "thing": ["the payment", "the renewal", "the upgrade", "the annual plan", "the card on file",
              "the receipt", "the statement", "the balance", "the downgrade"],
    "symptom": ["dies at 60 percent", "spins forever", "returns an empty archive", "loses half the rows",
                "freezes on open", "fires twice for one event", "stalls at 40 records",
                "cannot get past the login screen", "nothing happens on save", "blanks out on mobile"],
    "want": ["undo a bulk change", "run exports on a schedule", "keyboard-first triage",
             "an immutable trail of decisions", "remember the last view", "flag duplicates at import",
             "saved filters per project", "a confirmation before bulk approve",
             "single sign-on", "a webhook on status change"],
    "area": ["the queue", "the editor", "the dashboard", "exports", "the review flow",
             "the import wizard", "the API", "the reports"],
}


# One intent per template; surface wording intentionally avoids that intent's giveaway keywords.
TEMPLATES: dict[str, list[str]] = {
    "billing": [
        "Two weeks and the money still has not come back.",
        "You took it twice {amount} and support keeps closing the ticket.",
        "The statement does not match the plan we agreed.",
        "We pay for five seats and only three of them work.",
        "Cheaper to cancel than keep arguing about {thing}.",
        "Our finance lead needs the receipt before Friday.",
        "The number changed without anyone telling us.",
        "Same amount again this month, third time now.",
        "It says paid, the bank says otherwise.",
        "We cancelled last quarter and still got {thing} {amount}.",
        "Please move us to monthly, the annual was not worth it.",
        "The trial converted while we were still evaluating.",
        "The upgrade was declined but the plan switched anyway.",
        "Who signed off on this renewal?",
        "I need {thing} corrected before we can close the quarter.",
    ],
    "technical_support": [
        "It {symptom} every single time.",
        "Nobody on the team can get past the login screen.",
        "The page just spins and nothing arrives.",
        "Saving does nothing, no confirmation, no error.",
        "Half the rows vanish after import.",
        "Export finishes but the archive is empty.",
        "Sync loops forever between laptop and desktop.",
        "After the update {area} freezes on open.",
        "One event, two webhook calls, duplicated work.",
        "Search returns nothing even for exact names.",
        "Password reset completes but the old session still works.",
        "Uploading a 2GB archive {symptom}.",
        "Open the dashboard on mobile and it blanks out.",
        "Keyboard save does nothing since yesterday.",
        "We cannot ship, {area} blocks the last step.",
    ],
    "feature_request": [
        "Thirty records in and I want to stop clicking.",
        "Can it remember the view I used last time?",
        "I keep doing this by hand every Monday.",
        "Wish this worked on my phone.",
        "We need a way to {want}.",
        "Would be nice if exports could run on a schedule.",
        "Our reviewers keep asking for keyboard-first triage.",
        "There is no way to tell who changed a label.",
        "Adding a second language means a spreadsheet import.",
        "Webhooks would save us a nightly script.",
        "Compliance wants an immutable trail of decisions.",
        "I would use saved filters on every project.",
        "Please make {area} keyboard navigable.",
        "Bulk approve needs a confirmation step.",
        "Can it flag duplicates at import time?",
    ],
    "general_inquiry": [
        "Who owns this account?",
        "What tier are we on?",
        "Is this allowed under our policy?",
        "Where do I even start with a new dataset?",
        "Can I bring my own model?",
        "What happens if we downgrade?",
        "How many reviewers can one workspace have?",
        "Is there a limit on stored media?",
        "Who do I ask about an invoice from last year?",
        "Do you support single sign-on?",
        "What is the difference between a project and a dataset?",
        "How long do you keep deleted records?",
        "Can a viewer export data?",
        "Where is the guide for new annotators?",
        "What is the support response time on weekends?",
    ],
}


# Real utterances carry context; appending it multiplies template combinations and adds surface noise
# without changing the underlying intent (which is what makes the fixture hard rather than ambiguous).
CONTEXTS: list[str] = [
    "",
    "desktop, second attempt",
    "on mobile",
    "after the last update",
    "since Monday",
    "third time today",
    "on the beta workspace",
    "for the whole team",
    "during the trial",
    "after a password reset",
    "on a large dataset",
    "in the EU region",
    "with SSO enabled",
    "on Safari",
    "again after a refresh",
    "for two weeks now",
    "at month end",
    "before the release",
    "on a slow connection",
    "while reviewing",
    "from the API client",
    "on the enterprise tier",
]


def _with_context(base: str, context: str) -> str:
    if not context:
        return base
    stem = base.rstrip(".").rstrip()
    return f"{stem} ({context})."


def build_rows(per_class: int, seed: int) -> list[tuple[str, str]]:
    rng = random.Random(seed)
    rows: list[tuple[str, str]] = []
    for label in LABELS:
        templates = TEMPLATES[label]
        seen: set[str] = set()
        attempts = 0
        while sum(1 for _, row_label in rows if row_label == label) < per_class:
            attempts += 1
            if attempts > per_class * 400:
                raise SystemExit(f"could not generate {per_class} unique rows for {label}")
            sentence = rng.choice(templates)
            while "{" in sentence and "}" in sentence:
                start = sentence.index("{")
                end = sentence.index("}", start)
                slot = sentence[start + 1:end]
                sentence = sentence[:start] + rng.choice(SLOTS[slot]) + sentence[end + 1:]
            sentence = _with_context(sentence.strip(), rng.choice(CONTEXTS))
            if sentence in seen or any(sentence == existing for existing, _ in rows):
                continue
            seen.add(sentence)
            rows.append((sentence, label))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-class", type=int, default=75)
    parser.add_argument("--seed", type=int, default=11)
    args = parser.parse_args()

    rows = build_rows(args.per_class, args.seed)
    rng = random.Random(args.seed + 5)
    rng.shuffle(rows)
    total = len(rows)
    n_test = max(40, total // 5)
    n_val = max(30, total // 5)
    n_train = total - n_test - n_val
    splits = ["train"] * n_train + ["val"] * n_val + ["test"] * n_test

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["text", "label", "split"])
        for (text, label), split in zip(rows, splits, strict=True):
            writer.writerow([text, label, split])

    lengths = [len(text.split()) for text, _ in rows]
    print(f"wrote {OUT} ({total} rows)")
    print(f"  splits: train={n_train} val={n_val} test={n_test}")
    print(f"  words/sample: min={min(lengths)} median={sorted(lengths)[len(lengths) // 2]} max={max(lengths)}")
    print(f"  distinct: {len({text for text, _ in rows})}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
