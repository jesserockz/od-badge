import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEVICES_KEY,
  KEY_HEX_LENGTH,
  MAX_DEVICES,
  deleteDevice,
  findDevice,
  isValidKeyHex,
  loadDevices,
  mergeDevices,
  normaliseKeyHex,
  saveDevice,
} from '../src/pure/devices.js';

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

const KEY_A = 'A'.repeat(KEY_HEX_LENGTH);
const KEY_B = 'B'.repeat(KEY_HEX_LENGTH);

test('keys are normalised from however they were pasted', () => {
  assert.equal(normaliseKeyHex('aa:bb-cc dd'), 'AABBCCDD');
  assert.equal(normaliseKeyHex(''), '');
  assert.equal(normaliseKeyHex(null), '');
});

test('a key is valid only at exactly 32 hex characters', () => {
  assert.equal(isValidKeyHex(KEY_A), true);
  assert.equal(isValidKeyHex('AA:'.repeat(16)), true);
  assert.equal(isValidKeyHex('A'.repeat(31)), false);
  assert.equal(isValidKeyHex('A'.repeat(33)), false);
  assert.equal(isValidKeyHex('Z'.repeat(32)), false);
});

test('save then find round-trips, with the key normalised', () => {
  const storage = fakeStorage();
  assert.equal(saveDevice(storage, 'Lanyard', 'ODD8', 'aa:'.repeat(16), 1000).ok, true);
  const found = findDevice(storage, 'Lanyard');
  assert.equal(found.prefix, 'ODD8');
  assert.equal(found.key, KEY_A);
  assert.equal(found.savedAt, 1000);
});

test('an empty prefix is allowed: it means any OpenDisplay tag', () => {
  const storage = fakeStorage();
  assert.equal(saveDevice(storage, 'Any', '', KEY_A).ok, true);
  assert.equal(findDevice(storage, 'Any').prefix, '');
});

test('a device with no name or a bad key is refused', () => {
  const storage = fakeStorage();
  assert.match(saveDevice(storage, '  ', 'ODD8', KEY_A).error, /name/);
  assert.match(saveDevice(storage, 'Bad key', 'ODD8', 'nope').error, /hex characters/);
  assert.deepEqual(loadDevices(storage), []);
});

test('saving the same name replaces rather than duplicating', () => {
  const storage = fakeStorage();
  saveDevice(storage, 'Tag', 'OLD', KEY_A, 1000);
  saveDevice(storage, 'Tag', 'NEW', KEY_B, 2000);
  const devices = loadDevices(storage);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].prefix, 'NEW');
  assert.equal(devices[0].key, KEY_B);
});

test('devices come back newest first', () => {
  const storage = fakeStorage();
  saveDevice(storage, 'old', '', KEY_A, 1000);
  saveDevice(storage, 'new', '', KEY_A, 3000);
  saveDevice(storage, 'mid', '', KEY_A, 2000);
  assert.deepEqual(loadDevices(storage).map((d) => d.name), ['new', 'mid', 'old']);
});

test('delete removes one and leaves the rest', () => {
  const storage = fakeStorage();
  saveDevice(storage, 'keep', '', KEY_A, 1000);
  saveDevice(storage, 'drop', '', KEY_B, 2000);
  assert.deepEqual(deleteDevice(storage, 'drop').map((d) => d.name), ['keep']);
  assert.equal(findDevice(storage, 'drop'), null);
});

test('the device count is capped', () => {
  const storage = fakeStorage();
  for (let i = 0; i < MAX_DEVICES; i++) saveDevice(storage, `tag-${i}`, '', KEY_A, i);
  const result = saveDevice(storage, 'one too many', '', KEY_A, 9999);
  assert.equal(result.ok, false);
  assert.match(result.error, /up to/);
});

test('corrupt storage and malformed entries read as empty or are skipped', () => {
  assert.deepEqual(loadDevices(fakeStorage({ [DEVICES_KEY]: 'not json' })), []);
  assert.deepEqual(loadDevices(fakeStorage({ [DEVICES_KEY]: '{"not":"array"}' })), []);
  const stored = JSON.stringify([
    { name: 'good', key: KEY_A, prefix: 'X', savedAt: 1 },
    { name: 'no key', prefix: 'X' },
    { name: 'bad key', key: 'zz' },
    { name: '', key: KEY_A },
    null,
  ]);
  assert.deepEqual(loadDevices(fakeStorage({ [DEVICES_KEY]: stored })).map((d) => d.name), ['good']);
});

test('storage that throws reads empty and reports write failure', () => {
  const unreadable = { getItem: () => { throw new Error('x'); }, setItem: () => {}, removeItem: () => {} };
  assert.deepEqual(loadDevices(unreadable), []);
  const unwritable = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  };
  assert.match(saveDevice(unwritable, 'Tag', '', KEY_A).error, /refused to store/);
});

test('merge adds imported devices and keeps existing ones', () => {
  const storage = fakeStorage();
  saveDevice(storage, 'mine', 'M', KEY_A, 1000);
  const { devices, added } = mergeDevices(storage, [{ name: 'theirs', prefix: 'T', key: KEY_B, savedAt: 2000 }]);
  assert.equal(added, 1);
  assert.deepEqual(devices.map((d) => d.name), ['theirs', 'mine']);
});

test('merge lets an imported device update one of the same name', () => {
  const storage = fakeStorage();
  saveDevice(storage, 'Tag', 'OLD', KEY_A, 1000);
  mergeDevices(storage, [{ name: 'Tag', prefix: 'NEW', key: KEY_B, savedAt: 2000 }]);
  const devices = loadDevices(storage);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].key, KEY_B);
});

test('merge ignores rubbish instead of corrupting the library', () => {
  const storage = fakeStorage();
  saveDevice(storage, 'mine', '', KEY_A, 1000);
  for (const junk of [null, 'nope', 42, [{ name: 'x', key: 'bad' }], [{ key: KEY_A }]]) {
    const { added } = mergeDevices(storage, junk);
    assert.equal(added, 0);
  }
  assert.deepEqual(loadDevices(storage).map((d) => d.name), ['mine']);
});
