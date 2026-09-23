"""Badge layout: canvas constants, text fitting, element building and rendering.

The visual design is final and approved - every coordinate, colour, font and
size here matches the prototype byte-for-byte. This module only restructures
the prototype into reusable, configurable, testable pieces; it does not
change the layout.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import numpy
import qrcode
from odl_renderer import generate_image
from odl_renderer.fonts import FontManager
from PIL import Image

from od_badge.logo import render_logo
from od_badge.nfc_placement import Edge

#: The antenna's y position on a landscape badge (its left/right edge midpoint).
ANTENNA_BADGE_Y = 84
from od_badge.palette import RED as RED_RGB
from od_badge.palette import YELLOW as YELLOW_RGB

CANVAS_WIDTH = 384
CANVAS_HEIGHT = 168

PANEL_WIDTH = 168
PANEL_HEIGHT = 384

DEFAULT_HANDLE = ""
DEFAULT_NAME = ""
DEFAULT_QR_URL = ""
DEFAULT_WORDMARK = "ESPHOME"
DOMAIN_TEXT = "esphome.io"
# Yellow on the panel. Reads correctly only with the red/yellow ink
# compensation applied at upload time (see swap_red_yellow).
DOMAIN_COLOR = "yellow"

QR_BOX_SIZE = 3
QR_BORDER = 1

HERO_FONT_START_SIZE = 50
HERO_FONT_MIN_SIZE = 8

# Width reserved on the antenna side for the tap mark.
MARK_STRIP = 28
CONTENT_X = 6
HERO_Y = 92
UNDERLINE_Y_START = 118
UNDERLINE_Y_END = 121
NAME_Y = 145

# Brand mark in the 44px header band. Sized to leave a 3px margin top and
# bottom; the wordmark starts clear of it.
LOGO_X = 8
LOGO_Y = 3
LOGO_SIZE = 38
WORDMARK_X = 54

# Contactless "tap here" mark, drawn as concentric arcs opening to the right.
# Sits immediately left of the QR code so the two read as a pair: scan it or
# tap it. Deliberately not the NFC Forum N-Mark, which is a trademark with
# its own licensing terms.
NFC_MARK_RADII: tuple[int, ...] = (4, 9, 14)
NFC_MARK_WIDTH = 2
#: Arc sweep, centred on the direction the wave opens.
NFC_MARK_SWEEP = 96
#: Direction the wave opens, per antenna edge (degrees, 0 = right).
NFC_MARK_DIRECTION: dict[str, int] = {"right": 0, "left": 180, "top": 270, "bottom": 90}

Rotation = Literal["cw", "ccw"]
_ROTATION_ANGLES: dict[str, int] = {"cw": -90, "ccw": 90}

_font_manager = FontManager()


@dataclass(frozen=True)
class BadgeContent:
    """The configurable text and data that goes into a badge render."""

    handle: str = DEFAULT_HANDLE
    name: str = DEFAULT_NAME
    qr_url: str = DEFAULT_QR_URL
    wordmark: str = DEFAULT_WORDMARK


def text_width(value: str, font: str, size: int) -> int:
    """Return the pixel width of ``value`` rendered in ``font`` at ``size``."""
    bbox = _font_manager.get_font(font, size).getbbox(value)
    return int(bbox[2] - bbox[0])


def fit_size(value: str, font: str, max_width: int, start_size: int) -> int:
    """Shrink a font size from ``start_size`` until ``value`` fits ``max_width``.

    Never goes below ``HERO_FONT_MIN_SIZE``.
    """
    size = start_size
    while size > HERO_FONT_MIN_SIZE and text_width(value, font, size) > max_width:
        size -= 1
    return size


def qr_pixel_size(data: str, box_size: int, border: int) -> int:
    """Return the rendered pixel size (square) of a QR code for ``data``."""
    qr = qrcode.QRCode(
        box_size=box_size,
        border=border,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
    )
    qr.add_data(data)
    qr.make(fit=True)
    return int(qr.make_image().size[0])


def build_elements(
    content: BadgeContent | None = None,
    mark_edge: Edge = "left",
) -> list[dict[str, Any]]:
    """Build the odl_renderer element list for the landscape badge.

    ``mark_edge`` is the badge edge the NFC antenna sits against (see
    nfc_placement.antenna_edge). A strip is reserved on that side for the tap
    mark: the content shifts right when it is on the left, and the QR shifts
    left when it is on the right, so the mark never sits on top of anything.

    Re-runs the hero-text auto-fit for whatever handle is supplied.
    """
    content = content or BadgeContent()

    qr_size = qr_pixel_size(content.qr_url, QR_BOX_SIZE, QR_BORDER)
    content_x = CONTENT_X + (MARK_STRIP if mark_edge == "left" else 0)
    qr_x = CANVAS_WIDTH - qr_size - 8 - (MARK_STRIP if mark_edge == "right" else 0)
    qr_y = 54
    available_width = qr_x - content_x - 14
    hero_size = fit_size(content.handle, "ppb", available_width, HERO_FONT_START_SIZE)
    mark_center_x = (
        CONTENT_X + MARK_STRIP // 2 if mark_edge == "left" else CANVAS_WIDTH - MARK_STRIP // 2
    )
    mark_center_y = ANTENNA_BADGE_Y
    direction = NFC_MARK_DIRECTION[mark_edge]

    return [
        # brand band
        {
            "type": "rectangle",
            "x_start": 0,
            "y_start": 0,
            "x_end": CANVAS_WIDTH,
            "y_end": 44,
            "fill": "black",
            "outline": "black",
        },
        {
            "type": "dlimg",
            "url": render_logo("#FFFFFF", "#000000", LOGO_SIZE),
            "x": LOGO_X,
            "y": LOGO_Y,
            "xsize": LOGO_SIZE,
            "ysize": LOGO_SIZE,
        },
        {
            "type": "text",
            "value": content.wordmark,
            "x": WORDMARK_X,
            "y": 22,
            "font": "ppb",
            "size": 22,
            "color": "white",
            "anchor": "lm",
        },
        {
            "type": "text",
            "value": DOMAIN_TEXT,
            "x": 376,
            "y": 23,
            "font": "rbm",
            "size": 13,
            "color": DOMAIN_COLOR,
            "anchor": "rm",
        },
        {
            "type": "rectangle",
            "x_start": 0,
            "y_start": 44,
            "x_end": CANVAS_WIDTH,
            "y_end": 50,
            "fill": "red",
            "outline": "red",
        },
        # hero
        {
            "type": "text",
            "value": content.handle,
            "x": content_x,
            "y": HERO_Y,
            "font": "ppb",
            "size": hero_size,
            "color": "black",
            "anchor": "lm",
        },
        # name
        {
            "type": "rectangle",
            "x_start": content_x,
            "y_start": UNDERLINE_Y_START,
            "x_end": content_x + text_width(content.handle, "ppb", hero_size) - 6,
            "y_end": UNDERLINE_Y_END,
            "fill": "black",
            "outline": "black",
        },
        {
            "type": "text",
            "value": content.name,
            "x": content_x,
            "y": NAME_Y,
            "font": "ppb",
            "size": 26,
            "color": "red",
            "anchor": "lm",
        },
        # contactless tap mark
        *[
            {
                "type": "arc",
                "x": mark_center_x,
                "y": mark_center_y,
                "radius": radius,
                "start_angle": direction - NFC_MARK_SWEEP // 2,
                "end_angle": direction + NFC_MARK_SWEEP // 2,
                "outline": "black",
                "width": NFC_MARK_WIDTH,
            }
            for radius in NFC_MARK_RADII
        ],
        # qr
        {
            "type": "qrcode",
            "data": content.qr_url,
            "x": qr_x,
            "y": qr_y,
            "boxsize": QR_BOX_SIZE,
            "border": QR_BORDER,
        },
    ]


async def render_badge(
    content: BadgeContent | None = None,
    mark_edge: Edge = "left",
) -> Image.Image:
    """Render the landscape 384x168 badge as an RGB image."""
    content = content or BadgeContent()
    image = await generate_image(
        width=CANVAS_WIDTH,
        height=CANVAS_HEIGHT,
        elements=build_elements(content, mark_edge),
        background="white",
    )
    return image.convert("RGB")


def rotate_to_panel(image: Image.Image, rotation: Rotation) -> Image.Image:
    """Rotate a landscape 384x168 badge onto the 168x384 portrait panel.

    ``rotation`` is "cw" or "ccw" - the direction the badge is turned to
    become portrait.
    """
    if rotation not in _ROTATION_ANGLES:
        raise ValueError(f"invalid rotation {rotation!r}, expected 'cw' or 'ccw'")
    angle = _ROTATION_ANGLES[rotation]
    rotated = image.rotate(angle, expand=True)
    if rotated.size != (PANEL_WIDTH, PANEL_HEIGHT):
        raise ValueError(f"unexpected panel size {rotated.size}, expected {(PANEL_WIDTH, PANEL_HEIGHT)}")
    return rotated


def swap_red_yellow(image: Image.Image) -> Image.Image:
    """Return ``image`` with every red pixel yellow and every yellow pixel red.

    This compensates for a red/yellow inversion on panel 0x001E (EP29YR
    168x384). py-opendisplay's ``_BWRY_CODES_BY_PANEL`` lists 0x001E as
    needing yellow and red swapped on the wire, so its encoder emits yellow
    as nibble 3 and red as nibble 2. On this unit that swap is wrong, and the
    panel shows red where the design says yellow and vice versa.

    Pre-swapping the two inks here cancels the encoder's swap, so the design
    can keep naming colours truthfully. If py-opendisplay drops 0x001E from
    that table, this compensation must be turned off or the colours invert
    again - hence the CLI flag rather than a silent fixed behaviour.
    """
    pixels = numpy.array(image.convert("RGB"))
    is_red = numpy.all(pixels == RED_RGB, axis=-1)
    is_yellow = numpy.all(pixels == YELLOW_RGB, axis=-1)
    pixels[is_red] = YELLOW_RGB
    pixels[is_yellow] = RED_RGB
    return Image.fromarray(pixels, mode="RGB")
