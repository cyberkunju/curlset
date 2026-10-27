from packages.dataset_io.spatial_augment import (
    transform_bbox_geometry,
    transform_box_coordinates,
)


def test_transform_box_coordinates_hflip():
    # Box at x=100, y=50, w=200, h=150 on an 800x600 image
    # hflip: new_x = 800 - 100 - 200 = 500, new_y = 50
    box = {"x": 100, "y": 50, "w": 200, "h": 150, "label": "cat"}
    transformed, new_w, new_h = transform_box_coordinates(
        box, image_width=800, image_height=600, transform_type="hflip"
    )
    assert transformed is not None
    assert transformed["x"] == 500
    assert transformed["y"] == 50
    assert transformed["w"] == 200
    assert transformed["h"] == 150
    assert new_w == 800
    assert new_h == 600


def test_transform_box_coordinates_vflip():
    # vflip: new_x = 100, new_y = 600 - 50 - 150 = 400
    box = {"x": 100, "y": 50, "w": 200, "h": 150, "label": "cat"}
    transformed, _new_w, _new_h = transform_box_coordinates(
        box, image_width=800, image_height=600, transform_type="vflip"
    )
    assert transformed is not None
    assert transformed["x"] == 100
    assert transformed["y"] == 400
    assert transformed["w"] == 200
    assert transformed["h"] == 150


def test_transform_box_coordinates_rot90_cw():
    # rot90_cw on 800x600 -> swaps to 600x800
    # new_x = 600 - 50 - 150 = 400, new_y = 100, new_w = 150, new_h = 200
    box = {"x": 100, "y": 50, "w": 200, "h": 150, "label": "cat"}
    transformed, new_w, new_h = transform_box_coordinates(
        box, image_width=800, image_height=600, transform_type="rot90_cw"
    )
    assert transformed is not None
    assert new_w == 600
    assert new_h == 800
    assert transformed["x"] == 400
    assert transformed["y"] == 100
    assert transformed["w"] == 150
    assert transformed["h"] == 200


def test_transform_bbox_geometry_discards_degenerate():
    # Box with width=2px (< 5px) should be purged
    boxes = [
        {"x": 100, "y": 50, "w": 200, "h": 150, "label": "valid"},
        {"x": 10, "y": 10, "w": 2, "h": 20, "label": "degenerate"},
    ]
    transformed, _, _ = transform_bbox_geometry(
        boxes, image_width=800, image_height=600, transform_type="hflip", min_size_px=5
    )
    assert len(transformed) == 1
    assert transformed[0]["label"] == "valid"
