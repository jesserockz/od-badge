import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestBwryIndex, computeDitherIndices, wireMapFor, WIRE_MAP_COMPENSATED, WIRE_MAP_UNCOMPENSATED } from '../src/pure/palette.js';

test('nearestBwryIndex maps exact palette colors to their wire index (black=0, white=1, yellow=2, red=3)', () => {
  assert.equal(nearestBwryIndex(0, 0, 0), 0);
  assert.equal(nearestBwryIndex(255, 255, 255), 1);
  assert.equal(nearestBwryIndex(255, 255, 0), 2);
  assert.equal(nearestBwryIndex(255, 0, 0), 3);
});

test('nearestBwryIndex snaps a near-white brand color to white', () => {
  // #F2F4F9
  assert.equal(nearestBwryIndex(0xf2, 0xf4, 0xf9), 1);
});

test('nearestBwryIndex snaps brand cyan to the nearest palette color', () => {
  // #18BCF2 is closest to white among the 4 BWRY colors by squared distance.
  assert.equal(nearestBwryIndex(0x18, 0xbc, 0xf2), 1);
});

test('computeDitherIndices computes one index per pixel from RGBA data', () => {
  // 2 pixels: black, then red.
  const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 0, 0, 255]);
  const indices = computeDitherIndices(pixels, 2);
  assert.deepEqual(Array.from(indices), [0, 3]);
});

test('wireMapFor(true) returns the compensated map [0,1,2,3]', () => {
  assert.deepEqual(wireMapFor(true), [0, 1, 2, 3]);
  assert.deepEqual(wireMapFor(true), WIRE_MAP_COMPENSATED);
});

test('wireMapFor(false) returns upstream\'s own swapped map [0,1,3,2]', () => {
  assert.deepEqual(wireMapFor(false), [0, 1, 3, 2]);
  assert.deepEqual(wireMapFor(false), WIRE_MAP_UNCOMPENSATED);
});

test('wireMapFor returns a fresh array each call (caller cannot mutate the shared constant)', () => {
  const a = wireMapFor(true);
  a[0] = 99;
  assert.deepEqual(wireMapFor(true), [0, 1, 2, 3]);
});
