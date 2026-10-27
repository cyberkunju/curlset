"""Deterministic 2D Semantic Projection and Coverage Gap Detector.

Projects record feature vectors into a normalized 2D space [-1.0, 1.0]^2,
computes local semantic density, and identifies low-coverage boundary cells
to guide targeted synthetic generation and active review.
"""

import math
from typing import Any

from pydantic import BaseModel, Field


class ClusterPoint(BaseModel):
    record_id: str
    x: float
    y: float
    label: str | None = None
    density: float = Field(ge=0.0)


class CoverageGap(BaseModel):
    gap_id: str
    grid_x: int
    grid_y: int
    center_x: float
    center_y: float
    density: float
    nearest_record_ids: list[str] = Field(default_factory=list)
    suggested_focus: str


class ClusterMapResponse(BaseModel):
    dataset_id: str
    total_points: int
    points: list[ClusterPoint]
    coverage_gaps: list[CoverageGap]
    grid_resolution: int = 8


def project_embeddings_to_2d(
    records: list[dict[str, Any]],
    grid_size: int = 8,
) -> ClusterMapResponse:
    """Project record embeddings to 2D coordinates using power-iteration 2-component PCA.

    records: list of dicts with:
      - record_id: str
      - embedding: list[float]
      - label: optional str
    """
    if not records:
        return ClusterMapResponse(
            dataset_id="",
            total_points=0,
            points=[],
            coverage_gaps=[],
        )

    # Filter records with embeddings
    valid_records = [r for r in records if r.get("embedding")]
    if not valid_records:
        return ClusterMapResponse(
            dataset_id="",
            total_points=0,
            points=[],
            coverage_gaps=[],
        )

    dim = len(valid_records[0]["embedding"])
    n = len(valid_records)

    # 1. Center the vectors
    means = [0.0] * dim
    for r in valid_records:
        for d in range(dim):
            means[d] += r["embedding"][d]
    means = [m / float(n) for m in means]

    centered = []
    for r in valid_records:
        c_vec = [r["embedding"][d] - means[d] for d in range(dim)]
        centered.append(c_vec)

    # 2. Power iteration to find 2 principal components
    def power_iteration(vectors: list[list[float]], iterations: int = 15) -> list[float]:
        # Seed vector
        comp = [1.0 / math.sqrt(dim)] * dim
        for _ in range(iterations):
            # multiply: comp_new = sum_i (x_i * (x_i . comp))
            new_comp = [0.0] * dim
            for x in vectors:
                dot = sum(a * b for a, b in zip(x, comp, strict=False))
                for d in range(dim):
                    new_comp[d] += dot * x[d]
            norm = math.sqrt(sum(a * a for a in new_comp))
            if norm > 1e-8:
                comp = [a / norm for a in new_comp]
            else:
                break
        return comp

    pc1 = power_iteration(centered)

    # Deflate for 2nd component
    deflated = []
    for x in centered:
        dot = sum(a * b for a, b in zip(x, pc1, strict=False))
        d_vec = [x[d] - dot * pc1[d] for d in range(dim)]
        deflated.append(d_vec)

    pc2 = power_iteration(deflated)

    # 3. Project each record onto pc1 and pc2
    raw_coords = []
    for idx, r in enumerate(valid_records):
        cx = centered[idx]
        u = sum(a * b for a, b in zip(cx, pc1, strict=False))
        v = sum(a * b for a, b in zip(cx, pc2, strict=False))
        raw_coords.append((u, v))

    # Normalize coordinates to [-1.0, 1.0]
    max_u = max(abs(u) for u, _ in raw_coords) if raw_coords else 1.0
    max_v = max(abs(v) for _, v in raw_coords) if raw_coords else 1.0
    scale_u = max_u if max_u > 1e-6 else 1.0
    scale_v = max_v if max_v > 1e-6 else 1.0

    points: list[ClusterPoint] = []
    for idx, r in enumerate(valid_records):
        u, v = raw_coords[idx]
        norm_x = round(max(-1.0, min(1.0, u / scale_u)), 4)
        norm_y = round(max(-1.0, min(1.0, v / scale_v)), 4)
        points.append(
            ClusterPoint(
                record_id=r["record_id"],
                x=norm_x,
                y=norm_y,
                label=r.get("label"),
                density=0.0,
            )
        )

    # 4. Compute local kernel density for each point
    sigma = 0.3
    for p1 in points:
        local_dens = 0.0
        for p2 in points:
            dist_sq = (p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2
            local_dens += math.exp(-dist_sq / (2.0 * sigma * sigma))
        p1.density = round(local_dens / float(len(points)), 4)

    # 5. Identify coverage gaps across the grid
    # Grid: [0, grid_size-1] x [0, grid_size-1] mapped across [-1.0, 1.0]
    grid_cells: dict[tuple[int, int], list[ClusterPoint]] = {
        (gx, gy): [] for gx in range(grid_size) for gy in range(grid_size)
    }

    for p in points:
        gx = min(grid_size - 1, max(0, int((p.x + 1.0) / 2.0 * grid_size)))
        gy = min(grid_size - 1, max(0, int((p.y + 1.0) / 2.0 * grid_size)))
        grid_cells[(gx, gy)].append(p)

    coverage_gaps: list[CoverageGap] = []
    gap_idx = 1
    for (gx, gy), cell_points in grid_cells.items():
        if len(cell_points) == 0:
            # Check if this empty cell is adjacent to a populated cell
            neighbors_count = 0
            nearby_p_list: list[ClusterPoint] = []
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    nx, ny = gx + dx, gy + dy
                    if 0 <= nx < grid_size and 0 <= ny < grid_size:
                        n_points = grid_cells.get((nx, ny), [])
                        if n_points:
                            neighbors_count += len(n_points)
                            nearby_p_list.extend(n_points)

            # If adjacent to existing clusters, this is an actionable boundary gap!
            if neighbors_count >= 2:
                center_x = round(-1.0 + (gx + 0.5) * (2.0 / grid_size), 3)
                center_y = round(-1.0 + (gy + 0.5) * (2.0 / grid_size), 3)

                # Find 3 nearest records to this gap center
                nearby_p_list.sort(key=lambda p: (p.x - center_x) ** 2 + (p.y - center_y) ** 2)
                seed_ids = [p.record_id for p in nearby_p_list[:3]]
                top_neighbor_label = nearby_p_list[0].label if nearby_p_list and nearby_p_list[0].label else "General"

                coverage_gaps.append(
                    CoverageGap(
                        gap_id=f"gap_{gap_idx}",
                        grid_x=gx,
                        grid_y=gy,
                        center_x=center_x,
                        center_y=center_y,
                        density=0.0,
                        nearest_record_ids=seed_ids,
                        suggested_focus=f"Boundary gap near {top_neighbor_label} cluster",
                    )
                )
                gap_idx += 1

    return ClusterMapResponse(
        dataset_id="",
        total_points=len(points),
        points=points,
        coverage_gaps=coverage_gaps[:10],  # Cap top 10 most prominent gaps
        grid_resolution=grid_size,
    )
