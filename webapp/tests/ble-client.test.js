import test from 'node:test';
import assert from 'node:assert/strict';

import { createBleClient, disconnectBleClient, resolveBleConstructor } from '../src/ble/ble-client.js';

test('resolveBleConstructor returns null when the vendored script is absent', () => {
  assert.equal(resolveBleConstructor(), null);
});

test('createBleClient explains which file is missing rather than throwing TypeError', () => {
  assert.throws(() => createBleClient(), /vendor\/js\/ble-common\.js\) not loaded/);
});

test('resolveBleConstructor finds the constructor on globalThis', () => {
  // Regression guard: the constructor must be looked up somewhere that
  // actually holds it. The real page binds it lexically (a top-level class in
  // a classic script never lands on window), which is why checking
  // window.OpenDisplayBLE alone made Connect fail with the library loaded.
  class FakeBle {}
  globalThis.OpenDisplayBLE = FakeBle;
  try {
    assert.equal(resolveBleConstructor(), FakeBle);
    assert.ok(createBleClient() instanceof FakeBle);
  } finally {
    delete globalThis.OpenDisplayBLE;
  }
});

test('resolveBleConstructor goes back to null once the global is removed', () => {
  assert.equal(resolveBleConstructor(), null);
});

test('createBleClient passes options through to the constructor', () => {
  // The UI registers an onDisconnect callback this way, so it must not be dropped.
  let seen = null;
  class FakeBle {
    constructor(options) {
      seen = options;
    }
  }
  globalThis.OpenDisplayBLE = FakeBle;
  try {
    const onDisconnect = () => {};
    createBleClient({ onDisconnect });
    assert.equal(seen.onDisconnect, onDisconnect);
  } finally {
    delete globalThis.OpenDisplayBLE;
  }
});

test('createBleClient works with no options', () => {
  class FakeBle {}
  globalThis.OpenDisplayBLE = FakeBle;
  try {
    assert.ok(createBleClient() instanceof FakeBle);
  } finally {
    delete globalThis.OpenDisplayBLE;
  }
});

test('disconnectBleClient is a no-op for a null client', async () => {
  await disconnectBleClient(null);
});

test('disconnectBleClient calls through when connected', async () => {
  let called = false;
  await disconnectBleClient({ disconnect: async () => { called = true; } });
  assert.ok(called);
});

test('disconnectBleClient swallows an error from an already-dropped link', async () => {
  // Tearing down a dead connection still leaves the caller disconnected,
  // which is what it asked for, so this must not reject.
  await disconnectBleClient({
    disconnect: async () => {
      throw new Error('GATT Server is disconnected');
    },
  });
});
