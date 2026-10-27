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
