"""
Generate a deterministic, balanced, labeled text-classification fixture.

Produces ``examples/text_intents_200.csv`` with columns: text,label,split

Why synthetic: the repo must not ship real user/customer data (AGENTS.md §8/§11), so this
fixture is programmatically generated with a fixed seed. Class signal comes from intent
phrasing + slot fillers, which makes ground truth unambiguous for measurement while still
requiring the model to read the sentence (not just match one keyword).

Usage:
    python scripts/fixtures/generate_text_fixture.py [--per-class 50] [--seed 42]
"""
from __future__ import annotations

import argparse
import csv
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "examples" / "text_intents_200.csv"

LABELS = ["billing", "technical_support", "feature_request", "general_inquiry"]

SLOTS: dict[str, list[str]] = {
    "item": ["team plan", "pro subscription", "storage add-on", "API credits", "premium seat",
             "annual plan", "starter tier", "enterprise contract"],
    "period": ["month", "quarter", "week", "billing cycle", "renewal date"],
    "amount": ["$12", "$49", "$120", "$15", "$240", "$8.50", "$99"],
    "feature": ["billing", "settings", "annotation", "dashboard", "quality", "export",
                "provider", "dataset", "review", "search"],
    "device": ["desktop", "laptop", "phone", "tablet", "browser"],
    "size": ["25", "100", "500", "900", "2000"],
    "action": ["approve", "reject", "navigate", "save", "bulk-assign"],
    "format": ["JSONL", "Parquet", "WebVTT", "COCO", "YOLO"],
    "benefit": ["filter faster", "review quicker", "cut busywork", "audit changes",
                "trace provenance", "ship sooner"],
    "area": ["dataset list", "workspace", "quality dashboard", "versions", "governance",
             "import wizard", "evaluation"],
    "activity": ["labeling", "review", "annotation", "triage", "QA"],
    "task": ["reviews", "exports", "validation runs", "retraining jobs", "quality audits"],
    "plan": ["team", "pro", "enterprise", "student"],
}

TEMPLATES: dict[str, list[str]] = {
    "billing": [
        "I was charged twice for my {item} this {period}. Please issue a refund.",
        "My invoice shows {amount} more than the plan I signed up for.",
        "The payment for my {item} renewal failed and now my account is suspended.",
        "Can you update the credit card on file for the {item}?",
        "I cancelled last {period} but I am still being billed for {item}.",
        "Where is the receipt for the {amount} charge on my statement?",
        "Please switch my billing from monthly to annual for the {item}.",
        "I need a refund for the {item} I never received.",
        "The discount code was not applied to my latest invoice for {amount}.",
        "Why did the price of my {item} increase without notice this {period}?",
    ],
    "technical_support": [
        "The app crashes whenever I open the {feature} screen.",
        "Syncing between my {device} and my {device} keeps failing with an error.",
        "Uploading a file larger than {size} MB never finishes.",
        "The keyboard shortcut for {action} does nothing in the editor.",
        "The {feature} page spins forever after I refresh.",
        "Exporting to {format} produces an empty file.",
        "Login fails with a 500 error after I reset my password on the {device}.",
        "The search results ignore my filters on the {feature} tab.",
        "Playback stutters when I scrub the timeline in the {feature} view.",
        "The {feature} table shows stale data until I reload twice on my {device}.",
    ],
    "feature_request": [
        "Please add {feature} so I can {benefit}.",
        "It would help to have {feature} in the {area} view.",
        "Could you support {format} files in addition to CSV?",
        "Add a keyboard shortcut to jump straight to the {area}.",
        "Dark mode would make long {activity} sessions easier.",
        "We need bulk actions so I can {action} many records at once.",
        "Please expose an API endpoint for {feature}.",
        "It would be great to schedule {task} automatically from the {area}.",
        "Can you add multi-label support for {task} in the {area}?",
        "A search box on the {area} page would help me {benefit}.",
    ],
    "general_inquiry": [
        "How do I invite a teammate to review my dataset in the {area}?",
        "Where can I find the documentation for {feature}?",
        "Is there a way to see who approved a specific label in the {area}?",
        "What is the difference between a project and a dataset?",
        "Do you offer a free trial for the {plan} plan?",
        "How long do you retain uploaded data on the {plan} tier?",
        "Can I export my account data at any time from the {area}?",
        "Is training available for new team members using the {area}?",
        "Which browsers are supported for the web app on a {device}?",
        "How do I contact support outside business hours?",
    ],
}


def build_rows(per_class: int, seed: int) -> list[tuple[str, str]]:
    rng = random.Random(seed)
    rows: list[tuple[str, str]] = []
    for label in LABELS:
        templates = TEMPLATES[label]
        seen: set[str] = set()
        attempts = 0
        while len([r for r in rows if r[1] == label]) < per_class:
            attempts += 1
            if attempts > per_class * 200:
                raise SystemExit(f"could not generate {per_class} unique rows for {label}")
            template = rng.choice(templates)
            sentence = template
            # fill every slot present in this template
            while "{" in sentence and "}" in sentence:
                start = sentence.index("{")
                end = sentence.index("}", start)
                slot = sentence[start + 1:end]
                sentence = sentence[:start] + rng.choice(SLOTS[slot]) + sentence[end + 1:]
            sentence = sentence.strip()
            if sentence in seen or any(sentence == r[0] for r in rows):
                continue
            seen.add(sentence)
            rows.append((sentence, label))
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-class", type=int, default=50)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rows = build_rows(args.per_class, args.seed)
    rng = random.Random(args.seed + 1)
    rng.shuffle(rows)

    total = len(rows)
    n_test = max(30, total // 5)          # >= 30 so accuracy is above the "small sample" warning
    n_val = max(20, total // 5)
    n_train = total - n_test - n_val
    split_of = (
        ["train"] * n_train
        + ["val"] * n_val
        + ["test"] * n_test
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["text", "label", "split"])
        for (text, label), split in zip(rows, split_of, strict=True):
            writer.writerow([text, label, split])

    counts: dict[str, int] = {}
    for (_, label), split in zip(rows, split_of, strict=True):
        counts[f"{label}/{split}"] = counts.get(f"{label}/{split}", 0) + 1
    print(f"wrote {OUT} ({total} rows)")
    print(f"  splits: train={n_train} val={n_val} test={n_test}")
    for key in sorted(counts):
        print(f"  {key:28} {counts[key]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
