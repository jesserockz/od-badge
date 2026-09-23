from __future__ import annotations

import pytest

from od_badge import device

#: Stand-in device details for tests. Deliberately not a real MAC or key:
#: nothing in this repo should carry either.
TEST_DEVICE_MAC = "AA:BB:CC:DD:EE:FF"
TEST_DEVICE_KEY = "AA" * 16


@pytest.fixture(autouse=True)
def _device_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Give every test a device MAC and key via the environment.

    There are no baked-in defaults any more, so without this each test that
    reaches resolve_device/resolve_key would raise MissingDeviceError. Tests
    that specifically check the missing case delete these again.
    """
    monkeypatch.setenv(device.DEVICE_ENV_VAR, TEST_DEVICE_MAC)
    monkeypatch.setenv(device.KEY_ENV_VAR, TEST_DEVICE_KEY)
