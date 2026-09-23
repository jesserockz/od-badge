// A library of named tags: a friendly name, the BLE name prefix, and the
// encryption key for each.
//
// Keys are stored in this browser's localStorage in plain text. There is no
// way around that for a page that has to authenticate to a tag without a
// server, so the UI says so plainly rather than implying the storage is
// protected. Nothing here ever goes into a share link.

export const DEVICES_KEY = 'od-badge:v1:devices';

/** Enough for a drawer full of tags without letting storage grow unbounded. */
export const MAX_DEVICES = 50;

/** An OpenDisplay key is AES-128: 16 bytes, written as 32 hex characters. */
export const KEY_HEX_LENGTH = 32;

/**
 * @typedef {object} SavedDevice
 * @property {string} name Friendly name, e.g. "Lanyard tag".
 * @property {string} prefix BLE device name prefix, may be empty.
 * @property {string} key 32 hex characters.
 * @property {number} savedAt Epoch milliseconds.
 */

/**
 * Normalise a key to bare uppercase hex.
 *
 * Accepts the spacing and separators people paste (colons, dashes, spaces),
 * since a key copied out of a tool is rarely already clean.
 *
 * @param {string} keyHex
 * @returns {string}
 */
export function normaliseKeyHex(keyHex) {
  return String(keyHex || '').replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

/**
 * Whether a key is usable: exactly 32 hex characters once normalised.
 *
 * @param {string} keyHex
 * @returns {boolean}
 */
export function isValidKeyHex(keyHex) {
  return normaliseKeyHex(keyHex).length === KEY_HEX_LENGTH;
}

/**
 * Read every saved device, newest first.
 *
 * Returns an empty list rather than throwing if storage is unavailable or
 * holds something unparsable: one corrupt entry should not break the app.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @returns {SavedDevice[]}
 */
export function loadDevices(storage) {
  let raw;
  try {
    raw = storage.getItem(DEVICES_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.name === 'string' &&
        entry.name !== '' &&
        isValidKeyHex(entry.key),
    )
    .map((entry) => ({
      name: entry.name,
      prefix: typeof entry.prefix === 'string' ? entry.prefix : '',
      key: normaliseKeyHex(entry.key),
      savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : 0,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Persist a list of devices.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @param {SavedDevice[]} devices
 * @returns {boolean} False if storage rejected the write.
 */
export function saveDevices(storage, devices) {
  try {
    storage.setItem(DEVICES_KEY, JSON.stringify(devices.slice(0, MAX_DEVICES)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Save a tag under a friendly name, replacing any existing one with that name.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @param {string} name
 * @param {string} prefix
 * @param {string} keyHex
 * @param {number} [now] Injectable clock, so tests are not time-dependent.
 * @returns {{ok: boolean, devices: SavedDevice[], error?: string}}
 */
export function saveDevice(storage, name, prefix, keyHex, now = Date.now()) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    return { ok: false, devices: loadDevices(storage), error: 'Give the device a name first.' };
  }
  if (!isValidKeyHex(keyHex)) {
    return {
      ok: false,
      devices: loadDevices(storage),
      error: `The key must be ${KEY_HEX_LENGTH} hex characters.`,
    };
  }
  const existing = loadDevices(storage).filter((device) => device.name !== trimmedName);
  if (existing.length >= MAX_DEVICES) {
    return {
      ok: false,
      devices: existing,
      error: `You can keep up to ${MAX_DEVICES} devices. Delete one first.`,
    };
  }
  const devices = [
    {
      name: trimmedName,
      prefix: String(prefix || '').trim(),
      key: normaliseKeyHex(keyHex),
      savedAt: now,
    },
    ...existing,
  ];
  if (!saveDevices(storage, devices)) {
    return { ok: false, devices: existing, error: 'Could not save: this browser refused to store it.' };
  }
  return { ok: true, devices };
}

/**
 * Delete a device by name.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @param {string} name
 * @returns {SavedDevice[]} The remaining devices.
 */
export function deleteDevice(storage, name) {
  const remaining = loadDevices(storage).filter((device) => device.name !== name);
  saveDevices(storage, remaining);
  return remaining;
}

/**
 * Find a device by name.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @param {string} name
 * @returns {SavedDevice|null}
 */
export function findDevice(storage, name) {
  return loadDevices(storage).find((device) => device.name === name) || null;
}

/**
 * Merge an imported device list into the stored one.
 *
 * Imported entries win on a name clash, so re-importing an updated config
 * behaves like an update rather than silently keeping the old key.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @param {unknown} incoming
 * @returns {{devices: SavedDevice[], added: number}}
 */
export function mergeDevices(storage, incoming) {
  if (!Array.isArray(incoming)) return { devices: loadDevices(storage), added: 0 };
  const valid = incoming
    .filter(
      (entry) =>
        entry && typeof entry === 'object' && typeof entry.name === 'string' && isValidKeyHex(entry.key),
    )
    .map((entry) => ({
      name: entry.name.trim(),
      prefix: typeof entry.prefix === 'string' ? entry.prefix : '',
      key: normaliseKeyHex(entry.key),
      savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : 0,
    }))
    .filter((entry) => entry.name !== '');

  const incomingNames = new Set(valid.map((entry) => entry.name));
  const kept = loadDevices(storage).filter((device) => !incomingNames.has(device.name));
  const devices = [...valid, ...kept].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_DEVICES);
  saveDevices(storage, devices);
  return { devices, added: valid.length };
}
