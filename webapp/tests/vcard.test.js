import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVCard, escapeValue, splitName, VCARD_LINE_ENDING } from '../src/pure/vcard.js';

test('escapeValue escapes backslash first, then ; , and newline', () => {
  // If backslash were escaped last, the backslashes just added for ; , \n
  // would themselves get doubled -- this input exercises that trap.
  assert.equal(escapeValue('a\\b;c,d\ne'), 'a\\\\b\\;c\\,d\\ne');
});

test('escapeValue leaves plain text untouched', () => {
  assert.equal(escapeValue('Jane Doe'), 'Jane Doe');
});

test('splitName splits the last token off as family name', () => {
  assert.deepEqual(splitName('Jane Doe'), ['Doe', 'Jane']);
});

test('splitName treats a single-token name as given-name only', () => {
  assert.deepEqual(splitName('Jane'), ['', 'Jane']);
});

test('splitName treats a multi-word given name correctly', () => {
  assert.deepEqual(splitName('Mary Jane Watson'), ['Watson', 'Mary Jane']);
});

test('buildVCard omits empty optional fields (nickname, url)', () => {
  const card = buildVCard({ name: 'Jane', email: 'jane@example.com' });
  assert.ok(!card.includes('NICKNAME'));
  assert.ok(!card.includes('URL:'));
  assert.ok(card.includes('EMAIL;TYPE=INTERNET:jane@example.com'));
});

test('buildVCard omits EMAIL when email is empty', () => {
  const card = buildVCard({ name: 'Jane', email: '' });
  assert.ok(!card.includes('EMAIL'));
});

test('buildVCard includes nickname and url when present', () => {
  const card = buildVCard({ name: 'Jane Doe', email: 'jane@example.com', url: 'https://github.com/janedoe', nickname: 'janedoe' });
  assert.ok(card.includes('NICKNAME:janedoe'));
  assert.ok(card.includes('URL:https://github.com/janedoe'));
});

test('buildVCard uses CRLF line endings throughout, including the trailing line', () => {
  const card = buildVCard({ name: 'Jane', email: 'jane@example.com' });
  assert.equal(VCARD_LINE_ENDING, '\r\n');
  const lines = card.split('\r\n');
  // Every line except the final empty one (trailing CRLF) is a real vCard line.
  assert.equal(lines[lines.length - 1], '');
  assert.ok(card.includes('BEGIN:VCARD\r\nVERSION:3.0\r\n'));
  // No bare \n should appear anywhere outside of a \r\n pair.
  assert.ok(!card.replace(/\r\n/g, '').includes('\n'));
});

test('buildVCard structure: BEGIN/VERSION/N/FN first, END last', () => {
  const card = buildVCard({ name: 'Jane Doe', email: 'jane@example.com' });
  const lines = card.split('\r\n').filter((l) => l.length > 0);
  assert.equal(lines[0], 'BEGIN:VCARD');
  assert.equal(lines[1], 'VERSION:3.0');
  assert.equal(lines[2], 'N:Doe;Jane;;;');
  assert.equal(lines[3], 'FN:Jane Doe');
  assert.equal(lines[lines.length - 1], 'END:VCARD');
});

test('buildVCard escapes special characters in name and nickname', () => {
  const card = buildVCard({ name: 'Jane; Doe, Jr.', email: '', nickname: 'a\\b' });
  assert.ok(card.includes('FN:Jane\\; Doe\\, Jr.'));
  assert.ok(card.includes('NICKNAME:a\\\\b'));
});

test('buildVCard defaults name/email when not provided', () => {
  const card = buildVCard({});
  assert.ok(card.includes('FN:Jane'));
  assert.ok(card.includes('EMAIL;TYPE=INTERNET:jane@example.com'));
});

test('buildVCard matches od_badge.vcard.build_vcard byte-for-byte for the same inputs', () => {
  // Reference output captured from:
  //   uv run python -c "from od_badge.vcard import *; print(repr(build_vcard(
  //       VCardContact(url='https://github.com/janedoe', nickname='janedoe'))))"
  const pythonReference =
    'BEGIN:VCARD\r\nVERSION:3.0\r\nN:;Jane;;;\r\nFN:Jane\r\nNICKNAME:janedoe\r\nEMAIL;TYPE=INTERNET:jane@example.com\r\nURL:https://github.com/janedoe\r\nEND:VCARD\r\n';
  const card = buildVCard({ url: 'https://github.com/janedoe', nickname: 'janedoe' });
  assert.equal(card, pythonReference);
});
