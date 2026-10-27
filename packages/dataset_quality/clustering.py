"""
2D Semantic Cluster Map and Coverage Gap Analysis Engine.
Projects multimodal record features into a 2D coordinate space ([-1, 1]^2)
using deterministic Singular Value Decomposition (SVD / PCA) and evaluates
spatial grid density to identify under-represented "data deserts" (coverage gaps).
"""
from __future__ import annotations

import math
from collections import Counter
from typing import Any


def _compute_record_feature_vector(
    record: Any,
    vocab: list[str],
) -> list[float]:
    """
    Construct numeric feature vector for a record using text n-grams and annotation properties.
    """
    text = ""
    if hasattr(record, "extra_metadata") and record.extra_metadata:
        text = record.extra_metadata.get("text", "")

    label = ""
    boxes_count = 0
    if hasattr(record, "annotations") and record.annotations:
        active = record.annotations[0]
        payload = active.payload or {}
        label = str(payload.get("label", ""))
        boxes = payload.get("boxes", [])
        if isinstance(boxes, list):
            boxes_count = len(boxes)

    combined_text = f"{text} {label}".lower()

    # Compute term frequency against global vocabulary
    vec = [0.0] * len(vocab)
    words = combined_text.split()
    for w in words:
        if w in vocab:
            idx = vocab.index(w)
            vec[idx] += 1.0

    # Add normalized box count feature
    vec.append(min(1.0, boxes_count / 10.0))
    # Normalize L2 norm
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


def _project_2d_svd(features: list[list[float]]) -> list[tuple[float, float]]:
    """
    Deterministic power iteration / SVD projection to 2 principal components.
    Centers and scales output into [-1.0, 1.0].
    """
    n = len(features)
    if n == 0:
        return []
    d = len(features[0])

    if n == 1:
        return [(0.0, 0.0)]

    # 1. Mean center the data
    means = [sum(features[i][j] for i in range(n)) / n for j in range(d)]
    centered = [[features[i][j] - means[j] for j in range(d)] for i in range(n)]

    # 2. First principal component via power iteration
    def get_principal_component(matrix: list[list[float]], max_iter: int = 25) -> list[float]:
        # Initial deterministic seed vector
        v = [1.0 / math.sqrt(d)] * d
        for _ in range(max_iter):
            # w = X^T * (X * v)
            xv = [sum(matrix[i][j] * v[j] for j in range(d)) for i in range(n)]
            w = [sum(matrix[i][j] * xv[i] for i in range(n)) for j in range(d)]
            norm = math.sqrt(sum(x * x for x in w))
            if norm == 0:
                break
            v = [x / norm for x in w]
        return v

    pc1 = get_principal_component(centered)

    # Deflate matrix for second component
    deflated = []
    for i in range(n):
        proj = sum(centered[i][j] * pc1[j] for j in range(d))
        row = [centered[i][j] - proj * pc1[j] for j in range(d)]
        deflated.append(row)

    pc2 = get_principal_component(deflated)

    coords: list[tuple[float, float]] = []
    for i in range(n):
        u = sum(centered[i][j] * pc1[j] for j in range(d))
        v = sum(centered[i][j] * pc2[j] for j in range(d))
        coords.append((u, v))

    # Scale to [-0.85, 0.85] bounds
    max_u = max(abs(c[0]) for c in coords) or 1.0
    max_v = max(abs(c[1]) for c in coords) or 1.0

    return [
        (
            round(max(-1.0, min(1.0, (c[0] / max_u) * 0.85)), 4),
            round(max(-1.0, min(1.0, (c[1] / max_v) * 0.85)), 4),
        )
        for c in coords
    ]


def compute_dataset_clusters(
    records: list[Any],
    grid_size: int = 5,
) -> dict[str, Any]:
    """
    Compute 2D coordinates for records, cluster centroids, and identify sparse coverage gaps.
    """
    if not records:
        return {
            "points": [],
            "clusters": [],
            "coverage_gap_cells": [],
            "total_records": 0,
        }

    # 1. Build compact common vocabulary across records
    word_counter: Counter[str] = Counter()
    for r in records:
        text = ""
        if hasattr(r, "extra_metadata") and r.extra_metadata:
            text = r.extra_metadata.get("text", "")
        for w in text.lower().split():
            if len(w) > 2:
                word_counter[w] += 1

    vocab = [w for w, _ in word_counter.most_common(24)]
    if not vocab:
        vocab = ["sample", "data", "token", "item"]

    # 2. Extract vectors and project to 2D
    features = [_compute_record_feature_vector(r, vocab) for r in records]
    projections = _project_2d_svd(features)

    points: list[dict[str, Any]] = []
    class_groups: dict[str, list[tuple[float, float]]] = {}

    for i, r in enumerate(records):
        u, v = projections[i]
        label = "unlabeled"
        if hasattr(r, "annotations") and r.annotations:
            active = r.annotations[0]
            payload = active.payload or {}
            label = str(payload.get("label", "unlabeled"))
            if label == "unlabeled" and "boxes" in payload and payload["boxes"]:
                label = str(payload["boxes"][0].get("label", "detected_object"))

        snippet = ""
        if hasattr(r, "extra_metadata") and r.extra_metadata:
            snippet = r.extra_metadata.get("text", "")[:48]

        points.append({
            "record_id": r.id,
            "u": u,
            "v": v,
            "x": u,
            "y": v,
            "density": 1.0,
            "label": label,
            "split": getattr(r, "split", "train"),
            "snippet": snippet,
        })

        if label not in class_groups:
            class_groups[label] = []
        class_groups[label].append((u, v))

    # 3. Compute cluster centroids
    clusters: list[dict[str, Any]] = []
    for cls_name, coords in class_groups.items():
        avg_u = round(sum(c[0] for c in coords) / len(coords), 4)
        avg_v = round(sum(c[1] for c in coords) / len(coords), 4)
        clusters.append({
            "label": cls_name,
            "center_u": avg_u,
            "center_v": avg_v,
            "count": len(coords),
        })

    # 4. Compute grid density and identify coverage gaps ("data deserts")
    # Grid divides [-1.0, 1.0] into grid_size x grid_size bins
    cell_counts: dict[tuple[int, int], int] = Counter()
    step = 2.0 / grid_size

    for p in points:
        gx = min(grid_size - 1, max(0, int((p["u"] + 1.0) / step)))
        gy = min(grid_size - 1, max(0, int((p["v"] + 1.0) / step)))
        cell_counts[(gx, gy)] += 1

    coverage_gaps: list[dict[str, Any]] = []
    avg_cell_density = len(points) / (grid_size * grid_size)

    for gx in range(grid_size):
        for gy in range(grid_size):
            cnt = cell_counts.get((gx, gy), 0)
            center_u = round(-1.0 + (gx + 0.5) * step, 3)
            center_v = round(-1.0 + (gy + 0.5) * step, 3)

            # Sparse if count is 0 or less than 25% of average
            if cnt <= max(0, int(avg_cell_density * 0.25)):
                # Find nearest cluster to suggest class
                nearest_class = clusters[0]["label"] if clusters else "edge_case"
                if clusters:
                    nearest_class = min(
                        clusters,
                        key=lambda c: (c["center_u"] - center_u) ** 2 + (c["center_v"] - center_v) ** 2,
                    )["label"]

                coverage_gaps.append({
                    "cell_id": f"gap_{gx}_{gy}",
                    "grid_x": gx,
                    "grid_y": gy,
                    "center_u": center_u,
                    "center_v": center_v,
                    "density": cnt,
                    "suggested_class": nearest_class,
                    "prompt_hint": f"Synthesize {nearest_class} corner-cases and rare variants",
                })

    return {
        "points": points,
        "clusters": clusters,
        "coverage_gap_cells": coverage_gaps,
        "total_points": len(points),
        "total_records": len(points),
    }
