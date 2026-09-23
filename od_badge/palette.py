"""The BWRY (black / white / red / yellow) colour palette used by the panel.

The OpenDisplay 2.9" tag is a 4-colour e-paper panel. Every pixel the badge
renderer produces must land on exactly one of these four RGB triples so that
uploading with ``--dither-mode none`` reproduces the design faithfully.
"""

from __future__ import annotations

RGB = tuple[int, int, int]

BLACK: RGB = (0, 0, 0)
WHITE: RGB = (255, 255, 255)
RED: RGB = (255, 0, 0)
YELLOW: RGB = (255, 255, 0)

BWRY: list[RGB] = [BLACK, WHITE, RED, YELLOW]


def nearest(color: RGB) -> RGB:
    """Snap an arbitrary RGB colour to the closest of the four BWRY colours.

    Uses squared Euclidean distance in RGB space, which is sufficient here
    because the source colours (brand cyan and near-white) are always closer
    to one particular palette entry than any other.
    """
    r, g, b = color
    return min(BWRY, key=lambda c: (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2)
