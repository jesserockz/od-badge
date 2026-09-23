import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPrefs, savePrefs, loadStoredKey, saveStoredKey, clearStoredKey, DEFAULT_PREFS } from '../src/pure/prefs.js';

/**
 * A minimal in-memory storage implementation matching the StorageLike shape.
 * @returns {{getItem: (k: string) => string|null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void}}
 */
function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

/**
 * A storage stand-in that throws on every operation, simulating a browser
 * that blocks storage access entirely (e.g. some private-mode configurations).
 * @returns {{getItem: () => never, setItem: () => never, removeItem: () => never}}
 */
function makeThrowingStorage() {
  return {
    getItem: () => {
      throw new Error('storage disabled');
    },
    setItem: () => {
      throw new Error('storage disabled');
    },
    removeItem: () => {
      throw new Error('storage disabled');
    },
  };
}

test('loadPrefs returns defaults when nothing is stored', () => {
  const storage = makeMemoryStorage();
  assert.deepEqual(loadPrefs(storage), DEFAULT_PREFS);
});

test('savePrefs then loadPrefs round-trips a full prefs object', () => {
  const storage = makeMemoryStorage();
  const prefs = { ...DEFAULT_PREFS, handle: '@someone', rotation: 'cw', compensateRedYellow: false };
  const saved = savePrefs(storage, prefs);
  assert.equal(saved, true);
  assert.deepEqual(loadPrefs(storage), prefs);
});

test('loadPrefs fills in missing fields from defaults (forward compatible with older saved prefs)', () => {
  const storage = makeMemoryStorage();
  storage.setItem('esphome-badge:v1:prefs', JSON.stringify({ handle: '@partial' }));
  const loaded = loadPrefs(storage);
  assert.equal(loaded.handle, '@partial');
  assert.equal(loaded.name, DEFAULT_PREFS.name);
});

test('loadPrefs falls back to defaults on unparsable stored JSON', () => {
  const storage = makeMemoryStorage();
  storage.setItem('esphome-badge:v1:prefs', 'not json{{{');
  assert.deepEqual(loadPrefs(storage), DEFAULT_PREFS);
});

test('loadPrefs falls back to defaults when storage.getItem throws', () => {
  const storage = makeThrowingStorage();
  assert.deepEqual(loadPrefs(storage), DEFAULT_PREFS);
});

test('savePrefs returns false (and does not throw) when storage.setItem throws', () => {
  const storage = makeThrowingStorage();
  assert.equal(savePrefs(storage, DEFAULT_PREFS), false);
});

test('encryption key: saveStoredKey then loadStoredKey round-trips', () => {
  const storage = makeMemoryStorage();
  assert.equal(saveStoredKey(storage, '00112233445566778899aabbccddeeff'), true);
  assert.equal(loadStoredKey(storage), '00112233445566778899aabbccddeeff');
});

test('encryption key: loadStoredKey returns empty string when nothing is stored', () => {
  const storage = makeMemoryStorage();
  assert.equal(loadStoredKey(storage), '');
});

test('encryption key: loadStoredKey returns empty string when storage throws', () => {
  assert.equal(loadStoredKey(makeThrowingStorage()), '');
});

test('encryption key: saveStoredKey returns false when storage throws', () => {
  assert.equal(saveStoredKey(makeThrowingStorage(), 'abc'), false);
});

test('encryption key: clearStoredKey removes a previously saved key', () => {
  const storage = makeMemoryStorage();
  saveStoredKey(storage, 'abc123');
  assert.equal(clearStoredKey(storage), true);
  assert.equal(loadStoredKey(storage), '');
});

test('encryption key: clearStoredKey returns false when storage throws', () => {
  assert.equal(clearStoredKey(makeThrowingStorage()), false);
});
