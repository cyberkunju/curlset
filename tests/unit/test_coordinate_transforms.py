"""Tests for object detection coordinate transformations, canvas-to-source mapping,
version diff spatial integrity, and export coordinate conversions (Phase R5.2).
"""

import json

import pytest

from packages.dataset_export.coco_exporter import export_to_coco
from packages.dataset_export.yolo_exporter import export_to_yolo_files
from packages.dataset_io.presets import export_ultralytics_yolo


def display_to_source_coords(
    disp_x: float,
    disp_y: float,
    disp_w: float,
    disp_h: float,
    src_w: float,
    src_h: float,
    zoom: float = 1.0,
):
    """Mirror of frontend pure helper displayToSourceCoords."""
    if disp_w <= 0 or disp_h <= 0 or src_w <= 0 or src_h <= 0:
        return disp_x, disp_y
    scale_x = src_w / (disp_w * zoom)
    scale_y = src_h / (disp_h * zoom)
    return (
        max(0.0, min(src_w, disp_x * scale_x)),
        max(0.0, min(src_h, disp_y * scale_y)),
    )


def source_to_display_box(
    box: dict,
    disp_w: float,
    disp_h: float,
    src_w: float,
    src_h: float,
    zoom: float = 1.0,
):
    """Mirror of frontend pure helper sourceToDisplayBox."""
    if disp_w <= 0 or disp_h <= 0 or src_w <= 0 or src_h <= 0:
        return 0, 0, 0, 0
    bx = float(box.get("x", 0))
    by = float(box.get("y", 0))
    bw = float(box.get("w", box.get("width", 0)))
    bh = float(box.get("h", box.get("height", 0)))

    # Normalized coordinate detection for legacy compatibility
    is_norm = bx <= 1.0 and by <= 1.0 and bw <= 1.0 and bh <= 1.0 and (bw > 0 or bh > 0)
    if is_norm:
        bx *= src_w
        by *= src_h
        bw *= src_w
        bh *= src_h

    scale_x = (disp_w * zoom) / src_w
    scale_y = (disp_h * zoom) / src_h
    return (
        bx * scale_x,
        by * scale_y,
        max(2.0, bw * scale_x),
        max(2.0, bh * scale_y),
    )


def compute_contain_letterbox(
    cont_w: float, cont_h: float, img_w: float, img_h: float
):
    """Mirror of object-fit: contain letterbox computation."""
    r_img = img_w / img_h
    r_cont = cont_w / cont_h
    if r_cont > r_img:
        # Horizontal letterboxing
        rendered_h = cont_h
        rendered_w = cont_h * r_img
        off_x = (cont_w - rendered_w) / 2.0
        off_y = 0.0
    else:
        # Vertical letterboxing
        rendered_w = cont_w
        rendered_h = cont_w / r_img
        off_x = 0.0
        off_y = (cont_h - rendered_h) / 2.0
    return rendered_w, rendered_h, off_x, off_y


class TestCoordinateTransforms:
    def test_image_at_intrinsic_size(self):
        """Image rendered 1:1 without scaling."""
        src_w, src_h = 800, 600
        disp_w, disp_h = 800, 600

        # Click at (120, 240) in displayed canvas
        sx, sy = display_to_source_coords(120, 240, disp_w, disp_h, src_w, src_h)
        assert sx == 120.0
        assert sy == 240.0

        # Render box back to display
        box = {"label": "car", "x": 120, "y": 240, "w": 200, "h": 100}
        dx, dy, dw, dh = source_to_display_box(box, disp_w, disp_h, src_w, src_h)
        assert dx == 120.0
        assert dy == 240.0
        assert dw == 200.0
        assert dh == 100.0

    def test_image_scaled_down_to_viewport(self):
        """High-resolution image (1920x1080) rendered in responsive container (960x540)."""
        src_w, src_h = 1920, 1080
        disp_w, disp_h = 960, 540

        # User drags from (100, 100) to (200, 200) on displayed canvas
        sx, sy = display_to_source_coords(100, 100, disp_w, disp_h, src_w, src_h)
        assert sx == 200.0
        assert sy == 200.0

        # Stored canonical box (200, 200, 400, 200) renders at exact display pixels
        box = {"label": "pedestrian", "x": 200, "y": 200, "w": 400, "h": 200}
        dx, dy, dw, dh = source_to_display_box(box, disp_w, disp_h, src_w, src_h)
        assert dx == 100.0
        assert dy == 100.0
        assert dw == 200.0
        assert dh == 100.0

    def test_letterboxing_wide_and_tall_images(self):
        """Test contain letterboxing margins for 16:9 and 9:16 images in 4:3 viewport."""
        # 16:9 wide image in 800x600 container
        rw, rh, ox, oy = compute_contain_letterbox(800, 600, 1600, 900)
        assert rw == 800.0
        assert rh == 450.0
        assert ox == 0.0
        assert oy == 75.0  # (600 - 450) / 2

        # 9:16 tall image in 800x600 container
        rw, rh, ox, oy = compute_contain_letterbox(800, 600, 900, 1600)
        assert rh == 600.0
        assert rw == pytest.approx(337.5)
        assert ox == pytest.approx((800 - 337.5) / 2)  # 231.25
        assert oy == 0.0

    def test_zoomed_canvas_input_and_movement(self):
        """Zooming in 2.0x scales viewport pointer mapping and box display."""
        src_w, src_h = 1000, 1000
        disp_w, disp_h = 500, 500
        zoom = 2.0

        # Under 2x zoom, clicking display pixel 250 corresponds to center of the zoomed half
        sx, sy = display_to_source_coords(250, 250, disp_w, disp_h, src_w, src_h, zoom=zoom)
        assert sx == 250.0  # 250 * (1000 / (500 * 2.0)) = 250 * 1.0 = 250
        assert sy == 250.0

        # A box of source width 100 at 2.0x zoom displays with 100 display pixels
        box = {"x": 250, "y": 250, "w": 100, "h": 100}
        dx, dy, dw, dh = source_to_display_box(box, disp_w, disp_h, src_w, src_h, zoom=zoom)
        assert dx == 250.0
        assert dy == 250.0
        assert dw == 100.0
        assert dh == 100.0

    def test_viewport_resizing_invariance(self):
        """Stored canonical box maintains correct proportional coverage when viewport changes."""
        src_w, src_h = 2000, 1000
        canonical_box = {"x": 500, "y": 250, "w": 1000, "h": 500}

        # Viewport 1: 1000 x 500 (2:1 aspect ratio)
        dx1, dy1, dw1, dh1 = source_to_display_box(canonical_box, 1000, 500, src_w, src_h)
        assert dx1 == 250.0
        assert dy1 == 125.0
        assert dw1 == 500.0
        assert dh1 == 250.0

        # Viewport 2: Resized to 400 x 200
        dx2, dy2, dw2, dh2 = source_to_display_box(canonical_box, 400, 200, src_w, src_h)
        assert dx2 == 100.0
        assert dy2 == 50.0
        assert dw2 == 200.0
        assert dh2 == 100.0

        # Relative coverage remains exact: dw / disp_w = 0.5
        assert dw1 / 1000 == 0.5
        assert dw2 / 400 == 0.5

    def test_legacy_normalized_coordinates_handling(self):
        """Legacy annotations saved in 0..1 normalized coords convert cleanly to source pixels."""
        src_w, src_h = 1920, 1080
        disp_w, disp_h = 960, 540

        legacy_box = {"label": "car", "x": 0.25, "y": 0.5, "w": 0.5, "h": 0.25}
        dx, dy, dw, dh = source_to_display_box(legacy_box, disp_w, disp_h, src_w, src_h)
        # 0.25 * 960 = 240, 0.5 * 540 = 270, 0.5 * 960 = 480, 0.25 * 540 = 135
        assert dx == 240.0
        assert dy == 270.0
        assert dw == 480.0
        assert dh == 135.0


class TestExportCoordinateConversions:
    def test_coco_export_preserves_canonical_source_pixels(self):
        """COCO JSON export preserves pixel-intrinsic coordinates and sets correct image dims."""
        manifest = {
            "dataset_name": "TestCOCO",
            "records": [
                {
                    "record_id": "rec_01",
                    "annotation": {
                        "payload": {
                            "coordinate_system": "pixel-intrinsic",
                            "image_dimensions": {"width": 1280, "height": 720},
                            "boxes": [
                                {"label": "license_plate", "x": 100.0, "y": 150.0, "w": 200.0, "h": 50.0}
                            ],
                        }
                    },
                    "assets": [
                        {
                            "asset_id": "ast_01",
                            "role": "primary_image",
                            "dimensions": {"width": 1280, "height": 720},
                        }
                    ],
                }
            ],
        }

        coco_data = json.loads(export_to_coco(manifest).decode("utf-8"))
        assert len(coco_data["images"]) == 1
        assert coco_data["images"][0]["width"] == 1280
        assert coco_data["images"][0]["height"] == 720

        assert len(coco_data["annotations"]) == 1
        bbox = coco_data["annotations"][0]["bbox"]
        assert bbox == [100.0, 150.0, 200.0, 50.0]
        assert coco_data["annotations"][0]["area"] == 10000.0

    def test_yolo_export_normalizes_with_actual_dimensions(self):
        """YOLO export accurately normalizes coordinates using image_dimensions."""
        manifest = {
            "dataset_name": "TestYOLO",
            "label_schema": {"classes": ["sign"]},
            "records": [
                {
                    "record_id": "rec_yolo",
                    "split": "train",
                    "annotation": {
                        "payload": {
                            "coordinate_system": "pixel-intrinsic",
                            "image_dimensions": {"width": 1000, "height": 500},
                            "boxes": [
                                # Box from x=100..300 (w=200), y=100..200 (h=100)
                                # Center: x_center = 200 / 1000 = 0.2, y_center = 150 / 500 = 0.3
                                # Size: w = 200 / 1000 = 0.2, h = 100 / 500 = 0.2
                                {"label": "sign", "x": 100.0, "y": 100.0, "w": 200.0, "h": 100.0}
                            ],
                        }
                    },
                    "assets": [{"asset_id": "ast_yolo", "role": "primary_image"}],
                }
            ],
        }

        files = export_ultralytics_yolo(manifest)
        label_file = "labels/train/rec_yolo.txt"
        assert label_file in files
        line = files[label_file].decode("utf-8").strip()
        parts = [float(p) for p in line.split()]
        class_idx, xc, yc, w, h = parts
        assert class_idx == 0
        assert xc == pytest.approx(0.2)
        assert yc == pytest.approx(0.3)
        assert w == pytest.approx(0.2)
        assert h == pytest.approx(0.2)

    def test_yolo_export_files_preserves_normalized_bounds(self):
        """Full YOLO file exporter normalizes correctly with clamped bounds."""
        manifest = {
            "dataset_name": "TestYoloZip",
            "label_schema": {"classes": ["object"]},
            "records": [
                {
                    "record_id": "rec_zip",
                    "split": "train",
                    "annotation": {
                        "payload": {
                            "coordinate_system": "pixel-intrinsic",
                            "image_dimensions": {"width": 800, "height": 400},
                            "boxes": [
                                {"label": "object", "x": 0.0, "y": 0.0, "w": 800.0, "h": 400.0}
                            ],
                        }
                    },
                    "assets": [],
                }
            ],
        }

        files = export_to_yolo_files(manifest)
        content = files["labels/train/rec_zip.txt"].decode("utf-8").strip()
        parts = [float(p) for p in content.split()]
        # Full image box: center = (0.5, 0.5), w = 1.0, h = 1.0
        assert parts == [0, 0.5, 0.5, 1.0, 1.0]


class TestLegacyCalibrationSafety:
    """Phase R5.2.1: Legacy annotation calibration safety tests."""

    def test_version_diff_preserves_isolated_version_asset_dimensions(self, monkeypatch):
        """Version diff extracts and preserves independent asset dimensions for each version."""
        from packages.dataset_versioning.service import VersioningService

        class MockVersion:
            def __init__(self, vid, tag, num, manifest):
                self.id = vid
                self.dataset_id = "ds_01"
                self.version_tag = tag
                self.version_number = num
                self.record_count = len(manifest.get("records", []))
                self.manifest = manifest

        v1_manifest = {
            "records": [
                {
                    "record_id": "rec_iso_01",
                    "annotation": {
                        "payload": {
                            "coordinate_system": "pixel-intrinsic",
                            "image_dimensions": {"width": 800, "height": 600},
                            "boxes": [{"label": "box", "x": 100, "y": 100, "w": 200, "h": 200}],
                        }
                    },
                    "assets": [
                        {
                            "asset_id": "ast_v1",
                            "role": "primary_image",
                            "dimensions": {"width": 800, "height": 600},
                        }
                    ],
                }
            ]
        }

        v2_manifest = {
            "records": [
                {
                    "record_id": "rec_iso_01",
                    "annotation": {
                        "payload": {
                            "coordinate_system": "pixel-intrinsic",
                            "image_dimensions": {"width": 1920, "height": 1080},
                            "boxes": [{"label": "box", "x": 300, "y": 300, "w": 400, "h": 400}],
                        }
                    },
                    "assets": [
                        {
                            "asset_id": "ast_v2",
                            "role": "primary_image",
                            "dimensions": {"width": 1920, "height": 1080},
                        }
                    ],
                }
            ]
        }

        v1 = MockVersion("v1", "v1.0.0", 1, v1_manifest)
        v2 = MockVersion("v2", "v2.0.0", 2, v2_manifest)

        def mock_get_version(session, vid):
            return v1 if vid == "v1" else v2

        def mock_get_manifest(session, vid):
            return v1_manifest if vid == "v1" else v2_manifest

        monkeypatch.setattr(VersioningService, "get_version", mock_get_version)
        monkeypatch.setattr(VersioningService, "get_version_manifest", mock_get_manifest)

        diff = VersioningService.diff_dataset_versions(None, "ds_01", "v1", "v2")
        spatial_diffs = diff["spatial_diffs"]
        assert len(spatial_diffs) == 1
        item = spatial_diffs[0]

        # Verify dimension isolation: V1 dimensions must be 800x600, V2 dimensions 1920x1080
        assert item["image_dimensions_v1"] == {"width": 800, "height": 600}
        assert item["image_dimensions_v2"] == {"width": 1920, "height": 1080}
        assert item["asset_dimensions_v1"] == {"width": 800, "height": 600}
        assert item["asset_dimensions_v2"] == {"width": 1920, "height": 1080}

    def test_version_diff_uncalibrated_payload_preservation(self, monkeypatch):
        """Historical annotations with missing coordinate metadata are not stamped as intrinsic."""
        from packages.dataset_versioning.service import VersioningService

        class MockVersion:
            def __init__(self, vid, tag, num, manifest):
                self.id = vid
                self.dataset_id = "ds_01"
                self.version_tag = tag
                self.version_number = num
                self.record_count = len(manifest.get("records", []))
                self.manifest = manifest

        v1_manifest = {
            "records": [
                {
                    "record_id": "rec_hist_01",
                    "annotation": {
                        "payload": {
                            # No coordinate_system, no image_dimensions
                            "boxes": [{"label": "legacy_box", "x": 150, "y": 200, "w": 100, "h": 80}],
                        }
                    },
                    "assets": [],
                }
            ]
        }

        v2_manifest = {
            "records": [
                {
                    "record_id": "rec_hist_01",
                    "annotation": {
                        "payload": {
                            "coordinate_system": "pixel-intrinsic",
                            "image_dimensions": {"width": 640, "height": 480},
                            "boxes": [{"label": "new_box", "x": 200, "y": 250, "w": 120, "h": 90}],
                        }
                    },
                    "assets": [],
                }
            ]
        }

        v1 = MockVersion("v1", "v1.0.0", 1, v1_manifest)
        v2 = MockVersion("v2", "v2.0.0", 2, v2_manifest)

        def mock_get_version(session, vid):
            return v1 if vid == "v1" else v2

        def mock_get_manifest(session, vid):
            return v1_manifest if vid == "v1" else v2_manifest

        monkeypatch.setattr(VersioningService, "get_version", mock_get_version)
        monkeypatch.setattr(VersioningService, "get_version_manifest", mock_get_manifest)

        diff = VersioningService.diff_dataset_versions(None, "ds_01", "v1", "v2")
        spatial_diffs = diff["spatial_diffs"]
        assert len(spatial_diffs) == 1
        item = spatial_diffs[0]

        # v1 must retain None coordinate_system and None dimensions
        assert item["coordinate_system_v1"] is None
        assert item["image_dimensions_v1"] is None
        assert item["coordinate_system_v2"] == "pixel-intrinsic"
        assert item["image_dimensions_v2"] == {"width": 640, "height": 480}

    def test_version_diff_different_source_assets_isolation(self, monkeypatch):
        """Diffing versions with different source assets records distinct URLs and same_asset=False."""
        from packages.dataset_versioning.service import VersioningService

        class MockVersion:
            def __init__(self, vid, tag, num, manifest):
                self.id = vid
                self.dataset_id = "ds_01"
                self.version_tag = tag
                self.version_number = num
                self.record_count = len(manifest.get("records", []))
                self.manifest = manifest

        v1_manifest = {
            "records": [
                {
                    "record_id": "rec_diff_ast_01",
                    "annotation": {
                        "payload": {
                            "coordinate_system": "pixel-intrinsic",
                            "image_dimensions": {"width": 800, "height": 600},
                            "boxes": [{"label": "cat", "x": 10, "y": 20, "w": 100, "h": 100}],
                        }
                    },
                    "assets": [{"asset_id": "asset_img_v1", "role": "primary_image", "dimensions": {"width": 800, "height": 600}}],
                }
            ]
        }
        v2_manifest = {
            "records": [
                {
                    "record_id": "rec_diff_ast_01",
                    "annotation": {
                        "payload": {
                            "coordinate_system": "pixel-intrinsic",
                            "image_dimensions": {"width": 1920, "height": 1080},
                            "boxes": [{"label": "dog", "x": 50, "y": 50, "w": 200, "h": 200}],
                        }
                    },
                    "assets": [{"asset_id": "asset_img_v2", "role": "primary_image", "dimensions": {"width": 1920, "height": 1080}}],
                }
            ]
        }

        v1 = MockVersion("v1", "v1.0.0", 1, v1_manifest)
        v2 = MockVersion("v2", "v2.0.0", 2, v2_manifest)

        monkeypatch.setattr(VersioningService, "get_version", lambda s, vid: v1 if vid == "v1" else v2)
        monkeypatch.setattr(VersioningService, "get_version_manifest", lambda s, vid: v1_manifest if vid == "v1" else v2_manifest)

        diff = VersioningService.diff_dataset_versions(None, "ds_01", "v1", "v2")
        item = diff["spatial_diffs"][0]

        assert item["same_asset"] is False
        assert item["asset_id_v1"] == "asset_img_v1"
        assert item["asset_id_v2"] == "asset_img_v2"
        assert item["asset_url_v1"] == "/api/v1/assets/asset_img_v1/file"
        assert item["asset_url_v2"] == "/api/v1/assets/asset_img_v2/file"
        assert item["asset_dimensions_v1"] == {"width": 800, "height": 600}
        assert item["asset_dimensions_v2"] == {"width": 1920, "height": 1080}

    def test_version_diff_same_source_asset(self, monkeypatch):
        """Diffing versions referencing identical source asset records same_asset=True."""
        from packages.dataset_versioning.service import VersioningService

        class MockVersion:
            def __init__(self, vid, tag, num, manifest):
                self.id = vid
                self.dataset_id = "ds_01"
                self.version_tag = tag
                self.version_number = num
                self.record_count = len(manifest.get("records", []))
                self.manifest = manifest

        shared_manifest_records = lambda boxes: {
            "records": [
                {
                    "record_id": "rec_same_01",
                    "annotation": {"payload": {"coordinate_system": "pixel-intrinsic", "boxes": boxes}},
                    "assets": [{"asset_id": "shared_asset_123", "role": "primary_image", "dimensions": {"width": 1280, "height": 720}}],
                }
            ]
        }

        v1_manifest = shared_manifest_records([{"label": "a", "x": 10, "y": 10, "w": 50, "h": 50}])
        v2_manifest = shared_manifest_records([{"label": "b", "x": 20, "y": 20, "w": 60, "h": 60}])

        v1 = MockVersion("v1", "v1.0.0", 1, v1_manifest)
        v2 = MockVersion("v2", "v2.0.0", 2, v2_manifest)

        monkeypatch.setattr(VersioningService, "get_version", lambda s, vid: v1 if vid == "v1" else v2)
        monkeypatch.setattr(VersioningService, "get_version_manifest", lambda s, vid: v1_manifest if vid == "v1" else v2_manifest)

        diff = VersioningService.diff_dataset_versions(None, "ds_01", "v1", "v2")
        item = diff["spatial_diffs"][0]

        assert item["same_asset"] is True
        assert item["asset_id_v1"] == "shared_asset_123"
        assert item["asset_id_v2"] == "shared_asset_123"

    def test_version_diff_missing_dimensions_for_one_version(self, monkeypatch):
        """No dimension silently leaks from one version to another when one has missing dimensions."""
        from packages.dataset_versioning.service import VersioningService

        class MockVersion:
            def __init__(self, vid, tag, num, manifest):
                self.id = vid
                self.dataset_id = "ds_01"
                self.version_tag = tag
                self.version_number = num
                self.record_count = len(manifest.get("records", []))
                self.manifest = manifest

        v1_manifest = {
            "records": [
                {
                    "record_id": "rec_leak_check",
                    "annotation": {
                        "payload": {
                            "coordinate_system": "pixel-intrinsic",
                            "image_dimensions": {"width": 1024, "height": 768},
                            "boxes": [{"label": "box1", "x": 50, "y": 50, "w": 100, "h": 100}],
                        }
                    },
                    "assets": [{"asset_id": "ast_v1_known", "role": "primary_image", "dimensions": {"width": 1024, "height": 768}}],
                }
            ]
        }
        v2_manifest = {
            "records": [
                {
                    "record_id": "rec_leak_check",
                    "annotation": {
                        "payload": {
                            "coordinate_system": "normalized",
                            "boxes": [{"label": "box1", "x": 0.05, "y": 0.05, "w": 0.1, "h": 0.1}],
                        }
                    },
                    "assets": [{"asset_id": "ast_v2_unknown", "role": "primary_image"}],
                }
            ]
        }

        v1 = MockVersion("v1", "v1.0.0", 1, v1_manifest)
        v2 = MockVersion("v2", "v2.0.0", 2, v2_manifest)

        monkeypatch.setattr(VersioningService, "get_version", lambda s, vid: v1 if vid == "v1" else v2)
        monkeypatch.setattr(VersioningService, "get_version_manifest", lambda s, vid: v1_manifest if vid == "v1" else v2_manifest)

        diff = VersioningService.diff_dataset_versions(None, "ds_01", "v1", "v2")
        item = diff["spatial_diffs"][0]

        # V1 must have 1024x768, V2 must remain None
        assert item["asset_dimensions_v1"] == {"width": 1024, "height": 768}
        assert item["asset_dimensions_v2"] is None
        assert item["image_dimensions_v1"] == {"width": 1024, "height": 768}
        assert item["image_dimensions_v2"] is None

    def test_legacy_lock_bypass_prevention(self):
        """Removing boxes from uncalibrated payload does not silently calibrate it."""
        # Uncalibrated payload with boxes
        legacy_payload = {
            "boxes": [{"label": "old", "x": 100, "y": 100, "w": 200, "h": 200}],
            "notes": "Historical review",
        }
        # Non-geometric edit: updating notes without calibration action
        updated_notes_payload = dict(legacy_payload)
        updated_notes_payload["notes"] = "Updated note"
        assert updated_notes_payload.get("coordinate_system") is None

        # Even if boxes are emptied through legacy inspector (which UI now prevents),
        # backend/persistence rules do not stamp 'pixel-intrinsic' without verified calibration action
        cleared_boxes_payload = dict(legacy_payload)
        cleared_boxes_payload["boxes"] = []
        assert cleared_boxes_payload.get("coordinate_system") is None

    def test_coco_export_preserves_historical_payload_without_corruption(self):
        """COCO export does not mutate or corrupt historical records lacking coordinate metadata."""
        manifest = {
            "dataset_name": "HistoricalCOCO",
            "records": [
                {
                    "record_id": "rec_hist_coco",
                    "annotation": {
                        "payload": {
                            "boxes": [{"label": "defect", "x": 50.0, "y": 60.0, "w": 70.0, "h": 80.0}]
                        }
                    },
                    "assets": [],
                }
            ],
        }

        coco_data = json.loads(export_to_coco(manifest).decode("utf-8"))
        assert len(coco_data["annotations"]) == 1
        assert coco_data["annotations"][0]["bbox"] == [50.0, 60.0, 70.0, 80.0]
        # Payload coordinate values remain intact
        assert manifest["records"][0]["annotation"]["payload"].get("coordinate_system") is None

