from __future__ import annotations

from od_badge.vcard import (
    DEFAULT_CONTACT_EMAIL,
    DEFAULT_CONTACT_NAME,
    VCARD_MIME_TYPE,
    VCardContact,
    build_vcard,
    escape_value,
    split_name,
)


def test_split_name_family_and_given() -> None:
    assert split_name("Jane Doe") == ("Doe", "Jane")


def test_split_name_multiple_given_names() -> None:
    assert split_name("Ada Marie King Lovelace") == ("Lovelace", "Ada Marie King")


def test_split_name_single_token_has_no_family_name() -> None:
    assert split_name("Jane") == ("", "Jane")


def test_split_name_empty_string() -> None:
    assert split_name("   ") == ("", "")


def test_escape_value_escapes_backslash_first() -> None:
    # If the backslash were escaped last, the escapes added for ";" would
    # themselves be doubled.
    assert escape_value("a\\b;c,d") == "a\\\\b\\;c\\,d"


def test_escape_value_escapes_newlines() -> None:
    assert escape_value("line1\nline2") == "line1\\nline2"


def test_build_vcard_full_contact() -> None:
    card = build_vcard(
        VCardContact(
            name="Jane Doe",
            email="jane@example.com",
            url="https://example.com",
            nickname="janedoe",
        )
    )
    assert card.startswith("BEGIN:VCARD\r\nVERSION:3.0\r\n")
    assert "N:Hills;Jane;;;" in card
    assert "FN:Jane Doe" in card
    assert "NICKNAME:janedoe" in card
    assert "EMAIL;TYPE=INTERNET:jane@example.com" in card
    assert "URL:https://example.com" in card
    assert card.endswith("END:VCARD\r\n")


def test_build_vcard_omits_empty_optional_fields() -> None:
    card = build_vcard(VCardContact(name="Jane", email="", url="", nickname=""))
    assert "NICKNAME" not in card
    assert "EMAIL" not in card
    assert "URL" not in card
    assert "N:;Jane;;;" in card
    assert "FN:Jane" in card


def test_build_vcard_defaults_are_the_badge_owner() -> None:
    card = build_vcard(VCardContact())
    assert f"FN:{DEFAULT_CONTACT_NAME}" in card
    assert DEFAULT_CONTACT_EMAIL in card


def test_build_vcard_uses_crlf_line_endings() -> None:
    card = build_vcard(VCardContact())
    assert "\r\n" in card
    assert card.replace("\r\n", "").find("\n") == -1


def test_build_vcard_fits_the_nfc_payload_limit() -> None:
    # write_nfc rejects payloads over 512 bytes, and the MIME record adds a
    # length-prefixed type header on top of the card itself.
    card = build_vcard(VCardContact(url="https://github.com/janedoe"))
    payload_size = 1 + len(VCARD_MIME_TYPE.encode()) + len(card.encode())
    assert payload_size <= 512


def test_build_vcard_escapes_a_name_containing_a_separator() -> None:
    card = build_vcard(VCardContact(name="Doe; Jane", email="", url="", nickname=""))
    assert "\\;" in card
