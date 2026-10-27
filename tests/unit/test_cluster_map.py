class MockRecord:
    def __init__(self, rid, text, label=None, split="train", boxes=None):
        self.id = rid
        self.extra_metadata = {"text": text}
        self.split = split
        self.annotations = []
        if label or boxes:
            payload = {}
            if label:
                payload["label"] = label
            if boxes:
                payload["boxes"] = boxes
            mock_ann = type("MockAnn", (), {"payload": payload})
            self.annotations = [mock_ann]


def test_compute_dataset_clusters():
    from packages.dataset_quality.clustering import compute_dataset_clusters

    records = [
        MockRecord("r1", "Defect scratch found on car door panel", label="defect"),
        MockRecord("r2", "Minor scratch detected along door trim", label="defect"),
        MockRecord("r3", "Clean surface with no visible damage", label="intact"),
        MockRecord("r4", "Pristine finish observed on panel", label="intact"),
        MockRecord("r5", "Severe dent and crack on bumper", label="defect"),
    ]

    res = compute_dataset_clusters(records, grid_size=4)
    assert res["total_records"] == 5
    assert len(res["points"]) == 5

    for p in res["points"]:
        assert -1.0 <= p["u"] <= 1.0
        assert -1.0 <= p["v"] <= 1.0
        assert p["label"] in {"defect", "intact"}

    assert len(res["clusters"]) >= 2
    # At least some grid cells are sparse/empty data deserts
    assert len(res["coverage_gap_cells"]) > 0
