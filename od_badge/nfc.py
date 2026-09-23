"""Write NDEF records to the tag's NFC chip (TNB132M) over BLE.

Unlike ``device.upload``, which shells out to the verified ``opendisplay
upload`` CLI, this talks to the installed ``opendisplay`` Python library
directly - the CLI has no NFC subcommand. This module opens a BLE
connection, writes one NDEF record (URI, TEXT or a ``text/vcard`` MIME
contact card) and disconnects.

Device and key resolution (``OPENDISPLAY_DEVICE`` / ``OPENDISPLAY_KEY`` env
vars, explicit args, then the badge's built-in defaults) is shared with the
image upload path via ``device.resolve_device`` / ``device.resolve_key``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from opendisplay import NfcNotSupportedError, NfcWriteError, OpenDisplayDevice

from od_badge.device import resolve_device, resolve_key
from od_badge.vcard import VCARD_MIME_TYPE

NfcRecordKind = Literal["url", "text", "vcard"]

NFC_TIMEOUT_SECONDS = 60.0

__all__ = [
    "NFC_TIMEOUT_SECONDS",
    "NfcNotSupportedError",
    "NfcRecordKind",
    "NfcWriteError",
    "NfcWriteResult",
    "write_nfc",
]


@dataclass(frozen=True)
class NfcWriteResult:
    """The outcome of an NFC write attempt (real or dry-run)."""

    kind: NfcRecordKind
    value: str
    device: str
    dry_run: bool = False


async def write_nfc(
    kind: NfcRecordKind,
    value: str,
    device: str | None = None,
    key: str | None = None,
    timeout: float = NFC_TIMEOUT_SECONDS,
    dry_run: bool = False,
) -> NfcWriteResult:
    """Write one NDEF record to the tag, or just report it if ``dry_run``.

    ``kind`` selects the record type: "url" writes a URI record, "text" a
    TEXT record, and "vcard" a ``text/vcard`` MIME record whose ``value`` is
    a pre-built vCard string (see ``vcard.build_vcard``).

    Raises:
        NfcNotSupportedError: The device did not respond to the NFC write
            (firmware older than the NFC write feature).
        NfcWriteError: The firmware rejected the write with an error frame.
    """
    resolved_device = resolve_device(device)
    resolved_key = resolve_key(key)

    if dry_run:
        return NfcWriteResult(kind=kind, value=value, device=resolved_device, dry_run=True)

    key_bytes = bytes.fromhex(resolved_key)
    async with OpenDisplayDevice(
        mac_address=resolved_device, encryption_key=key_bytes, timeout=timeout
    ) as od_device:
        if kind == "url":
            await od_device.write_nfc_url(value)
        elif kind == "vcard":
            await od_device.write_nfc_mime(VCARD_MIME_TYPE, value)
        else:
            await od_device.write_nfc_text(value)

    return NfcWriteResult(kind=kind, value=value, device=resolved_device, dry_run=False)
