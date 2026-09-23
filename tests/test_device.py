from __future__ import annotations

import subprocess
from typing import Any

import pytest

from od_badge import device


def test_resolve_device_uses_explicit_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(device.DEVICE_ENV_VAR, "AA:BB:CC:DD:EE:FF")
    assert device.resolve_device("11:22:33:44:55:66") == "11:22:33:44:55:66"


def test_resolve_device_falls_back_to_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(device.DEVICE_ENV_VAR, "AA:BB:CC:DD:EE:FF")
    assert device.resolve_device(None) == "AA:BB:CC:DD:EE:FF"


def test_resolve_device_falls_back_to_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(device.DEVICE_ENV_VAR, raising=False)
    with pytest.raises(device.MissingDeviceError, match="No device MAC"):
        device.resolve_device(None)


def test_resolve_key_uses_explicit_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(device.KEY_ENV_VAR, "ENVKEY")
    assert device.resolve_key("EXPLICITKEY") == "EXPLICITKEY"


def test_resolve_key_falls_back_to_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(device.KEY_ENV_VAR, "ENVKEY")
    assert device.resolve_key(None) == "ENVKEY"


def test_resolve_key_falls_back_to_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(device.KEY_ENV_VAR, raising=False)
    with pytest.raises(device.MissingDeviceError, match="No encryption key"):
        device.resolve_key(None)


def test_build_upload_command_matches_verified_invocation() -> None:
    command = device.build_upload_command("panel.png", "MAC", "KEY", timeout=60)
    assert command == [
        "opendisplay",
        "upload",
        "--device",
        "MAC",
        "--key",
        "KEY",
        "--dither-mode",
        "none",
        "--fit",
        "stretch",
        "--rotate",
        "0",
        "--timeout",
        "60",
        "panel.png",
    ]


def test_upload_dry_run_does_not_invoke_subprocess(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[Any] = []
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: calls.append((a, k)))
    result = device.upload("panel.png", device="MAC", key="KEY", dry_run=True)
    assert result.dry_run is True
    assert result.returncode is None
    assert calls == []
    assert result.command[-1] == "panel.png"


def test_upload_success_runs_real_wrapper_with_mocked_subprocess(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    def fake_run(command: list[str], capture_output: bool, text: bool) -> subprocess.CompletedProcess[str]:
        captured["command"] = command
        return subprocess.CompletedProcess(command, returncode=0, stdout="ok\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    result = device.upload("panel.png", device="MAC", key="KEY", dry_run=False)
    assert result.dry_run is False
    assert result.returncode == 0
    assert result.stdout == "ok\n"
    assert captured["command"][0] == "opendisplay"


def test_upload_failure_raises_upload_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(command: list[str], capture_output: bool, text: bool) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(command, returncode=1, stdout="", stderr="boom")

    monkeypatch.setattr(subprocess, "run", fake_run)
    with pytest.raises(device.UploadError, match="boom"):
        device.upload("panel.png", device="MAC", key="KEY", dry_run=False)
