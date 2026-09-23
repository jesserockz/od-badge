from __future__ import annotations

import importlib
import runpy
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from PIL import Image

from od_badge import device, nfc
from od_badge.badge import CANVAS_HEIGHT, CANVAS_WIDTH, DEFAULT_QR_URL, swap_red_yellow
from od_badge.cli import build_parser, main


class _FakeNfcDevice:
    """Records constructor args and NFC write calls, mimicking the async CM."""

    instances: list["_FakeNfcDevice"] = []

    def __init__(self, *, mac_address: str, encryption_key: bytes, timeout: float) -> None:
        self.mac_address = mac_address
        self.encryption_key = encryption_key
        self.timeout = timeout
        self.calls: list[tuple[str, str]] = []
        _FakeNfcDevice.instances.append(self)

    async def __aenter__(self) -> "_FakeNfcDevice":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        return False

    async def write_nfc_url(self, url: str) -> None:
        self.calls.append(("url", url))

    async def write_nfc_text(self, text: str) -> None:
        self.calls.append(("text", text))

    async def write_nfc_mime(self, mime_type: str, body: str) -> None:
        self.calls.append((f"mime:{mime_type}", body))


@pytest.fixture(autouse=True)
def _reset_fake_nfc_device_instances() -> None:
    _FakeNfcDevice.instances.clear()


def test_build_parser_render_defaults() -> None:
    parser = build_parser()
    args = parser.parse_args(["render"])
    assert args.command == "render"
    assert args.out == "badge.png"
    assert args.scale == 1
    assert args.handle == "@janedoe"


def test_build_parser_push_defaults() -> None:
    parser = build_parser()
    args = parser.parse_args(["push"])
    assert args.command == "push"
    assert args.rotation == "ccw"
    assert args.ink_swap is True
    assert args.with_nfc is False
    assert args.dry_run is False
    assert args.device is None
    assert args.key is None


def test_build_parser_push_overrides() -> None:
    parser = build_parser()
    args = parser.parse_args(
        [
            "push",
            "--handle",
            "@zzz",
            "--rotation",
            "ccw",
            "--device",
            "MAC",
            "--key",
            "KEY",
            "--dry-run",
        ]
    )
    assert args.handle == "@zzz"
    assert args.rotation == "ccw"
    assert args.device == "MAC"
    assert args.key == "KEY"
    assert args.dry_run is True


def test_main_render_writes_png(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    out_path = tmp_path / "badge.png"
    exit_code = main(["render", "--out", str(out_path)])
    assert exit_code == 0
    with Image.open(out_path) as image:
        assert image.size == (CANVAS_WIDTH, CANVAS_HEIGHT)
    captured = capsys.readouterr()
    assert "wrote" in captured.out


def test_main_render_with_scale_upscales_with_nearest_neighbour(tmp_path: Path) -> None:
    out_path = tmp_path / "badge_big.png"
    exit_code = main(["render", "--out", str(out_path), "--scale", "3"])
    assert exit_code == 0
    with Image.open(out_path) as image:
        assert image.size == (CANVAS_WIDTH * 3, CANVAS_HEIGHT * 3)


def test_main_render_custom_content(tmp_path: Path) -> None:
    out_path = tmp_path / "badge_custom.png"
    exit_code = main(
        [
            "render",
            "--out",
            str(out_path),
            "--handle",
            "@custom",
            "--name",
            "CUSTOM",
            "--url",
            "https://example.com",
            "--wordmark",
            "ESPHOME",
        ]
    )
    assert exit_code == 0
    assert out_path.exists()


def test_main_push_dry_run_prints_command_without_subprocess(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    calls: list[Any] = []
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: calls.append((a, k)))
    exit_code = main(["push", "--dry-run"])
    assert exit_code == 0
    assert calls == []
    captured = capsys.readouterr()
    assert "dry run" in captured.out
    assert "opendisplay upload" in captured.out


def test_main_push_real_wrapper_with_mocked_subprocess_and_stdout(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def fake_run(command: list[str], capture_output: bool, text: bool) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, returncode=0, stdout="device says ok\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    exit_code = main(["push", "--device", "MAC", "--key", "KEY"])
    assert exit_code == 0
    captured = capsys.readouterr()
    assert "uploaded" in captured.out
    assert "device says ok" in captured.out


def test_main_push_stdout_without_trailing_newline_still_prints_cleanly(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def fake_run(command: list[str], capture_output: bool, text: bool) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, returncode=0, stdout="no newline", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    exit_code = main(["push"])
    assert exit_code == 0
    captured = capsys.readouterr()
    assert "no newline" in captured.out


def test_main_push_empty_stdout_skips_stdout_print(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    def fake_run(command: list[str], capture_output: bool, text: bool) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    exit_code = main(["push"])
    assert exit_code == 0
    captured = capsys.readouterr()
    assert "uploaded" in captured.out


def test_main_push_uses_env_var_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(device.DEVICE_ENV_VAR, "ENV:MAC")
    monkeypatch.setenv(device.KEY_ENV_VAR, "ENVKEY")
    captured_command: dict[str, Any] = {}

    def fake_run(command: list[str], capture_output: bool, text: bool) -> subprocess.CompletedProcess[str]:
        captured_command["command"] = command
        return subprocess.CompletedProcess(command, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    exit_code = main(["push"])
    assert exit_code == 0
    assert "ENV:MAC" in captured_command["command"]
    assert "ENVKEY" in captured_command["command"]


def test_dunder_main_invokes_cli(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    out_path = tmp_path / "via_main.png"
    monkeypatch.setattr(sys, "argv", ["od_badge", "render", "--out", str(out_path)])
    with pytest.raises(SystemExit) as excinfo:
        runpy.run_module("od_badge", run_name="__main__")
    assert excinfo.value.code == 0
    assert out_path.exists()


def test_dunder_main_module_import_does_not_invoke_cli() -> None:
    # A normal (non "__main__") import must not trigger sys.exit/main() - the
    # `if __name__ == "__main__":` guard should stay false in this path.
    import od_badge.__main__ as dunder_main

    importlib.reload(dunder_main)


def test_build_parser_nfc_defaults() -> None:
    parser = build_parser()
    args = parser.parse_args(["nfc"])
    assert args.command == "nfc"
    assert args.vcard is False
    assert args.url is None
    assert args.text is None
    assert args.device is None
    assert args.key is None
    assert args.dry_run is False


def test_build_parser_nfc_url_and_text_are_mutually_exclusive(capsys: pytest.CaptureFixture[str]) -> None:
    parser = build_parser()
    with pytest.raises(SystemExit) as excinfo:
        parser.parse_args(["nfc", "--url", "https://example.com", "--text", "hello"])
    assert excinfo.value.code == 2
    captured = capsys.readouterr()
    assert "not allowed with argument" in captured.err


def test_build_parser_push_with_nfc_defaults_off() -> None:
    parser = build_parser()
    args = parser.parse_args(["push"])
    assert args.with_nfc is False


def test_main_nfc_dry_run_does_not_connect(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(nfc, "OpenDisplayDevice", _FakeNfcDevice)
    exit_code = main(["nfc", "--dry-run"])
    assert exit_code == 0
    assert _FakeNfcDevice.instances == []
    captured = capsys.readouterr()
    assert "dry run" in captured.out
    assert DEFAULT_QR_URL in captured.out


def test_main_nfc_writes_url_record(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr(nfc, "OpenDisplayDevice", _FakeNfcDevice)
    exit_code = main(["nfc", "--url", "https://example.com/me", "--device", "MAC", "--key", "AA" * 16])
    assert exit_code == 0
    assert len(_FakeNfcDevice.instances) == 1
    assert _FakeNfcDevice.instances[0].calls == [("url", "https://example.com/me")]
    captured = capsys.readouterr()
    assert "wrote nfc url record" in captured.out


def test_main_nfc_writes_text_record(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    monkeypatch.setattr(nfc, "OpenDisplayDevice", _FakeNfcDevice)
    exit_code = main(["nfc", "--text", "hello badge", "--device", "MAC", "--key", "AA" * 16])
    assert exit_code == 0
    assert _FakeNfcDevice.instances[0].calls == [("text", "hello badge")]
    captured = capsys.readouterr()
    assert "wrote nfc text record" in captured.out


def test_main_nfc_not_supported_error_reports_failure(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    class _RaisingDevice(_FakeNfcDevice):
        async def write_nfc_mime(self, mime_type: str, body: str) -> None:
            raise nfc.NfcNotSupportedError()

    monkeypatch.setattr(nfc, "OpenDisplayDevice", _RaisingDevice)
    exit_code = main(["nfc", "--device", "MAC", "--key", "AA" * 16])
    assert exit_code == 1
    captured = capsys.readouterr()
    assert "nfc write failed" in captured.out


def test_main_nfc_write_error_reports_failure(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    class _RaisingDevice(_FakeNfcDevice):
        async def write_nfc_text(self, text: str) -> None:
            raise nfc.NfcWriteError("rejected")

    monkeypatch.setattr(nfc, "OpenDisplayDevice", _RaisingDevice)
    exit_code = main(["nfc", "--text", "hi", "--device", "MAC", "--key", "AA" * 16])
    assert exit_code == 1
    captured = capsys.readouterr()
    assert "nfc write failed" in captured.out
    assert "rejected" in captured.out


def test_main_push_without_with_nfc_does_not_touch_nfc(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(command: list[str], capture_output: bool, text: bool) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    class _ExplodingDevice(_FakeNfcDevice):
        def __init__(self, **kwargs: Any) -> None:
            raise AssertionError("OpenDisplayDevice must not be constructed without --with-nfc")

    monkeypatch.setattr(nfc, "OpenDisplayDevice", _ExplodingDevice)
    exit_code = main(["push"])
    assert exit_code == 0


def test_main_push_with_nfc_dry_run_shows_both_actions(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    calls: list[Any] = []
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: calls.append((a, k)))
    monkeypatch.setattr(nfc, "OpenDisplayDevice", _FakeNfcDevice)
    exit_code = main(["push", "--dry-run", "--with-nfc"])
    assert exit_code == 0
    assert calls == []
    assert _FakeNfcDevice.instances == []
    captured = capsys.readouterr()
    assert "dry run, would run" in captured.out
    assert "dry run, would write nfc" in captured.out
    assert DEFAULT_QR_URL in captured.out


def test_main_push_with_nfc_writes_a_vcard_carrying_the_same_qr_url(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(command: list[str], capture_output: bool, text: bool) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(nfc, "OpenDisplayDevice", _FakeNfcDevice)
    exit_code = main(["push", "--with-nfc", "--url", "https://example.com/badge", "--device", "MAC", "--key", "AA" * 16])
    assert exit_code == 0
    assert len(_FakeNfcDevice.instances) == 1
    (kind, body), = _FakeNfcDevice.instances[0].calls
    assert kind == "mime:text/vcard"
    # The QR URL and the contact card must not drift apart.
    assert "URL:https://example.com/badge" in body
    assert body.startswith("BEGIN:VCARD")


def test_main_push_with_nfc_error_propagates_exit_code(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(command: list[str], capture_output: bool, text: bool) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    class _RaisingDevice(_FakeNfcDevice):
        async def write_nfc_mime(self, mime_type: str, body: str) -> None:
            raise nfc.NfcWriteError("rejected")

    monkeypatch.setattr(nfc, "OpenDisplayDevice", _RaisingDevice)
    exit_code = main(["push", "--with-nfc"])
    assert exit_code == 1


def test_main_push_no_ink_swap_leaves_red_and_yellow_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    """The compensated upload must be the exact red/yellow swap of the raw one."""
    uploaded: list[Image.Image] = []

    def fake_run(command: list[str], capture_output: bool, text: bool) -> subprocess.CompletedProcess[str]:
        image = Image.open(command[-1]).convert("RGB")
        image.load()
        uploaded.append(image)
        return subprocess.CompletedProcess(command, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert main(["push", "--no-ink-swap"]) == 0
    assert main(["push"]) == 0
    raw, compensated = uploaded

    assert swap_red_yellow(raw).tobytes() == compensated.tobytes()
    # Guard against a no-op: the badge really does use both inks.
    raw_colors = {c[1] for c in raw.getcolors(maxcolors=1 << 20)}
    assert (255, 0, 0) in raw_colors
    assert (255, 255, 0) in raw_colors
