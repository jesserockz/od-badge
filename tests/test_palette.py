from __future__ import annotations

from od_badge.palette import BLACK, BWRY, RED, WHITE, YELLOW, nearest


def test_bwry_list_contains_all_four_colors() -> None:
    assert BWRY == [BLACK, WHITE, RED, YELLOW]


def test_nearest_exact_match() -> None:
    assert nearest((0, 0, 0)) == BLACK
    assert nearest((255, 255, 255)) == WHITE
    assert nearest((255, 0, 0)) == RED
    assert nearest((255, 255, 0)) == YELLOW


def test_nearest_snaps_brand_cyan_to_black_or_white() -> None:
    # The ESPHome brand cyan is much closer to white than to any other palette entry.
    assert nearest((0x18, 0xBC, 0xF2)) == WHITE


def test_nearest_snaps_near_white_glyph_color() -> None:
    assert nearest((0xF2, 0xF4, 0xF9)) == WHITE
