// localStorage preference load/save, written against an injectable storage
// interface (anything with getItem/setItem/removeItem) so a fake in-memory
// storage can be used in tests without touching the real browser storage.
//
// Every read and write is wrapped in try/catch: quota errors, private-mode
// failures, or a storage object that throws on every call must all fall
// back to defaults gracefully rather than breaking the app.

const NAMESPACE = 'esphome-badge:v1';
const PREFS_KEY = `${NAMESPACE}:prefs`;
const KEY_STORAGE_KEY = `${NAMESPACE}:key`;

/**
 * @typedef {object} BadgePrefs
 * @property {string} project
 * @property {string} customWordmark
 * @property {string} customDomain
 * @property {string} customLogoDataUrl
 * @property {string} handle
 * @property {string} name
 * @property {string} qrUrl
 * @property {string} contactName
 * @property {string} contactEmail
 * @property {'cw'|'ccw'} rotation
 * @property {boolean} compensateRedYellow
 * @property {boolean} rememberKey
 * @property {string} devicePrefix
 */

/** @type {BadgePrefs} */
export const DEFAULT_PREFS = Object.freeze({
  project: 'esphome',
  customWordmark: '',
  customDomain: '',
  customLogoDataUrl: '',
  handle: '',
  name: '',
  qrUrl: '',
  contactName: '',
  contactEmail: '',
  orientation: 'landscape',
  previewScale: 2,
  rotation: 'ccw',
  compensateRedYellow: true,
  rememberKey: false,
  devicePrefix: '',
});

/**
 * A minimal storage interface: anything with getItem/setItem/removeItem
 * (the browser's window.localStorage, or a fake in-memory object in tests).
 * @typedef {object} StorageLike
 * @property {(key: string) => (string|null)} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */

/**
 * Load saved preferences, falling back to defaults for anything missing,
 * unparsable, or if the storage backend throws.
 *
 * @param {StorageLike} storage
 * @returns {BadgePrefs}
 */
export function loadPrefs(storage) {
  let stored = null;
  try {
    stored = storage.getItem(PREFS_KEY);
  } catch {
    stored = null;
  }
  if (!stored) {
    return { ...DEFAULT_PREFS };
  }
  try {
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * Save preferences. Returns whether the save succeeded (false on any thrown
 * error, e.g. quota exceeded or a storage backend that always throws).
 *
 * @param {StorageLike} storage
 * @param {BadgePrefs} prefs
 * @returns {boolean}
 */
export function savePrefs(storage, prefs) {
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/**
 * Load the persisted encryption key (only ever written when the "remember
 * key on this device" checkbox is on). Returns '' on any failure.
 *
 * @param {StorageLike} storage
 * @returns {string}
 */
export function loadStoredKey(storage) {
  try {
    return storage.getItem(KEY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * @param {StorageLike} storage
 * @param {string} keyHex
 * @returns {boolean}
 */
export function saveStoredKey(storage, keyHex) {
  try {
    storage.setItem(KEY_STORAGE_KEY, keyHex);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {StorageLike} storage
 * @returns {boolean}
 */
export function clearStoredKey(storage) {
  try {
    storage.removeItem(KEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
