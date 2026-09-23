from __future__ import annotations

from od_badge.logo import clear_cache, render_logo
from od_badge.palette import BWRY


def test_render_logo_is_square_rgba() -> None:
    clear_cache()
    image = render_logo("#FFFFFF", "#000000", 34)
    assert image.size == (34, 34)
    assert image.mode == "RGBA"


def test_render_logo_has_transparent_and_opaque_pixels() -> None:
    clear_cache()
    image = render_logo("#FF0000", "#00FF00", 24)
    pixels = image.load()
    saw_transparent = False
    saw_opaque = False
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                saw_transparent = True
                assert (r, g, b) == (0, 0, 0)
            else:
                saw_opaque = True
                assert a == 255
                assert (r, g, b) in BWRY
    assert saw_transparent
    assert saw_opaque


def test_render_logo_is_cached_by_arguments() -> None:
    clear_cache()
    first = render_logo("#123456", "#654321", 16)
    second = render_logo("#123456", "#654321", 16)
    assert first is second


def test_render_logo_cache_miss_on_different_arguments() -> None:
    clear_cache()
    first = render_logo("#111111", "#222222", 16)
    second = render_logo("#111111", "#222222", 18)
    assert first is not second


def test_clear_cache_forces_a_fresh_render() -> None:
    clear_cache()
    first = render_logo("#ABCDEF", "#FEDCBA", 12)
    clear_cache()
    second = render_logo("#ABCDEF", "#FEDCBA", 12)
    assert first is not second
    assert first.tobytes() == second.tobytes()
