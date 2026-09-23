// Parse the QR code an OpenDisplay tag shows on its boot screen.
//
// The firmware renders a deep link of the form
//
//     https://opendisplay.org/l/?<base64url(payload)>
//
// where payload is a fixed 23-byte, big-endian identity blob (see
// py-opendisplay's landing.py and the firmware's boot_screen.cpp):
//
//     offset  size  field
//     0       2     tag_type         u16
//     2       3     device id        the "OD######" BLE name
//     5       16    AES key          all-zero when the key is hidden or unset
//     21      2     manufacturer_id  u16 (OpenDisplay enum, not the BLE id)
//
// The base64url is unpadded. The key is only included when the tag's
// "show key on screen" security flag is set; otherwise it is all zeros.

import { KEY_HEX_LENGTH } from './devices.js';

export const LANDING_HOST = 'opendisplay.org';
export const LANDING_PATH = '/l/';
export const PAYLOAD_SIZE = 23;

/**
 * @typedef {object} DeviceQr
 * @property {string} deviceName The BLE name, e.g. "OD4B3F63".
 * @property {string} key 32 uppercase hex characters, or '' if the QR carried none.
 * @property {number} tagType
 * @property {number} manufacturerId
 */

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function toHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Decode unpadded base64url, or return null if it is not valid.
 *
 * @param {string} text
 * @returns {Uint8Array|null}
 */
function decodeBase64Url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  let binary;
  try {
    binary = atob(base64);
  } catch {
    return null;
  }
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Pull the base64url payload out of scanned QR text.
 *
 * Accepts the full deep link (any scheme, with or without "www."), or the
 * bare payload on its own, since that is what people end up pasting.
 *
 * @param {string} text
 * @returns {string|null}
 */
function extractPayload(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host !== LANDING_HOST) return null;
  if (url.pathname !== LANDING_PATH && url.pathname !== '/l') return null;
  // The payload is the whole query string, not a key=value pair.
  return url.search.replace(/^\?/, '') || null;
}

/**
 * Parse the text of an OpenDisplay boot-screen QR code.
 *
 * @param {string} text
 * @returns {{ok: true, device: DeviceQr} | {ok: false, error: string}}
 */
export function parseDeviceQr(text) {
  const payload = extractPayload(text);
  if (payload === null) {
    return { ok: false, error: 'That is not an OpenDisplay device QR code.' };
  }
  const bytes = decodeBase64Url(payload);
  if (!bytes || bytes.length !== PAYLOAD_SIZE) {
    return { ok: false, error: 'That OpenDisplay QR code is malformed.' };
  }
  const keyBytes = bytes.slice(5, 21);
  const key = keyBytes.every((b) => b === 0) ? '' : toHex(keyBytes);
  return {
    ok: true,
    device: {
      deviceName: `OD${toHex(bytes.slice(2, 5))}`,
      key: key.length === KEY_HEX_LENGTH ? key : '',
      tagType: (bytes[0] << 8) | bytes[1],
      manufacturerId: (bytes[21] << 8) | bytes[22],
    },
  };
}
