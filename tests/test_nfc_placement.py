from __future__ import annotations

import pytest

from od_badge.nfc_placement import (
    PANEL_HEIGHT,
    PANEL_WIDTH,
    antenna_edge,
    panel_from_badge,
    rotation_degrees,
)

LANDSCAPE = (384, 168)
PORTRAIT = (168, 384)


def test_rotation_degrees_for_every_combination() -> None:
    assert rotation_degrees("landscape", "ccw") == 270
    assert rotation_degrees("landscape", "cw") == 90
    assert rotation_degrees("portrait", "ccw") == 0
    assert rotation_degrees("portrait", "cw") == 180


def test_rotation_degrees_rejects_nonsense() -> None:
    with pytest.raises(ValueError, match="invalid orientation/rotation"):
        rotation_degrees("sideways", "cw")  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("orientation", "rotation", "size", "expected"),
    [
        ("landscape", "ccw", LANDSCAPE, "left"),
        ("landscape", "cw", LANDSCAPE, "right"),
        ("portrait", "ccw", PORTRAIT, "bottom"),
        ("portrait", "cw", PORTRAIT, "top"),
    ],
)
def test_antenna_edge_matches_the_hardware(
    orientation: str, rotation: str, size: tuple[int, int], expected: str
) -> None:
    """The two default cases here were confirmed on the real tag.

    Landscape default reads on the left, portrait default reads at the bottom.
    The other two fall out of the same derivation.
    """
    width, height = size
    assert antenna_edge(orientation, rotation, width, height) == expected  # type: ignore[arg-type]


def test_every_rotation_lands_on_the_panel_framebuffer() -> None:
    for orientation, size in (("landscape", LANDSCAPE), ("portrait", PORTRAIT)):
        width, height = size
        for rotation in ("cw", "ccw"):
            degrees = rotation_degrees(orientation, rotation)  # type: ignore[arg-type]
            corners = [
                panel_from_badge(x, y, width, height, degrees)
                for x, y in ((0, 0), (width, 0), (0, height), (width, height))
            ]
            xs = [c[0] for c in corners]
            ys = [c[1] for c in corners]
            assert max(xs) - min(xs) == PANEL_WIDTH
            assert max(ys) - min(ys) == PANEL_HEIGHT


def test_panel_from_badge_identity_and_half_turn() -> None:
    assert panel_from_badge(10, 20, 168, 384, 0) == (10, 20)
    assert panel_from_badge(10, 20, 168, 384, 180) == (158, 364)


def test_panel_from_badge_quarter_turns() -> None:
    assert panel_from_badge(10, 20, 384, 168, 90) == (148, 10)
    assert panel_from_badge(10, 20, 384, 168, 270) == (20, 374)


def test_panel_from_badge_rejects_an_unsupported_angle() -> None:
    with pytest.raises(ValueError, match="invalid rotation 45"):
        panel_from_badge(0, 0, 168, 384, 45)
