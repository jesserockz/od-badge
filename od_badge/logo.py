"""Rasterize the ESPHome logo mark for the badge's brand band.

The source is the ESPHome docs SVG logo, bundled into this package's own
``assets`` directory (never read from an external checkout at run time). The
pipeline:

1. Recolour the two fill colours in the SVG source (brand cyan house body,
   near-white glyph) to whatever two colours the caller wants.
2. Rasterize with ``rsvg-convert`` at 4x the requested size, then downsample
   with a high quality filter.
3. Snap every non-transparent pixel to the nearest exact BWRY palette colour
   so the result has no antialiasing artefacts left over from the downsample.

Results are cached per (body, glyph, size) since the badge is rendered
repeatedly (auto-fit re-render, preview scaling) with the same logo colours.
"""

from __future__ import annotations

import functools
import importlib.resources
import os
import subprocess
import tempfile

from PIL import Image

from od_badge.palette import nearest

SOURCE_BODY_COLOR = "#18BCF2"
SOURCE_GLYPH_COLOR = "#F2F4F9"

SUPERSAMPLE_FACTOR = 4
ALPHA_THRESHOLD = 128


def _asset_svg_text() -> str:
    """Read the bundled ESPHome logo SVG source."""
    ref = importlib.resources.files("od_badge").joinpath("assets", "logo.svg")
    return ref.read_text(encoding="utf-8")


def _rasterize(svg_source: str, pixel_size: int) -> Image.Image:
    """Render SVG text to a supersampled, then downsampled, RGBA image."""
    render_size = pixel_size * SUPERSAMPLE_FACTOR
    with tempfile.TemporaryDirectory() as tmp_dir:
        svg_path = os.path.join(tmp_dir, "logo.svg")
        png_path = os.path.join(tmp_dir, "logo.png")
        with open(svg_path, "w", encoding="utf-8") as svg_file:
            svg_file.write(svg_source)
        subprocess.run(
            [
                "rsvg-convert",
                "-w",
                str(render_size),
                "-h",
                str(render_size),
                "-b",
                "none",
                svg_path,
                "-o",
                png_path,
            ],
            check=True,
        )
        with Image.open(png_path) as raw:
            rendered = raw.convert("RGBA")
            resized = rendered.resize((pixel_size, pixel_size), Image.LANCZOS)
    return resized


def _snap_to_palette(image: Image.Image) -> Image.Image:
    """Snap every opaque pixel to the nearest BWRY colour in place."""
    pixels = image.load()
    width, height = image.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a < ALPHA_THRESHOLD:
                pixels[x, y] = (0, 0, 0, 0)
                continue
            snapped = nearest((r, g, b))
            pixels[x, y] = (*snapped, 255)
    return image


@functools.lru_cache(maxsize=None)
def render_logo(body_color: str, glyph_color: str, size: int) -> Image.Image:
    """Render the ESPHome logo mark at ``size`` x ``size``, recoloured and palette-snapped.

    Cached by (body_color, glyph_color, size) since the badge renderer calls
    this repeatedly with the same arguments.
    """
    source = _asset_svg_text().replace(SOURCE_BODY_COLOR, body_color).replace(SOURCE_GLYPH_COLOR, glyph_color)
    image = _rasterize(source, size)
    return _snap_to_palette(image)


def clear_cache() -> None:
    """Clear the logo render cache. Mainly useful for tests."""
    render_logo.cache_clear()
