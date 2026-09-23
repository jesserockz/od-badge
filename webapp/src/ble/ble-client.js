// Thin wrapper around the vendored OpenDisplayBLE class
// (webapp/vendor/js/ble-common.js, loaded as a classic <script> before any
// module script runs, so `OpenDisplayBLE` resolves as a global). This file
// deliberately contains no BLE/crypto protocol logic of its own -- all of
// that comes from the vendored library. It only adapts the small surface
// this app's UI needs (connect, authenticate, send a badge, disconnect) and
// gives a clear error when Web Bluetooth itself is unavailable.

/**
 * @returns {boolean} Whether the browser exposes the Web Bluetooth API at all.
 */
export function isWebBluetoothSupported() {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

/**
 * Resolve the vendored OpenDisplayBLE constructor, or null if it is absent.
 *
 * ble-common.js declares `class OpenDisplayBLE` at the top level of a classic
 * script. A top-level class declaration binds into the global LEXICAL
 * environment, not onto `window`, so `window.OpenDisplayBLE` is always
 * undefined even when the script loaded fine. The bare identifier does
 * resolve from module code, and `typeof` on an undeclared name is safe
 * (it returns "undefined" rather than throwing), so probe that first.
 *
 * By contrast pako and QRCode are var/function declarations, which do become
 * window properties. That is why only this one needed the lexical lookup.
 *
 * @returns {any|null}
 */
export function resolveBleConstructor() {
  // eslint-disable-next-line no-undef
  if (typeof OpenDisplayBLE !== 'undefined') {
    // eslint-disable-next-line no-undef
    return OpenDisplayBLE;
  }
  if (typeof globalThis !== 'undefined' && globalThis.OpenDisplayBLE) {
    return globalThis.OpenDisplayBLE;
  }
  return null;
}

/**
 * Create a new OpenDisplayBLE client instance.
 *
 * @returns {any} An OpenDisplayBLE instance (see vendor/js/ble-common.js).
 */
export function createBleClient(options = {}) {
  const Ctor = resolveBleConstructor();
  if (!Ctor) {
    throw new Error('vendored ble-common.js (webapp/vendor/js/ble-common.js) not loaded');
  }
  return new Ctor(options);
}

/**
 * Disconnect, swallowing errors from a link that has already dropped.
 *
 * Tearing down a connection that is already gone is not a failure worth
 * surfacing: either way the caller ends up disconnected, which is what it
 * asked for.
 *
 * @param {any} bleClient
 * @returns {Promise<void>}
 */
export async function disconnectBleClient(bleClient) {
  if (!bleClient) return;
  try {
    await bleClient.disconnect();
  } catch {
    // Already down; nothing to report.
  }
}

/**
 * Connect to a device (opening the browser's Bluetooth device chooser) and
 * authenticate with the given key.
 *
 * @param {any} bleClient An OpenDisplayBLE instance.
 * @param {string} namePrefix Device name prefix filter for the chooser.
 * @param {Uint8Array} keyBytes 16-byte encryption key.
 * @returns {Promise<void>}
 */
export async function connectAndAuthenticate(bleClient, namePrefix, keyBytes) {
  await bleClient.connect(namePrefix || null);
  // Passing a getUrlKey function that returns the already-entered key avoids
  // ensureAuthenticated()'s fallback of calling the browser's blocking
  // prompt() for a key when none is supplied.
  await bleClient.ensureAuthenticated(() => keyBytes);
}

/**
 * Send a rendered panel-orientation canvas to the display.
 *
 * Computes ditherIndices ourselves (the badge is already exact flat BWRY
 * colours, so this is a nearest-palette match per pixel, not real
 * dithering) and passes them together with a ditherWireMap, which makes the
 * vendored library's buildWireCodes() use them directly instead of running
 * its own colorScheme-3 detection/swap logic (see palette.js wireMapFor()
 * for the red/yellow compensation this bypasses).
 *
 * @param {any} bleClient An authenticated OpenDisplayBLE instance.
 * @param {HTMLCanvasElement} panelCanvas The rotated 168x384 panel-orientation canvas.
 * @param {Uint8Array} ditherIndices One palette index (0-3) per pixel, row-major.
 * @param {number[]} ditherWireMap
 * @param {{onProgress?: (...args: any[]) => void, onComplete?: (...args: any[]) => void, onStatusChange?: (...args: any[]) => void}} callbacks
 * @returns {Promise<void>}
 */
export async function sendBadgeToDisplay(bleClient, panelCanvas, ditherIndices, ditherWireMap, callbacks = {}) {
  const PANEL_IC_TYPE_0X1E = 0x1e;
  const COLOR_SCHEME_BWRY = 3;
  await bleClient.sendCanvasToDisplay(panelCanvas, COLOR_SCHEME_BWRY, {
    panelIcType: PANEL_IC_TYPE_0X1E,
    ditherIndices,
    ditherWireMap,
    onProgress: callbacks.onProgress,
    onComplete: callbacks.onComplete,
    onStatusChange: callbacks.onStatusChange,
  });
}

/**
 * Parse a 32-hex-character encryption key string into 16 bytes.
 *
 * @param {string} hexString
 * @returns {Uint8Array}
 */
export function parseKeyHex(hexString) {
  const cleaned = hexString.replace(/[^0-9A-Fa-f]/g, '');
  if (cleaned.length !== 32) {
    throw new Error('Encryption key must be exactly 32 hex characters (16 bytes)');
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return bytes;
}
