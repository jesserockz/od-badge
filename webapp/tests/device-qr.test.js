import test from 'node:test';
import assert from 'node:assert/strict';

import { PAYLOAD_SIZE, parseDeviceQr } from '../src/pure/device-qr.js';

// Canonical vector from py-opendisplay's landing tests / the firmware boot
// screen: tag_type 0, device OD4B3F63, key all 0x12, manufacturer 3 (SOLUM).
const CANONICAL_PAYLOAD = 'AABLP2MSEhISEhISEhISEhISEhISAAM';
const CANONICAL_URL = `https://opendisplay.org/l/?${CANONICAL_PAYLOAD}`;

/** Encode a payload the way the firmware does: unpadded base64url. */
function encode(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

test('parses the canonical firmware QR code', () => {
  const result = parseDeviceQr(CANONICAL_URL);
  assert.deepEqual(result, {
    ok: true,
    device: { deviceName: 'OD4B3F63', key: '12'.repeat(16), tagType: 0, manufacturerId: 3 },
  });
});

test('reads every field at its documented offset, big-endian', () => {
  const bytes = new Uint8Array(PAYLOAD_SIZE);
  bytes.set([0x01, 0x02], 0);
  bytes.set([0xaa, 0xbb, 0xcc], 2);
  bytes.set(Array.from({ length: 16 }, (_, i) => i), 5);
  bytes.set([0x00, 0x04], 21);
  const result = parseDeviceQr(`https://opendisplay.org/l/?${encode(bytes)}`);
  assert.equal(result.ok, true);
  assert.deepEqual(result.device, {
    deviceName: 'ODAABBCC',
    key: '000102030405060708090A0B0C0D0E0F',
    tagType: 0x0102,
    manufacturerId: 4,
  });
});

test('an all-zero key (hidden or unset on the tag) comes back empty', () => {
  const bytes = new Uint8Array(PAYLOAD_SIZE);
  bytes.set([0x12, 0x34, 0x56], 2);
  const result = parseDeviceQr(`https://opendisplay.org/l/?${encode(bytes)}`);
  assert.equal(result.ok, true);
  assert.equal(result.device.deviceName, 'OD123456');
  assert.equal(result.device.key, '');
});

test('accepts the URL variants people end up with', () => {
  for (const text of [
    `  ${CANONICAL_URL}\n`,
    `http://opendisplay.org/l/?${CANONICAL_PAYLOAD}`,
    `https://www.opendisplay.org/l/?${CANONICAL_PAYLOAD}`,
    `https://OpenDisplay.org/l?${CANONICAL_PAYLOAD}`,
    CANONICAL_PAYLOAD,
  ]) {
    const result = parseDeviceQr(text);
    assert.equal(result.ok, true, text);
    assert.equal(result.device.deviceName, 'OD4B3F63', text);
  }
});

test('rejects QR codes that are not OpenDisplay deep links', () => {
  for (const text of [
    '',
    'hello world',
    'https://example.com/l/?AABLP2MSEhISEhISEhISEhISEhISAAM',
    'https://opendisplay.org/other/?AABLP2MSEhISEhISEhISEhISEhISAAM',
    'https://opendisplay.org/l/',
    'BEGIN:VCARD',
  ]) {
    const result = parseDeviceQr(text);
    assert.equal(result.ok, false, text);
    assert.match(result.error, /OpenDisplay/);
  }
});

test('rejects a payload of the wrong length', () => {
  for (const payload of [CANONICAL_PAYLOAD.slice(0, -4), `${CANONICAL_PAYLOAD}AAAA`, 'A', '00112233445566778899AABBCCDDEEFF']) {
    const result = parseDeviceQr(`https://opendisplay.org/l/?${payload}`);
    assert.equal(result.ok, false, payload);
  }
});
