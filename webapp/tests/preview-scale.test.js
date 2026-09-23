import test from 'node:test';
import assert from 'node:assert/strict';

import { fitPreviewScale } from '../src/pure/preview-scale.js';

test('the chosen scale is kept when it fits', () => {
  assert.equal(fitPreviewScale(2, 384, 1000, 1), 2);
  assert.equal(fitPreviewScale(1, 384, 384, 2), 1);
});

test('a phone steps down to whole device pixels per source pixel', () => {
  // 375px-wide phone at DPR 3: 2x (768 CSS px) does not fit in ~320px.
  // 320 * 3 / 384 = 2.5, so two device pixels each: 2/3 CSS px.
  assert.equal(fitPreviewScale(2, 384, 320, 3), 2 / 3);
  // DPR 2: 320 * 2 / 384 = 1.67, so one device pixel each.
  assert.equal(fitPreviewScale(2, 384, 320, 2), 0.5);
});

test('the result always maps a source pixel to a whole number of device pixels', () => {
  for (const dpr of [1, 2, 3, 4]) {
    for (const width of [150, 200, 320, 500, 700]) {
      const devicePixels = fitPreviewScale(2, 384, width, dpr) * dpr;
      assert.equal(Math.abs(devicePixels - Math.round(devicePixels)) < 1e-9, true);
    }
  }
});

test('it never grows past the chosen scale', () => {
  assert.equal(fitPreviewScale(1, 384, 380, 4), 3 / 4);
});

test('when nothing fits it stays at one device pixel and the frame scrolls', () => {
  assert.equal(fitPreviewScale(2, 384, 300, 1), 1);
  assert.equal(fitPreviewScale(2, 384, 100, 2), 0.5);
});

test('an unmeasured width keeps the chosen scale', () => {
  assert.equal(fitPreviewScale(2, 384, 0, 2), 2);
});
