"""Where the tag's NFC antenna lands on the badge, per rotation.

The antenna sits at a fixed physical spot: the middle of the panel
framebuffer's bottom edge. Because the badge is rotated onto the panel, that
spot appears on a different edge of the badge depending on how it is turned,
so the "tap here" mark has to move with it.

The edge is derived from the rotation transform rather than hardcoded, so it
stays correct if a rotation is ever added or changed. The webapp mirrors this
in webapp/src/pure/nfc-placement.js.
"""

from __future__ import annotations

from typing import Literal

PANEL_WIDTH = 168
PANEL_HEIGHT = 384

Edge = Literal["left", "right", "top", "bottom"]
Orientation = Literal["landscape", "portrait"]
RotationChoice = Literal["cw", "ccw"]

#: Antenna position in panel framebuffer coordinates: centre of the bottom edge.
ANTENNA_PANEL_X = PANEL_WIDTH / 2
ANTENNA_PANEL_Y = PANEL_HEIGHT

_ROTATION_DEGREES: dict[tuple[str, str], int] = {
    ("landscape", "ccw"): 270,
    ("landscape", "cw"): 90,
    ("portrait", "ccw"): 0,
    ("portrait", "cw"): 180,
}


def rotation_degrees(orientation: Orientation, rotation: RotationChoice) -> int:
    """Return the clockwise rotation applied to place the badge on the panel."""
    try:
        return _ROTATION_DEGREES[(orientation, rotation)]
    except KeyError:
        raise ValueError(f"invalid orientation/rotation: {orientation!r}/{rotation!r}") from None


def panel_from_badge(
    badge_x: float,
    badge_y: float,
    badge_width: int,
    badge_height: int,
    degrees: int,
) -> tuple[float, float]:
    """Map a badge coordinate to its panel framebuffer coordinate.

    Mirrors the rotation applied when the rendered badge is placed on the
    panel. A quarter turn swaps the output dimensions.
    """
    if degrees == 0:
        return badge_x, badge_y
    if degrees == 180:
        return badge_width - badge_x, badge_height - badge_y
    if degrees == 90:
        return badge_height - badge_y, badge_x
    if degrees == 270:
        return badge_y, badge_width - badge_x
    raise ValueError(f"invalid rotation {degrees}, expected 0, 90, 180 or 270")


def antenna_edge(
    orientation: Orientation,
    rotation: RotationChoice,
    badge_width: int,
    badge_height: int,
) -> Edge:
    """Return which edge of the badge the NFC antenna sits against.

    Found by searching badge coordinates for the point that maps closest to
    the antenna, then reporting which edge that point lies on. Derived rather
    than tabulated so it cannot silently disagree with the rotation transform.
    """
    degrees = rotation_degrees(orientation, rotation)
    best: tuple[float, float] | None = None
    best_distance = float("inf")
    for badge_x in range(0, badge_width + 1, 2):
        for badge_y in range(0, badge_height + 1, 2):
            panel_x, panel_y = panel_from_badge(badge_x, badge_y, badge_width, badge_height, degrees)
            distance = (panel_x - ANTENNA_PANEL_X) ** 2 + (panel_y - ANTENNA_PANEL_Y) ** 2
            if distance < best_distance:
                best_distance = distance
                best = (badge_x, badge_y)
    assert best is not None  # the loops always run: both dimensions are positive
    badge_x, badge_y = best
    if badge_x <= badge_width * 0.02:
        return "left"
    if badge_x >= badge_width * 0.98:
        return "right"
    if badge_y <= badge_height * 0.02:
        return "top"
    return "bottom"
