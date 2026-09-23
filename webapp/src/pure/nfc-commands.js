// Ported from the installed py-opendisplay library's
// opendisplay/protocol/commands.py (build_nfc_write_inline_command,
// build_nfc_write_start_command, build_nfc_write_data_command,
// build_nfc_write_end_command) and opendisplay/device.py (write_nfc,
// write_nfc_mime), plus the NfcRecordType enum from
// opendisplay/models/enums.py. No DOM or navigator.bluetooth references:
// this module only builds byte arrays, it never talks to a radio.

/** NFC_ENDPOINT command opcode (0x0083), big-endian 2 bytes. */
export const NFC_ENDPOINT_COMMAND = 0x0083;

/** NDEF record types for the NFC write endpoint (command 0x0083). */
export const NfcRecordType = Object.freeze({
  TEXT: 0,
  URI: 1,
  WELL_KNOWN_RAW: 2,
  MIME: 3,
  RAW_NDEF: 4,
});

/** Sub-opcodes for the NFC_ENDPOINT command. */
const NFC_SUB_WRITE_INLINE = 0x01;
const NFC_SUB_WRITE_START = 0x10;
const NFC_SUB_WRITE_DATA = 0x11;
const NFC_SUB_WRITE_END = 0x12;

/** Firmware policy: payloads at or below this size use a single inline write. */
export const NFC_INLINE_MAX = 120;

/** Maximum bytes per NFC_SUB_WRITE_DATA chunk. */
export const NFC_CHUNK_SIZE = 120;

/** Firmware hard limit on total NDEF payload size. */
export const NFC_WRITE_MAX_TOTAL = 512;

/**
 * @param {number} value
 * @param {number} max
 * @returns {Uint8Array} value packed big-endian into ``bytesLen`` bytes.
 */
function packBigEndian(value, bytesLen) {
  const out = new Uint8Array(bytesLen);
  for (let i = 0; i < bytesLen; i++) {
    out[bytesLen - 1 - i] = (value >> (8 * i)) & 0xff;
  }
  return out;
}

/**
 * @param {...(Uint8Array|number[])} chunks
 * @returns {Uint8Array}
 */
function concatBytes(...chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Build an NFC_ENDPOINT inline write (sub-opcode 0x01).
 *
 * Wire: [0x00][0x83][0x01][rec_type:1][len:2 BE][payload]
 *
 * @param {number} recType NDEF record type (see NfcRecordType), 0..255.
 * @param {Uint8Array} payload Record payload bytes.
 * @returns {Uint8Array}
 */
export function buildNfcWriteInlineCommand(recType, payload) {
  if (!Number.isInteger(recType) || recType < 0 || recType > 0xff) {
    throw new RangeError(`rec_type out of uint8 range: ${recType}`);
  }
  if (payload.length === 0) {
    throw new RangeError('payload must not be empty');
  }
  if (payload.length > 0xffff) {
    throw new RangeError(`payload length ${payload.length} exceeds uint16 range`);
  }
  return concatBytes(
    packBigEndian(NFC_ENDPOINT_COMMAND, 2),
    [NFC_SUB_WRITE_INLINE, recType],
    packBigEndian(payload.length, 2),
    payload,
  );
}

/**
 * Build an NFC_ENDPOINT chunked-write start (sub-opcode 0x10).
 *
 * Wire: [0x00][0x83][0x10][rec_type:1][total_len:2 BE]
 *
 * @param {number} recType NDEF record type (see NfcRecordType), 0..255.
 * @param {number} totalLen Total payload size the following DATA chunks will carry, 1..NFC_WRITE_MAX_TOTAL.
 * @returns {Uint8Array}
 */
export function buildNfcWriteStartCommand(recType, totalLen) {
  if (!Number.isInteger(recType) || recType < 0 || recType > 0xff) {
    throw new RangeError(`rec_type out of uint8 range: ${recType}`);
  }
  if (!Number.isInteger(totalLen) || totalLen < 1 || totalLen > NFC_WRITE_MAX_TOTAL) {
    throw new RangeError(`total_len must be 1..${NFC_WRITE_MAX_TOTAL}, got ${totalLen}`);
  }
  return concatBytes(packBigEndian(NFC_ENDPOINT_COMMAND, 2), [NFC_SUB_WRITE_START, recType], packBigEndian(totalLen, 2));
}

/**
 * Build an NFC_ENDPOINT chunked-write data frame (sub-opcode 0x11).
 *
 * Wire: [0x00][0x83][0x11][bytes]
 *
 * @param {Uint8Array} chunk Chunk payload bytes, 1..NFC_CHUNK_SIZE.
 * @returns {Uint8Array}
 */
export function buildNfcWriteDataCommand(chunk) {
  if (chunk.length === 0) {
    throw new RangeError('chunk must not be empty');
  }
  if (chunk.length > NFC_CHUNK_SIZE) {
    throw new RangeError(`chunk size ${chunk.length} exceeds maximum ${NFC_CHUNK_SIZE}`);
  }
  return concatBytes(packBigEndian(NFC_ENDPOINT_COMMAND, 2), [NFC_SUB_WRITE_DATA], chunk);
}

/**
 * Build an NFC_ENDPOINT chunked-write end / commit (sub-opcode 0x12).
 *
 * Wire: [0x00][0x83][0x12]
 *
 * @returns {Uint8Array}
 */
export function buildNfcWriteEndCommand() {
  return concatBytes(packBigEndian(NFC_ENDPOINT_COMMAND, 2), [NFC_SUB_WRITE_END]);
}

/**
 * Build a MIME NDEF record payload: bytes([len(mimeType)]) + mimeType + body.
 *
 * Confirmed against opendisplay/device.py's write_nfc_mime.
 *
 * @param {string} mimeType MIME type string (e.g. "text/vcard"). Must encode to 1..255 UTF-8 bytes.
 * @param {Uint8Array} bodyBytes Record body bytes.
 * @returns {Uint8Array}
 */
export function buildMimePayload(mimeType, bodyBytes) {
  const mimeBytes = new TextEncoder().encode(mimeType);
  if (mimeBytes.length < 1 || mimeBytes.length > 255) {
    throw new RangeError(`mime_type must encode to 1..255 bytes, got ${mimeBytes.length}`);
  }
  return concatBytes([mimeBytes.length], mimeBytes, bodyBytes);
}

/**
 * @typedef {object} NfcWritePlan
 * @property {'inline'|'chunked'} kind
 * @property {Uint8Array[]} commands The exact sequence of command frames to send, in order.
 */

/**
 * Plan the exact command sequence for writing ``payload`` as NDEF record
 * ``recType``, mirroring opendisplay/device.py's write_nfc(): payloads up to
 * NFC_INLINE_MAX (120) bytes go out as a single inline write; larger
 * payloads (up to NFC_WRITE_MAX_TOTAL, 512 bytes) go out as a start frame,
 * one or more NFC_CHUNK_SIZE (120) byte data frames, and an end frame.
 *
 * @param {number} recType NDEF record type (see NfcRecordType).
 * @param {Uint8Array} payload Record payload bytes, 1..NFC_WRITE_MAX_TOTAL.
 * @returns {NfcWritePlan}
 */
export function planNfcWrite(recType, payload) {
  if (payload.length < 1 || payload.length > NFC_WRITE_MAX_TOTAL) {
    throw new RangeError(`payload length must be 1..${NFC_WRITE_MAX_TOTAL}, got ${payload.length}`);
  }

  if (payload.length <= NFC_INLINE_MAX) {
    return { kind: 'inline', commands: [buildNfcWriteInlineCommand(recType, payload)] };
  }

  const commands = [buildNfcWriteStartCommand(recType, payload.length)];
  for (let offset = 0; offset < payload.length; offset += NFC_CHUNK_SIZE) {
    commands.push(buildNfcWriteDataCommand(payload.subarray(offset, offset + NFC_CHUNK_SIZE)));
  }
  commands.push(buildNfcWriteEndCommand());
  return { kind: 'chunked', commands };
}

/**
 * Plan the command sequence for writing a vCard as a text/vcard MIME record.
 *
 * @param {string} vcardText The vCard string (see pure/vcard.js buildVCard).
 * @returns {NfcWritePlan}
 */
export function planVCardWrite(vcardText) {
  const body = new TextEncoder().encode(vcardText);
  const payload = buildMimePayload('text/vcard', body);
  return planNfcWrite(NfcRecordType.MIME, payload);
}
