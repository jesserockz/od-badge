from __future__ import annotations

import pytest
from PIL import Image, ImageChops

from od_badge.badge import (
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    DEFAULT_HANDLE,
    HERO_FONT_MIN_SIZE,
    NFC_MARK_RADII,
    QR_BORDER,
    QR_BOX_SIZE,
    qr_pixel_size,
    PANEL_HEIGHT,
    PANEL_WIDTH,
    BadgeContent,
    build_elements,
    fit_size,
    qr_pixel_size,
    render_badge,
    rotate_to_panel,
    text_width,
)


def test_text_width_grows_with_string_length() -> None:
    short = text_width("A", "ppb", 20)
    long = text_width("A very long piece of text", "ppb", 20)
    assert short > 0
    assert long > short


def test_fit_size_no_shrink_needed() -> None:
    # A generous max width should not require shrinking below the start size.
    size = fit_size("hi", "ppb", 10_000, 50)
    assert size == 50


def test_fit_size_shrinks_to_fit() -> None:
    start = 50
    huge_width = text_width("@janedoe", "ppb", start)
    size = fit_size("@janedoe", "ppb", huge_width - 1, start)
    assert size < start
    assert text_width("@janedoe", "ppb", size) <= huge_width - 1


def test_fit_size_hits_lower_bound() -> None:
    # An impossibly narrow max width forces the loop all the way down to the floor.
    size = fit_size("@averyverylonghandleindeed", "ppb", 1, 50)
    assert size == HERO_FONT_MIN_SIZE


def test_qr_pixel_size_is_positive_and_square_multiple_of_box_size() -> None:
    size = qr_pixel_size("https://github.com/janedoe", 3, 1)
    assert size > 0
    assert size % 3 == 0


def test_build_elements_defaults_when_content_omitted() -> None:
    default_elements = build_elements()
    explicit_elements = build_elements(BadgeContent())
    assert default_elements == explicit_elements


def test_build_elements_reflects_custom_content() -> None:
    content = BadgeContent(handle="@someone", name="SOMEONE", qr_url="https://example.com")
    elements = build_elements(content)
    values = [el.get("value") for el in elements if el.get("type") == "text"]
    assert "@someone" in values
    assert "SOMEONE" in values
    qr_elements = [el for el in elements if el["type"] == "qrcode"]
    assert qr_elements[0]["data"] == "https://example.com"


def test_build_elements_long_handle_still_fits_before_the_qr_code() -> None:
    content = BadgeContent(handle="@averyverylonghandleindeed")
    elements = build_elements(content)
    hero = next(el for el in elements if el.get("value") == content.handle)
    qr = next(el for el in elements if el["type"] == "qrcode")
    hero_right_edge = hero["x"] + text_width(content.handle, hero["font"], hero["size"])
    assert hero_right_edge < qr["x"]


@pytest.mark.asyncio
async def test_render_badge_default_matches_explicit_default_content() -> None:
    default_image = await render_badge()
    explicit_image = await render_badge(BadgeContent())
    assert ImageChops.difference(default_image, explicit_image).getbbox() is None


@pytest.mark.asyncio
async def test_render_badge_is_correct_size_and_pure_bwry() -> None:
    image = await render_badge()
    assert image.size == (CANVAS_WIDTH, CANVAS_HEIGHT)
    assert image.mode == "RGB"
    from od_badge.palette import BWRY

    colors = image.getcolors(maxcolors=1 << 20)
    assert colors is not None
    for _count, color in colors:
        assert color in BWRY


@pytest.mark.asyncio
async def test_render_badge_with_custom_handle_renders_it() -> None:
    content = BadgeContent(handle="@zzz")
    image = await render_badge(content)
    assert image.size == (CANVAS_WIDTH, CANVAS_HEIGHT)


def test_rotate_to_panel_cw() -> None:
    image = Image.new("RGB", (CANVAS_WIDTH, CANVAS_HEIGHT), "white")
    rotated = rotate_to_panel(image, "cw")
    assert rotated.size == (PANEL_WIDTH, PANEL_HEIGHT)


def test_rotate_to_panel_ccw() -> None:
    image = Image.new("RGB", (CANVAS_WIDTH, CANVAS_HEIGHT), "white")
    rotated = rotate_to_panel(image, "ccw")
    assert rotated.size == (PANEL_WIDTH, PANEL_HEIGHT)


def test_rotate_to_panel_invalid_rotation_raises() -> None:
    image = Image.new("RGB", (CANVAS_WIDTH, CANVAS_HEIGHT), "white")
    with pytest.raises(ValueError, match="invalid rotation"):
        rotate_to_panel(image, "sideways")  # type: ignore[arg-type]


def test_rotate_to_panel_rejects_unexpected_result_size() -> None:
    # A non-badge-shaped image rotates to a size that is not the panel size,
    # which should be caught defensively rather than silently uploaded.
    square = Image.new("RGB", (50, 50), "white")
    with pytest.raises(ValueError, match="unexpected panel size"):
        rotate_to_panel(square, "cw")


def test_default_handle_constant() -> None:
    assert DEFAULT_HANDLE == "@janedoe"


# Allowed text colours per background, on the BWRY panel. Red on black and
# yellow on white are both too low contrast to read at badge size.
_ALLOWED_TEXT_COLOURS: dict[str, set[str]] = {
    "black": {"white", "yellow"},
    "white": {"black", "red"},
}


def _background_behind(elements: list[dict[str, object]], index: int) -> str:
    """Return the fill colour a text element sits on.

    Walks the elements drawn before it and returns the fill of the last
    filled rectangle spanning its y, falling back to the canvas white.
    """
    text = elements[index]
    y = text["y"]
    assert isinstance(y, int)
    background = "white"
    for element in elements[:index]:
        if element["type"] != "rectangle" or not element.get("fill"):
            continue
        y_start, y_end = element["y_start"], element["y_end"]
        assert isinstance(y_start, int) and isinstance(y_end, int)
        if y_start <= y <= y_end:
            fill = element["fill"]
            assert isinstance(fill, str)
            background = fill
    return background


def test_every_text_element_has_a_readable_colour_for_its_background() -> None:
    """White or yellow on black; black or red on white. Nothing else."""
    elements = build_elements(BadgeContent())
    checked = 0
    for index, element in enumerate(elements):
        if element["type"] != "text":
            continue
        background = _background_behind(elements, index)
        allowed = _ALLOWED_TEXT_COLOURS[background]
        colour = element["color"]
        assert colour in allowed, (
            f"{element['value']!r} is {colour} on {background}; allowed: {sorted(allowed)}"
        )
        checked += 1
    # Guard against the loop silently checking nothing: wordmark, domain,
    # hero and name.
    assert checked == 4


def test_contactless_mark_is_drawn_left_of_the_qr_code() -> None:
    """The tap mark must sit clear of the QR, not overlap it."""
    elements = build_elements(BadgeContent())
    arcs = [element for element in elements if element["type"] == "arc"]
    assert len(arcs) == len(NFC_MARK_RADII)

    qr = next(element for element in elements if element["type"] == "qrcode")
    qr_x = qr["x"]
    assert isinstance(qr_x, int)

    for arc in arcs:
        assert arc["outline"] == "black"
        x, radius = arc["x"], arc["radius"]
        assert isinstance(x, int) and isinstance(radius, int)
        assert x + radius < qr_x, "tap mark overlaps the QR code"

    # Concentric and increasing, so the arcs read as a wave rather than a blob.
    radii = [arc["radius"] for arc in arcs]
    assert radii == sorted(radii)
    assert len({arc["x"] for arc in arcs}) == 1
    assert len({arc["y"] for arc in arcs}) == 1


def test_contactless_mark_stays_inside_the_canvas() -> None:
    elements = build_elements(BadgeContent())
    for arc in (element for element in elements if element["type"] == "arc"):
        x, y, radius = arc["x"], arc["y"], arc["radius"]
        assert isinstance(x, int) and isinstance(y, int) and isinstance(radius, int)
        assert 0 <= x - radius and x + radius <= CANVAS_WIDTH
        assert 0 <= y - radius and y + radius <= CANVAS_HEIGHT


@pytest.mark.parametrize(
    ("mark_edge", "opens_toward"),
    [("left", 180), ("right", 0)],
)
def test_tap_mark_sits_on_the_antenna_edge_and_opens_outward(
    mark_edge: str, opens_toward: int
) -> None:
    """The mark must track the antenna, which moves when the badge is rotated."""
    elements = build_elements(BadgeContent(), mark_edge)  # type: ignore[arg-type]
    arcs = [element for element in elements if element["type"] == "arc"]
    assert len(arcs) == len(NFC_MARK_RADII)

    for arc in arcs:
        x, radius = arc["x"], arc["radius"]
        start, end = arc["start_angle"], arc["end_angle"]
        assert isinstance(x, int) and isinstance(radius, int)
        assert isinstance(start, int) and isinstance(end, int)
        # Arcs open toward the antenna edge, so the sweep straddles that angle.
        assert (start + end) // 2 % 360 == opens_toward
        if mark_edge == "left":
            assert x + radius < CANVAS_WIDTH / 2
        else:
            assert x - radius > CANVAS_WIDTH / 2
        assert 0 <= x - radius and x + radius <= CANVAS_WIDTH


@pytest.mark.parametrize("mark_edge", ["left", "right"])
def test_reserved_strip_keeps_the_mark_clear_of_content(mark_edge: str) -> None:
    elements = build_elements(BadgeContent(handle="@averyverylonghandleindeed"), mark_edge)  # type: ignore[arg-type]
    arcs = [element for element in elements if element["type"] == "arc"]
    texts = [element for element in elements if element["type"] == "text"]
    qr = next(element for element in elements if element["type"] == "qrcode")

    outer = max(int(arc["radius"]) for arc in arcs)
    centre_x = int(arcs[0]["x"])
    mark_left, mark_right = centre_x - outer, centre_x + outer

    qr_x, qr_size = int(qr["x"]), qr_pixel_size(BadgeContent().qr_url, QR_BOX_SIZE, QR_BORDER)
    assert mark_right <= qr_x or mark_left >= qr_x + qr_size

    # Body text must start clear of the strip on whichever side it is reserved.
    for text in texts:
        if text["y"] < 50:  # the brand band sits above the strip
            continue
        text_x = int(text["x"])
        if mark_edge == "left":
            assert text_x >= mark_right, f"{text['value']!r} runs into the tap mark"
