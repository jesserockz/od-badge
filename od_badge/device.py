"""Upload a rendered panel image to the OpenDisplay tag over BLE.

Wraps the verified ``opendisplay upload`` CLI invocation. The image passed
in must already be rotated to exactly 168x384 - this module does not touch
pixels, it only shells out.
"""

from __future__ import annotations

import os
import subprocess
from dataclasses import dataclass, field

#: No device defaults are baked in: a MAC identifies a specific tag and the
#: key is a secret, so both come from the environment or an explicit flag.
DEFAULT_DEVICE_MAC: str | None = None
DEFAULT_DEVICE_KEY: str | None = None

DEVICE_ENV_VAR = "OPENDISPLAY_DEVICE"
KEY_ENV_VAR = "OPENDISPLAY_KEY"

UPLOAD_TIMEOUT_SECONDS = 60


class MissingDeviceError(RuntimeError):
    """Raised when no device MAC or encryption key has been supplied."""


class UploadError(RuntimeError):
    """Raised when the ``opendisplay upload`` subprocess exits non-zero."""


@dataclass(frozen=True)
class UploadResult:
    """The outcome of an upload attempt (real or dry-run)."""

    command: list[str] = field(default_factory=list)
    dry_run: bool = False
    returncode: int | None = None
    stdout: str = ""
    stderr: str = ""


def resolve_device(device: str | None = None) -> str:
    """Resolve the target device MAC: explicit arg, then env var.

    Raises:
        MissingDeviceError: If neither is set. Better to say so than to guess
            at a MAC and fail later with a confusing BLE error.
    """
    resolved = device or os.environ.get(DEVICE_ENV_VAR) or DEFAULT_DEVICE_MAC
    if not resolved:
        raise MissingDeviceError(
            f"No device MAC. Pass --device or set {DEVICE_ENV_VAR} "
            "(name lookup does not work for these tags, use the MAC)."
        )
    return resolved


def resolve_key(key: str | None = None) -> str:
    """Resolve the encryption key: explicit arg, then env var.

    Raises:
        MissingDeviceError: If neither is set.
    """
    resolved = key or os.environ.get(KEY_ENV_VAR) or DEFAULT_DEVICE_KEY
    if not resolved:
        raise MissingDeviceError(
            f"No encryption key. Pass --key or set {KEY_ENV_VAR} "
            "(32 hex characters)."
        )
    return resolved


def build_upload_command(
    image_path: str,
    device: str,
    key: str,
    timeout: int = UPLOAD_TIMEOUT_SECONDS,
) -> list[str]:
    """Build the verified ``opendisplay upload`` argv."""
    return [
        "opendisplay",
        "upload",
        "--device",
        device,
        "--key",
        key,
        "--dither-mode",
        "none",
        "--fit",
        "stretch",
        "--rotate",
        "0",
        "--timeout",
        str(timeout),
        image_path,
    ]


def upload(
    image_path: str,
    device: str | None = None,
    key: str | None = None,
    timeout: int = UPLOAD_TIMEOUT_SECONDS,
    dry_run: bool = False,
) -> UploadResult:
    """Upload ``image_path`` to the device, or just report the command if ``dry_run``."""
    resolved_device = resolve_device(device)
    resolved_key = resolve_key(key)
    command = build_upload_command(image_path, resolved_device, resolved_key, timeout)

    if dry_run:
        return UploadResult(command=command, dry_run=True)

    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0:
        raise UploadError(
            f"opendisplay upload exited with code {completed.returncode}: {completed.stderr.strip()}"
        )
    return UploadResult(
        command=command,
        dry_run=False,
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
    )
