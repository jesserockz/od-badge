from __future__ import annotations

from typing import Any

import pytest

from od_badge import device as device_module
from od_badge import nfc


class _FakeDevice:
    """Records constructor args and NFC write calls, mimicking the async CM.

    Every constructed instance is appended to ``instances`` so tests can
    inspect what ``OpenDisplayDevice(...)`` was called with.
    """

    instances: list["_FakeDevice"] = []

    def __init__(self, *, mac_address: str, encryption_key: bytes, timeout: float) -> None:
        self.mac_address = mac_address
        self.encryption_key = encryption_key
        self.timeout = timeout
        self.calls: list[tuple[str, str]] = []
        _FakeDevice.instances.append(self)

    async def __aenter__(self) -> "_FakeDevice":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> bool:
        return False

    async def write_nfc_url(self, url: str) -> None:
        self.calls.append(("url", url))

    async def write_nfc_text(self, text: str) -> None:
        self.calls.append(("text", text))


@pytest.fixture(autouse=True)
def _reset_fake_device_instances() -> None:
    _FakeDevice.instances.clear()


async def test_write_nfc_dry_run_does_not_connect(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(nfc, "OpenDisplayDevice", _FakeDevice)
    result = await nfc.write_nfc("url", "https://example.com", device="MAC", key="AA" * 16, dry_run=True)
    assert result.dry_run is True
    assert result.kind == "url"
    assert result.value == "https://example.com"
    assert result.device == "MAC"
    assert _FakeDevice.instances == []


async def test_write_nfc_url_writes_uri_record(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(nfc, "OpenDisplayDevice", _FakeDevice)
    result = await nfc.write_nfc("url", "https://example.com", device="MAC", key="AABB" * 8)
    assert result.dry_run is False
    assert result.kind == "url"
    assert len(_FakeDevice.instances) == 1
    instance = _FakeDevice.instances[0]
    assert instance.mac_address == "MAC"
    assert instance.encryption_key == bytes.fromhex("AABB" * 8)
    assert instance.calls == [("url", "https://example.com")]


async def test_write_nfc_text_writes_text_record(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(nfc, "OpenDisplayDevice", _FakeDevice)
    result = await nfc.write_nfc("text", "hello badge", device="MAC", key="AABB" * 8)
    assert result.kind == "text"
    assert result.value == "hello badge"
    instance = _FakeDevice.instances[0]
    assert instance.calls == [("text", "hello badge")]


async def test_write_nfc_uses_env_var_fallbacks(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(device_module.DEVICE_ENV_VAR, "ENV:MAC")
    monkeypatch.setenv(device_module.KEY_ENV_VAR, "AA" * 16)
    monkeypatch.setattr(nfc, "OpenDisplayDevice", _FakeDevice)
    result = await nfc.write_nfc("url", "https://example.com")
    assert result.device == "ENV:MAC"
    instance = _FakeDevice.instances[0]
    assert instance.mac_address == "ENV:MAC"
    assert instance.encryption_key == bytes.fromhex("AA" * 16)


async def test_write_nfc_uses_env_device_and_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(nfc, "OpenDisplayDevice", _FakeDevice)
    result = await nfc.write_nfc("url", "https://example.com")
    assert result.device == "AA:BB:CC:DD:EE:FF"
    instance = _FakeDevice.instances[0]
    assert instance.encryption_key == bytes.fromhex("AA" * 16)


async def test_write_nfc_propagates_not_supported_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class _RaisingDevice(_FakeDevice):
        async def write_nfc_url(self, url: str) -> None:
            raise nfc.NfcNotSupportedError()

    monkeypatch.setattr(nfc, "OpenDisplayDevice", _RaisingDevice)
    with pytest.raises(nfc.NfcNotSupportedError):
        await nfc.write_nfc("url", "https://example.com", device="MAC", key="AA" * 16)


async def test_write_nfc_propagates_write_error(monkeypatch: pytest.MonkeyPatch) -> None:
    class _RaisingDevice(_FakeDevice):
        async def write_nfc_text(self, text: str) -> None:
            raise nfc.NfcWriteError("rejected")

    monkeypatch.setattr(nfc, "OpenDisplayDevice", _RaisingDevice)
    with pytest.raises(nfc.NfcWriteError):
        await nfc.write_nfc("text", "hello", device="MAC", key="AA" * 16)
