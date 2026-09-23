"""Build the vCard written to the tag's NFC chip as a contact card.

A URI record makes a phone offer to open a link. A ``text/vcard`` MIME
record instead makes it offer to save a contact, which is what a name badge
wants: tap the badge, keep the person's details.

vCard 3.0 is used rather than 4.0 because Android and iOS both import it
without complaint. Lines are joined with CRLF as the spec requires.
"""

from __future__ import annotations

from dataclasses import dataclass

VCARD_MIME_TYPE = "text/vcard"
VCARD_LINE_ENDING = "\r\n"

DEFAULT_CONTACT_NAME = ""
#: No personal details are baked in. The contact card is filled from
#: --contact-name / --contact-email, or left out of the vCard entirely.
DEFAULT_CONTACT_EMAIL = ""


@dataclass(frozen=True)
class VCardContact:
    """The contact details encoded into the NFC contact card."""

    name: str = DEFAULT_CONTACT_NAME
    email: str = DEFAULT_CONTACT_EMAIL
    url: str = ""
    nickname: str = ""


def split_name(full_name: str) -> tuple[str, str]:
    """Split a display name into (family, given) for the vCard ``N`` property.

    The last whitespace-separated token is treated as the family name. A
    single-token name has no family name, which is valid: ``N`` simply
    carries the given name only.
    """
    parts = full_name.split()
    if len(parts) < 2:
        return "", full_name.strip()
    return parts[-1], " ".join(parts[:-1])


def escape_value(value: str) -> str:
    """Escape a value for a vCard property per RFC 2426.

    Backslashes must be escaped first, otherwise the escapes added for the
    other characters would themselves be escaped again.
    """
    escaped = value.replace("\\", "\\\\")
    escaped = escaped.replace(";", "\\;")
    escaped = escaped.replace(",", "\\,")
    return escaped.replace("\n", "\\n")


def build_vcard(contact: VCardContact) -> str:
    """Render ``contact`` as a vCard 3.0 string.

    Only non-empty fields are emitted, so a contact without a URL or
    nickname produces a card without those properties rather than an empty
    one a phone might import as blank.
    """
    family, given = split_name(contact.name)
    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"N:{escape_value(family)};{escape_value(given)};;;",
        f"FN:{escape_value(contact.name)}",
    ]
    if contact.nickname:
        lines.append(f"NICKNAME:{escape_value(contact.nickname)}")
    if contact.email:
        lines.append(f"EMAIL;TYPE=INTERNET:{escape_value(contact.email)}")
    if contact.url:
        lines.append(f"URL:{escape_value(contact.url)}")
    lines.append("END:VCARD")
    return VCARD_LINE_ENDING.join(lines) + VCARD_LINE_ENDING
