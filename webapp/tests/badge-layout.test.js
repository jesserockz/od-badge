import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fitHeroSize,
  buildLayout,
  HERO_FONT_START_SIZE,
  HERO_FONT_MIN_SIZE,
  defaultBadgeContent,
  CANVAS_WIDTH,
  UNDERLINE_Y_START,
  UNDERLINE_Y_END,
} from '../src/pure/badge-layout.js';

/**
 * A fake text measurer: width scales linearly with size and text length,
 * standing in for a real font's getbbox()/measureText().
 * @param {string} value
 * @param {number} size
 * @returns {number}
 */
function fakeMeasure(value, size) {
  return value.length * size * 0.6;
}

test('fitHeroSize returns the start size when the text already fits', () => {
  const size = fitHeroSize('hi', fakeMeasure, 1000, HERO_FONT_START_SIZE);
  assert.equal(size, HERO_FONT_START_SIZE);
});

test('fitHeroSize shrinks the size until the text fits maxWidth', () => {
  const longText = '@a_very_long_handle_indeed';
  const maxWidth = 100;
  const size = fitHeroSize(longText, fakeMeasure, maxWidth, HERO_FONT_START_SIZE);
  assert.ok(size < HERO_FONT_START_SIZE);
  assert.ok(fakeMeasure(longText, size) <= maxWidth || size === HERO_FONT_MIN_SIZE);
});

test('fitHeroSize never goes below HERO_FONT_MIN_SIZE even for text that never fits', () => {
  const size = fitHeroSize('this text will never ever fit in the available width', fakeMeasure, 1, HERO_FONT_START_SIZE);
  assert.equal(size, HERO_FONT_MIN_SIZE);
});

test('buildLayout positions the QR code 8px from the right edge', () => {
  const content = defaultBadgeContent();
  const qrPixelSize = 90;
  const layout = buildLayout(content, fakeMeasure, qrPixelSize);
  assert.equal(layout.qrX, CANVAS_WIDTH - qrPixelSize - 8);
  assert.equal(layout.qrY, 54);
  assert.equal(layout.qrPixelSize, qrPixelSize);
});

test('buildLayout computes the underline rectangle from the hero text width at the fitted size', () => {
  const content = { ...defaultBadgeContent(), handle: '@janedoe' };
  const layout = buildLayout(content, fakeMeasure, 90);
  const expectedHeroWidth = fakeMeasure(content.handle, layout.heroSize);
  assert.equal(layout.heroWidth, expectedHeroWidth);
  assert.equal(layout.underlineXStart, layout.contentX);
  assert.equal(layout.underlineXEnd, layout.contentX + expectedHeroWidth - 6);
  assert.equal(layout.underlineYStart, UNDERLINE_Y_START);
  assert.equal(layout.underlineYEnd, UNDERLINE_Y_END);
});

test('buildLayout shrinks the hero size for a wide QR code (smaller available width)', () => {
  const content = { ...defaultBadgeContent(), handle: '@a_very_long_handle_indeed' };
  const narrowLayout = buildLayout(content, fakeMeasure, 200);
  const wideLayout = buildLayout(content, fakeMeasure, 20);
  assert.ok(narrowLayout.heroSize <= wideLayout.heroSize);
});

test('the tap mark sits on the antenna edge and content moves out of its way', () => {
  const content = { ...defaultBadgeContent(), handle: '@averyverylonghandleindeed' };

  const left = buildLayout(content, fakeMeasure, 105, 'left');
  assert.ok(left.markCenterX < CANVAS_WIDTH / 2, 'left mark should be on the left');
  assert.ok(left.contentX > left.markCenterX, 'content must start right of the mark');
  assert.equal(left.markEdge, 'left');

  const right = buildLayout(content, fakeMeasure, 105, 'right');
  assert.ok(right.markCenterX > CANVAS_WIDTH / 2, 'right mark should be on the right');
  assert.ok(right.qrX + 105 < right.markCenterX, 'QR must shift left of the mark');
  assert.equal(right.markEdge, 'right');

  // Whichever side is reserved, the hero must still fit between content and QR.
  for (const layout of [left, right]) {
    assert.ok(layout.heroWidth <= layout.qrX - layout.contentX);
    assert.equal(layout.markCenterY, 84);
  }
});

test('the reserved strip does not push the hero below its minimum size', () => {
  const content = { ...defaultBadgeContent(), handle: '@averyverylonghandleindeed' };
  for (const edge of ['left', 'right']) {
    const layout = buildLayout(content, fakeMeasure, 105, edge);
    assert.ok(layout.heroSize >= HERO_FONT_MIN_SIZE);
    assert.ok(layout.heroSize <= HERO_FONT_START_SIZE);
  }
});
