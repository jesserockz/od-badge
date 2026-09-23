"""Command line interface for od_badge.

Usage: ``python -m od_badge <render|push> [flags]``.
"""

from __future__ import annotations

import argparse
import asyncio
import shlex
import tempfile
from pathlib import Path

from PIL import Image

from od_badge import device, nfc
from od_badge.badge import (
    CANVAS_HEIGHT,
    CANVAS_WIDTH,
    DEFAULT_NAME,
    DEFAULT_QR_URL,
    DEFAULT_WORDMARK,
    BadgeContent,
    render_badge,
    rotate_to_panel,
    swap_red_yellow,
)
from od_badge.badge import DEFAULT_HANDLE as CONTENT_DEFAULT_HANDLE
from od_badge.nfc_placement import antenna_edge
from od_badge.vcard import (
    DEFAULT_CONTACT_EMAIL,
    DEFAULT_CONTACT_NAME,
    VCardContact,
    build_vcard,
)


def _add_content_flags(subparser: argparse.ArgumentParser) -> None:
    subparser.add_argument("--handle", default=CONTENT_DEFAULT_HANDLE, help="hero handle text")
    subparser.add_argument("--name", default=DEFAULT_NAME, help="name shown under the handle")
    subparser.add_argument("--url", default=DEFAULT_QR_URL, help="URL encoded by the QR code")
    subparser.add_argument("--wordmark", default=DEFAULT_WORDMARK, help="brand band wordmark text")


def _add_device_flags(subparser: argparse.ArgumentParser) -> None:
    subparser.add_argument("--device", default=None, help="device MAC (default: env or built-in)")
    subparser.add_argument("--key", default=None, help="device key (default: env or built-in)")
    subparser.add_argument("--dry-run", action="store_true", help="print what would happen, do not connect")


def _add_contact_flags(subparser: argparse.ArgumentParser) -> None:
    subparser.add_argument("--contact-name", default=DEFAULT_CONTACT_NAME, help="name on the NFC contact card")
    subparser.add_argument("--contact-email", default=DEFAULT_CONTACT_EMAIL, help="email on the NFC contact card")


def _contact_from_args(args: argparse.Namespace, url: str) -> VCardContact:
    """Build the NFC contact card, reusing the badge's QR URL so the two agree.

    The ``nfc`` subcommand has no ``--handle`` flag, so fall back to the badge
    default there: both paths must produce the same card for the same tag.
    """
    handle = getattr(args, "handle", None) or CONTENT_DEFAULT_HANDLE
    return VCardContact(
        name=args.contact_name,
        email=args.contact_email,
        url=url,
        nickname=handle.lstrip("@"),
    )


def _content_from_args(args: argparse.Namespace) -> BadgeContent:
    return BadgeContent(
        handle=args.handle,
        name=args.name,
        qr_url=args.url,
        wordmark=args.wordmark,
    )


def build_parser() -> argparse.ArgumentParser:
    """Build the top-level argparse parser with its render and push subcommands."""
    parser = argparse.ArgumentParser(
        prog="od_badge",
        description="Render and upload an ESPHome conference badge to an OpenDisplay tag.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    render_parser = subparsers.add_parser("render", help="render the landscape badge PNG")
    _add_content_flags(render_parser)
    render_parser.add_argument("--out", default="badge.png", help="output PNG path")
    render_parser.add_argument(
        "--scale", type=int, default=1, help="nearest-neighbour preview upscale factor"
    )

    push_parser = subparsers.add_parser("push", help="render, rotate and upload to the panel")
    _add_content_flags(push_parser)
    push_parser.add_argument(
        "--rotation",
        choices=["cw", "ccw"],
        default="ccw",
        help="direction to rotate onto the panel (ccw is upright on a lanyard)",
    )
    push_parser.add_argument(
        "--no-ink-swap",
        dest="ink_swap",
        action="store_false",
        help="do not pre-swap red and yellow (see badge.swap_red_yellow); "
        "pass this if py-opendisplay stops swapping those inks for panel 0x001E",
    )
    push_parser.add_argument(
        "--with-nfc",
        action="store_true",
        help="also write the NFC contact card after uploading (opt-in, off by default)",
    )
    _add_device_flags(push_parser)
    _add_contact_flags(push_parser)

    nfc_parser = subparsers.add_parser("nfc", help="write an NDEF record to the tag's NFC chip")
    nfc_group = nfc_parser.add_mutually_exclusive_group()
    nfc_group.add_argument(
        "--vcard",
        action="store_true",
        help="write a text/vcard contact card (name, email, URL) - the default record type",
    )
    nfc_group.add_argument("--url", default=None, help="write a URI NDEF record with this URL instead")
    nfc_group.add_argument("--text", default=None, help="write a TEXT NDEF record with this text instead")
    _add_device_flags(nfc_parser)
    _add_contact_flags(nfc_parser)

    return parser


async def _run_render(args: argparse.Namespace) -> int:
    content = _content_from_args(args)
    # The render subcommand has no rotation flag; preview the default (ccw).
    edge = antenna_edge("landscape", "ccw", CANVAS_WIDTH, CANVAS_HEIGHT)
    image = await render_badge(content, edge)
    if args.scale > 1:
        image = image.resize((CANVAS_WIDTH * args.scale, CANVAS_HEIGHT * args.scale), Image.NEAREST)
    image.save(args.out)
    print(f"wrote {args.out} ({image.width}x{image.height})")
    return 0


async def _write_nfc_and_report(args: argparse.Namespace, kind: nfc.NfcRecordKind, value: str) -> int:
    """Write an NDEF record via the nfc module and print the outcome.

    Shared by ``push --with-nfc`` and the ``nfc`` subcommand so both report
    NFC results the same way and handle the same failure modes.
    """
    try:
        result = await nfc.write_nfc(kind, value, device=args.device, key=args.key, dry_run=args.dry_run)
    except (nfc.NfcNotSupportedError, nfc.NfcWriteError) as error:
        print(f"nfc write failed: {error}")
        return 1

    if result.dry_run:
        print(f"dry run, would write nfc {result.kind} record {result.value!r} to {result.device}")
        return 0

    print(f"wrote nfc {result.kind} record {result.value!r} to {result.device}")
    return 0


async def _run_push(args: argparse.Namespace) -> int:
    content = _content_from_args(args)
    edge = antenna_edge("landscape", args.rotation, CANVAS_WIDTH, CANVAS_HEIGHT)
    landscape = await render_badge(content, edge)
    panel = rotate_to_panel(landscape, args.rotation)
    if args.ink_swap:
        panel = swap_red_yellow(panel)

    with tempfile.TemporaryDirectory() as tmp_dir:
        panel_path = str(Path(tmp_dir) / "panel.png")
        panel.save(panel_path)
        result = device.upload(
            panel_path,
            device=args.device,
            key=args.key,
            dry_run=args.dry_run,
        )

    if result.dry_run:
        print("dry run, would run:", shlex.join(result.command))
    else:
        print("uploaded:", shlex.join(result.command))
        if result.stdout:
            print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")

    if args.with_nfc:
        vcard = build_vcard(_contact_from_args(args, content.qr_url))
        nfc_exit_code = await _write_nfc_and_report(args, "vcard", vcard)
        if nfc_exit_code != 0:
            return nfc_exit_code

    return 0


async def _run_nfc(args: argparse.Namespace) -> int:
    if args.text is not None:
        return await _write_nfc_and_report(args, "text", args.text)
    if args.url is not None:
        return await _write_nfc_and_report(args, "url", args.url)
    vcard = build_vcard(_contact_from_args(args, DEFAULT_QR_URL))
    return await _write_nfc_and_report(args, "vcard", vcard)


def main(argv: list[str] | None = None) -> int:
    """Parse arguments and dispatch to the requested subcommand."""
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.command == "push":
        return asyncio.run(_run_push(args))
    if args.command == "nfc":
        return asyncio.run(_run_nfc(args))
    return asyncio.run(_run_render(args))
