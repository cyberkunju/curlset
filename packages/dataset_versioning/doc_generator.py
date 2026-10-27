"""
Automated Dataset Card (README.md) and documentation generator.
Produces standardized, publication-grade dataset cards summarizing task, schemas, splits,
provenance, license status, quality audits, and statutory limitations.
"""
from packages.dataset_versioning.manifest import DatasetVersionManifest


def generate_dataset_card_markdown(
    manifest: DatasetVersionManifest,
    dataset_description: str | None = None,
    annotation_instructions: str | None = None,
    license_name: str | None = None,
    source_attribution: str | None = None,
) -> str:
    """
    Generate standard Markdown Dataset Card following Hugging Face / Model Card conventions
    with strict adherence to AGENTS.md provenance, quality, and licensing rules.
    """
    total = manifest.record_count
    records = manifest.records

    # Split breakdown
    split_counts: dict[str, int] = {}
    for r in records:
        split_counts[r.split] = split_counts.get(r.split, 0) + 1

    # Class breakdown
    class_counts: dict[str, int] = {}
    origin_counts: dict[str, int] = {}
    for r in records:
        if r.annotation and r.annotation.payload:
            # Check label/labels/category
            lbl = (
                r.annotation.payload.get("label")
                or r.annotation.payload.get("category")
                or r.annotation.payload.get("labels")
            )
            if isinstance(lbl, list):
                for item in lbl:
                    class_counts[str(item)] = class_counts.get(str(item), 0) + 1
            elif lbl:
                class_counts[str(lbl)] = class_counts.get(str(lbl), 0) + 1

            orig = r.annotation.origin
            origin_counts[orig] = origin_counts.get(orig, 0) + 1

    # Modality and assets
    total_assets = sum(len(r.assets) for r in records)
    total_bytes = sum(sum(a.byte_size for a in r.assets) for r in records)

    quality = manifest.quality_summary or {}
    blocking = quality.get("blocking_count", 0)
    warnings = quality.get("warning_count", 0)

    lines = [
        f"# Dataset Card: {manifest.dataset_name} ({manifest.version_tag})",
        "",
        "## Summary",
        f"- **Dataset ID**: `{manifest.dataset_id}`",
        f"- **Version Tag**: `{manifest.version_tag}` (Version #{manifest.version_number})",
        f"- **Task Type**: `{manifest.task_type}`",
        f"- **Schema Version**: `v{manifest.schema_version}`",
        f"- **Publication Date**: `{manifest.created_at}`",
        f"- **Published By**: `{manifest.created_by}`",
        f"- **Total Records**: {total:,}",
        f"- **Total Media Assets**: {total_assets:,} ({total_bytes / (1024 * 1024):.2f} MB)",
        "",
        "## Description",
        dataset_description or "No formal description supplied.",
        "",
        "## Splits & Composition",
        "| Split | Record Count | Percentage |",
        "|---|---|---|",
    ]

    for split, count in sorted(split_counts.items()):
        pct = (count / total * 100) if total > 0 else 0
        lines.append(f"| `{split}` | {count:,} | {pct:.1f}% |")

    lines.extend([
        "",
        "## Label & Class Distribution",
    ])

    if class_counts:
        lines.extend([
            "| Class Label | Count | Share |",
            "|---|---|---|",
        ])
        for cls, count in sorted(class_counts.items(), key=lambda x: -x[1]):
            pct = (count / total * 100) if total > 0 else 0
            lines.append(f"| `{cls}` | {count:,} | {pct:.1f}% |")
    else:
        lines.append("*No categorical labels recorded or structured schema.*")

    lines.extend([
        "",
        "## Provenance & Origin",
    ])
    if origin_counts:
        lines.extend([
            "| Origin | Count | Share |",
            "|---|---|---|",
        ])
        for orig, count in sorted(origin_counts.items()):
            pct = (count / total * 100) if total > 0 else 0
            lines.append(f"| `{orig}` | {count:,} | {pct:.1f}% |")
    else:
        lines.append("*Origin metadata unavailable.*")

    synth_count = origin_counts.get("synthetic", 0)
    if synth_count > 0:
        synth_pct = (synth_count / total * 100) if total > 0 else 0
        lines.extend([
            "",
            "> [!NOTE]",
            f"> **Synthetic Data Disclosure**: This version contains {synth_count:,} ({synth_pct:.1f}%) synthetically generated sample(s). Full generation parameters, prompts, and provider lineage are retained in the version manifest.",
        ])

    lines.extend([
        "",
        "## Annotation Guidelines",
        annotation_instructions or "Standard labeling procedures were applied.",
        "",
        "## Rights, Licensing & Attribution",
        f"- **Declared License**: {license_name if license_name else '`UNKNOWN / REVIEW-REQUIRED`'}",
        f"- **Source Attribution**: {source_attribution if source_attribution else '`UNKNOWN / PROPRIETARY`'}",
        "",
        "> [!IMPORTANT]",
        "> Per platform governance, unspecified or unverified source rights remain classified as `review-required`.",
        "> Downstream users are responsible for independently verifying third-party data licenses prior to commercial training.",
        "",
        "## Quality Audit & Verification",
        f"- **Audit Status**: {'Pass' if blocking == 0 else 'Failed Blocking Criteria'}",
        f"- **Blocking Integrity Issues**: {blocking}",
        f"- **Quality Warnings**: {warnings}",
        f"- **Canonical Manifest SHA-256**: `{manifest.version_id}`",
        "",
        "## Limitations & Ethical Disclaimers",
        "> [!WARNING]",
        "> Automated quality checks detect structural, schema, split-leakage, and duplicate anomalies.",
        "> They do **not** certify that a dataset is free from societal bias, toxic content, or completely cleared of intellectual property restrictions.",
        "> Rigorous evaluation should be performed prior to high-stakes or sensitive production deployments.",
        "",
        "---",
        "*Generated by the AI Dataset Engineering Platform Versioning Engine.*",
    ])

    return "\n".join(lines)
