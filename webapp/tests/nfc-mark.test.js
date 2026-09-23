import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  NFC_MARK_CENTER_X,
  NFC_MARK_CENTER_Y,
  NFC_MARK_END_ANGLE,
  NFC_MARK_RADII,
  NFC_MARK_START_ANGLE,
  NFC_MARK_WIDTH,
} from '../src/pure/badge-layout.js';

test('the tap mark radii are concentric and increasing', () => {
  assert.ok(NFC_MARK_RADII.length >= 3);
  assert.deepEqual([...NFC_MARK_RADII], [...NFC_MARK_RADII].sort((a, b) => a - b));
  assert.equal(new Set(NFC_MARK_RADII).size, NFC_MARK_RADII.length);
});

test('the tap mark stays inside the canvas', () => {
  const outer = Math.max(...NFC_MARK_RADII) + NFC_MARK_WIDTH;
  assert.ok(NFC_MARK_CENTER_X - outer >= 0);
  assert.ok(NFC_MARK_CENTER_X + outer <= CANVAS_WIDTH);
  assert.ok(NFC_MARK_CENTER_Y - outer >= 0);
  assert.ok(NFC_MARK_CENTER_Y + outer <= CANVAS_HEIGHT);
});

test('the tap mark opens rightward and is symmetric about the horizontal axis', () => {
  assert.ok(NFC_MARK_START_ANGLE < 0 && NFC_MARK_END_ANGLE > 0);
  assert.equal(NFC_MARK_START_ANGLE, -NFC_MARK_END_ANGLE);
  // A full circle would read as a blob, not a wave.
  assert.ok(NFC_MARK_END_ANGLE - NFC_MARK_START_ANGLE < 180);
});

test('the tap mark matches the Python renderer constants', () => {
  // Kept in sync with od_badge/badge.py by hand; this pins the values so
  // a change on one side without the other is caught here.
  assert.equal(NFC_MARK_CENTER_X, 248);
  assert.equal(NFC_MARK_CENTER_Y, 147);
  assert.deepEqual([...NFC_MARK_RADII], [4, 9, 14]);
  assert.equal(NFC_MARK_WIDTH, 2);
  assert.equal(NFC_MARK_START_ANGLE, -48);
  assert.equal(NFC_MARK_END_ANGLE, 48);
});
