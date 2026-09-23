import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNfcWriteInlineCommand,
  buildNfcWriteStartCommand,
  buildNfcWriteDataCommand,
  buildNfcWriteEndCommand,
  buildMimePayload,
  planNfcWrite,
  planVCardWrite,
  NfcRecordType,
  NFC_INLINE_MAX,
  NFC_CHUNK_SIZE,
  NFC_WRITE_MAX_TOTAL,
} from '../src/pure/nfc-commands.js';

test('buildNfcWriteInlineCommand wire format: [0x00,0x83,0x01,recType,lenHi,lenLo,...payload]', () => {
  const payload = new Uint8Array([1, 2, 3]);
  const cmd = buildNfcWriteInlineCommand(NfcRecordType.MIME, payload);
  assert.deepEqual(Array.from(cmd), [0x00, 0x83, 0x01, NfcRecordType.MIME, 0x00, 0x03, 1, 2, 3]);
});

test('buildNfcWriteStartCommand wire format: [0x00,0x83,0x10,recType,totalLenHi,totalLenLo]', () => {
  const cmd = buildNfcWriteStartCommand(NfcRecordType.MIME, 300);
  assert.deepEqual(Array.from(cmd), [0x00, 0x83, 0x10, NfcRecordType.MIME, 0x01, 0x2c]);
});

test('buildNfcWriteDataCommand wire format: [0x00,0x83,0x11,...chunk]', () => {
  const cmd = buildNfcWriteDataCommand(new Uint8Array([9, 8, 7]));
  assert.deepEqual(Array.from(cmd), [0x00, 0x83, 0x11, 9, 8, 7]);
});

test('buildNfcWriteEndCommand wire format: [0x00,0x83,0x12]', () => {
  assert.deepEqual(Array.from(buildNfcWriteEndCommand()), [0x00, 0x83, 0x12]);
});

test('buildNfcWriteDataCommand rejects an empty chunk', () => {
  assert.throws(() => buildNfcWriteDataCommand(new Uint8Array(0)), RangeError);
});

test('buildNfcWriteDataCommand rejects a chunk over NFC_CHUNK_SIZE', () => {
  assert.throws(() => buildNfcWriteDataCommand(new Uint8Array(NFC_CHUNK_SIZE + 1)), RangeError);
});

test('buildNfcWriteInlineCommand rejects an empty payload', () => {
  assert.throws(() => buildNfcWriteInlineCommand(NfcRecordType.TEXT, new Uint8Array(0)), RangeError);
});

test('buildMimePayload format: [len(mimeType), ...mimeTypeBytes, ...body]', () => {
  const body = new TextEncoder().encode('hi');
  const payload = buildMimePayload('text/vcard', body);
  assert.equal(payload[0], 'text/vcard'.length);
  assert.deepEqual(Array.from(payload.subarray(1, 1 + 'text/vcard'.length)), Array.from(new TextEncoder().encode('text/vcard')));
  assert.deepEqual(Array.from(payload.subarray(1 + 'text/vcard'.length)), Array.from(body));
});

test('buildMimePayload rejects a mime type that encodes to 0 bytes', () => {
  assert.throws(() => buildMimePayload('', new Uint8Array(0)), RangeError);
});

// --- The 120-byte inline-vs-chunked boundary ---------------------------------------

test('planNfcWrite: exactly NFC_INLINE_MAX (120) bytes stays inline', () => {
  const payload = new Uint8Array(NFC_INLINE_MAX).fill(0x41);
  const plan = planNfcWrite(NfcRecordType.TEXT, payload);
  assert.equal(plan.kind, 'inline');
  assert.equal(plan.commands.length, 1);
  assert.equal(plan.commands[0][0], 0x00);
  assert.equal(plan.commands[0][1], 0x83);
  assert.equal(plan.commands[0][2], 0x01);
});

test('planNfcWrite: NFC_INLINE_MAX + 1 (121) bytes switches to chunked', () => {
  const payload = new Uint8Array(NFC_INLINE_MAX + 1).fill(0x41);
  const plan = planNfcWrite(NfcRecordType.TEXT, payload);
  assert.equal(plan.kind, 'chunked');
  // start + 1 data chunk (121 bytes needs only one 120-byte-max chunk plus 1 leftover byte
  // -> actually two data chunks: 120 + 1) + end.
  assert.equal(plan.commands[0][2], 0x10); // start sub-opcode
  const dataCommands = plan.commands.slice(1, -1);
  assert.equal(dataCommands.length, 2);
  assert.equal(dataCommands[0].length - 3, NFC_CHUNK_SIZE);
  assert.equal(dataCommands[1].length - 3, 1);
  const last = plan.commands[plan.commands.length - 1];
  assert.equal(last[2], 0x12); // end sub-opcode
});

test('planNfcWrite: chunked payload data frames reassemble to the original payload', () => {
  const payload = new Uint8Array(400);
  for (let i = 0; i < payload.length; i++) payload[i] = i % 256;
  const plan = planNfcWrite(NfcRecordType.RAW_NDEF, payload);
  assert.equal(plan.kind, 'chunked');
  const dataCommands = plan.commands.slice(1, -1);
  const reassembled = new Uint8Array(payload.length);
  let offset = 0;
  for (const cmd of dataCommands) {
    const chunk = cmd.subarray(3);
    reassembled.set(chunk, offset);
    offset += chunk.length;
  }
  assert.deepEqual(Array.from(reassembled), Array.from(payload));
});

test('planNfcWrite rejects a payload over NFC_WRITE_MAX_TOTAL (512) bytes', () => {
  const payload = new Uint8Array(NFC_WRITE_MAX_TOTAL + 1);
  assert.throws(() => planNfcWrite(NfcRecordType.TEXT, payload), RangeError);
});

test('planNfcWrite rejects an empty payload', () => {
  assert.throws(() => planNfcWrite(NfcRecordType.TEXT, new Uint8Array(0)), RangeError);
});

test('planNfcWrite accepts exactly NFC_WRITE_MAX_TOTAL (512) bytes as chunked', () => {
  const payload = new Uint8Array(NFC_WRITE_MAX_TOTAL).fill(1);
  const plan = planNfcWrite(NfcRecordType.TEXT, payload);
  assert.equal(plan.kind, 'chunked');
});

test('planVCardWrite wraps a vCard as a text/vcard MIME record and plans it', () => {
  const plan = planVCardWrite('BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD\r\n');
  assert.equal(plan.kind, 'inline');
  const cmd = plan.commands[0];
  assert.equal(cmd[3], NfcRecordType.MIME);
});
