"""Bake the four built-in project brand marks into webapp/assets/brands/*.png.

Ports the recolour approach in od_badge/logo.py (recolour brand-cyan and
near-white source fills, rasterize with rsvg-convert, downsample with a high
quality filter) to four different sources, each with its own polarity:

- ESPHome, Home Assistant: source SVGs with a cyan icon body and a near-white
  inner glyph. Recoloured cyan -> white (icon body), near-white -> black
  (inner glyph), so the body reads white against the badge's black band and
  the glyph reads black (invisible against the same black band).
- Music Assistant: source PNG with a cyan background square and a near-white
  glyph. The same two colours are remapped the other way: cyan -> black
  (disappears into the badge's black band), near-white -> white (the glyph
  that actually shows).
- Open Home Foundation: source SVG is entirely near-white already (no cyan
  present). Recoloured straight to white; nothing needs to disappear.

Every mark is rendered onto a square canvas (contain-fit, centred) so a
non-square source (Open Home Foundation's icon crop) still drops cleanly into
the badge's fixed 34x34 logo slot.

Run from the opendisplay project root with the project's own uv-managed venv,
e.g.:

    uv run python webapp/tools/bake_brands.py

Requires ``rsvg-convert`` on PATH and Pillow in the active environment.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[2]
WEBAPP_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = WEBAPP_ROOT / "assets" / "brands"
PREVIEW_DIR = WEBAPP_ROOT / ".preview"

SOURCE_CYAN = "#18BCF2"
SOURCE_NEAR_WHITE = "#F2F4F9"

OUTPUT_SIZE = 256
SUPERSAMPLE_FACTOR = 4
BADGE_PREVIEW_SIZE = 34


def _rasterize_svg(svg_text: str, render_size: int) -> Image.Image:
    """Rasterize ``svg_text`` at ``render_size`` x ``render_size`` with rsvg-convert."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        svg_path = Path(tmp_dir) / "source.svg"
        png_path = Path(tmp_dir) / "source.png"
        svg_path.write_text(svg_text, encoding="utf-8")
        subprocess.run(
            [
                "rsvg-convert",
                "-w",
                str(render_size),
                "-h",
                str(render_size),
                "-b",
                "none",
                str(svg_path),
                "-o",
                str(png_path),
            ],
            check=True,
        )
        with Image.open(png_path) as raw:
            return raw.convert("RGBA").copy()


def _contain_on_square(image: Image.Image, size: int) -> Image.Image:
    """Fit ``image`` (preserving aspect ratio) centred onto a transparent size x size canvas."""
    width, height = image.size
    scale = min(size / width, size / height)
    new_width = max(1, round(width * scale))
    new_height = max(1, round(height * scale))
    resized = image.resize((new_width, new_height), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = ((size - new_width) // 2, (size - new_height) // 2)
    canvas.alpha_composite(resized, offset)
    return canvas


def _set_viewbox(svg_text: str, viewbox: str) -> str:
    """Crop the SVG to ``viewbox`` (e.g. "0 0 241 241").

    Replaces the root ``viewBox`` attribute AND the root ``width``/``height``
    attributes with the crop's own width/height. Leaving the original
    width/height in place (e.g. a 1705x241 wordmark cropped to a 241x241
    viewBox) makes rsvg-convert fit the *intrinsic* 1705x241 aspect ratio into
    the requested square output instead of the cropped one, squeezing the
    icon into a thin sliver and pulling in content past the crop boundary.
    """
    _, _, w_str, h_str = viewbox.split()
    patched = re.sub(r'viewBox="[^"]*"', f'viewBox="{viewbox}"', svg_text, count=1)
    patched = re.sub(r'width="[^"]*"', f'width="{w_str}"', patched, count=1)
    patched = re.sub(r'height="[^"]*"', f'height="{h_str}"', patched, count=1)
    return patched


def bake_svg_mark(
    svg_path: Path,
    *,
    body_target: str,
    glyph_target: str,
    viewbox: str | None = None,
) -> Image.Image:
    """Recolour and rasterize an SVG source into a square mark with alpha."""
    source = svg_path.read_text(encoding="utf-8")
    if viewbox is not None:
        source = _set_viewbox(source, viewbox)
    recoloured = source.replace(SOURCE_CYAN, body_target).replace(SOURCE_NEAR_WHITE, glyph_target)
    render_size = OUTPUT_SIZE * SUPERSAMPLE_FACTOR
    rendered = _rasterize_svg(recoloured, render_size)
    downsampled = rendered.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.LANCZOS)
    return _contain_on_square(downsampled, OUTPUT_SIZE)


def bake_raster_mark(png_path: Path, *, bg_target: tuple[int, int, int], fg_target: tuple[int, int, int]) -> Image.Image:
    """Remap a two-colour raster source (cyan background + near-white glyph).

    Each pixel is projected onto the line between the two known source
    colours (cyan and near-white) and linearly remapped onto the
    corresponding target colours. This keeps the source's own anti-aliased
    edges (rather than hard-thresholding to two flat colours), so the
    downsampled result still looks smooth at small sizes.
    """
    source = Image.open(png_path).convert("RGBA")
    cyan = _hex_to_rgb(SOURCE_CYAN)
    white = _hex_to_rgb(SOURCE_NEAR_WHITE)
    axis = tuple(w - c for w, c in zip(white, cyan))
    axis_len_sq = sum(a * a for a in axis) or 1
    pixels = source.load()
    width, height = source.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            vec = (r - cyan[0], g - cyan[1], b - cyan[2])
            t = sum(v * ax for v, ax in zip(vec, axis)) / axis_len_sq
            t = max(0.0, min(1.0, t))
            out = tuple(round(bg + t * (fg - bg)) for bg, fg in zip(bg_target, fg_target))
            pixels[x, y] = (*out, a)
    resized = source.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.LANCZOS)
    return _contain_on_square(resized, OUTPUT_SIZE)


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


@dataclass(frozen=True)
class Brand:
    """One built-in project's brand mark bake job."""

    slug: str
    build: Callable[[], Image.Image]


def build_esphome() -> Image.Image:
    svg_path = REPO_ROOT / "od_badge" / "assets" / "logo.svg"
    return bake_svg_mark(svg_path, body_target="#FFFFFF", glyph_target="#000000")


def build_home_assistant() -> Image.Image:
    svg_path = Path("/path/to/home-assistant/home-assistant.io/source/images/home-assistant-logo.svg")
    # Full wordmark viewBox is "0 0 1705 241"; the icon is the leading square.
    return bake_svg_mark(svg_path, body_target="#FFFFFF", glyph_target="#000000", viewbox="0 0 241 241")


def build_music_assistant() -> Image.Image:
    png_path = Path("/path/to/music-assistant/server/music_assistant/logo.png")
    return bake_raster_mark(png_path, bg_target=(0, 0, 0), fg_target=(255, 255, 255))


def build_open_home_foundation() -> Image.Image:
    svg_path = Path(
        "/path/to/home-assistant/home-assistant.io/source/images/collaboration/open-home-foundation.svg"
    )
    # Original viewBox is "0 0 81 18" (icon + two-line wordmark). The icon
    # itself (two stacked bracket/roof shapes) is bounded within roughly
    # x:[0, 12.2241], y:[0, 17.9987] -- verified by inspecting the first two
    # <path> elements' coordinates. A naive "0 0 18 18" crop still pulls in
    # the start of the "O" from the wordmark; this tighter box does not.
    #
    # Every fill in this source is already the near-white brand colour (no
    # cyan present at all), so both target colours are white -- there is no
    # body/glyph split to preserve here, just "no cyan -> render white".
    return bake_svg_mark(svg_path, body_target="#FFFFFF", glyph_target="#FFFFFF", viewbox="0 0 12.2241 18")


BRANDS: list[Brand] = [
    Brand("esphome", build_esphome),
    Brand("home-assistant", build_home_assistant),
    Brand("music-assistant", build_music_assistant),
    Brand("open-home-foundation", build_open_home_foundation),
]


def build_contact_sheet(images: dict[str, Image.Image]) -> Image.Image:
    """Assemble a contact sheet showing each mark downscaled to badge size (34px)."""
    padding = 12
    cell = BADGE_PREVIEW_SIZE + padding * 2
    sheet = Image.new("RGBA", (cell * len(images), cell), (32, 32, 32, 255))
    black_row = Image.new("RGBA", (cell * len(images), cell), (0, 0, 0, 255))
    sheet.alpha_composite(black_row)
    for i, (slug, image) in enumerate(images.items()):
        thumb = image.resize((BADGE_PREVIEW_SIZE, BADGE_PREVIEW_SIZE), Image.LANCZOS)
        x = i * cell + padding
        y = padding
        sheet.alpha_composite(thumb, (x, y))
    return sheet.convert("RGB")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    baked: dict[str, Image.Image] = {}
    for brand in BRANDS:
        image = brand.build()
        out_path = OUTPUT_DIR / f"{brand.slug}.png"
        image.save(out_path)
        baked[brand.slug] = image
        print(f"baked {out_path} ({image.size[0]}x{image.size[1]})")

    contact_sheet = build_contact_sheet(baked)
    preview_path = PREVIEW_DIR / "brand-marks-34px.png"
    # Upscale the contact sheet 4x (nearest neighbour) so the 34px marks are
    # actually visible/inspectable in the saved preview image.
    upscaled = contact_sheet.resize((contact_sheet.width * 4, contact_sheet.height * 4), Image.NEAREST)
    upscaled.save(preview_path)
    print(f"wrote contact sheet {preview_path}")


if __name__ == "__main__":
    main()
