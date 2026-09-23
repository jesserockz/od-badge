import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPortraitLayout,
  fitTextSize,
  PORTRAIT_HEIGHT,
  PORTRAIT_MARGIN,
  PORTRAIT_NFC_MARK_RADII,
  PORTRAIT_QR_Y,
  PORTRAIT_WIDTH,
  PORTRAIT_WORDMARK_MIN_SIZE,
  PORTRAIT_WORDMARK_START_SIZE,
  PORTRAIT_CENTER_X,
  PORTRAIT_LOGO_SIZE,
  PORTRAIT_LOGO_Y,
  PORTRAIT_BAND_HEIGHT,
  PORTRAIT_RULE_HEIGHT,
  PORTRAIT_WORDMARK_Y,
  PORTRAIT_DOMAIN_Y,
  PORTRAIT_HERO_Y,
  PORTRAIT_UNDERLINE_Y_START,
  PORTRAIT_NAME_Y,
  PORTRAIT_NFC_MARK_WIDTH,
  PORTRAIT_FOOTER_HEIGHT,
} from '../src/pure/badge-layout-portrait.js';

/** Crude proportional measurer: good enough to exercise the fitting logic. */
const measure = (text, size) => text.length * size * 0.58;
const measureByFont = (text, size) => measure(text, size);

const content = {
  handle: '',
  wordmark: 'ESPHOME',
  domain: 'esphome.io',
};

test('portrait canvas is the panel native size', () => {
  assert.equal(PORTRAIT_WIDTH, 168);
  assert.equal(PORTRAIT_HEIGHT, 384);
});

test('fitTextSize shrinks until the text fits', () => {
  const size = fitTextSize('WIDE TEXT HERE', measure, 50, 30, 6);
  assert.ok(size < 30);
  assert.ok(measure('WIDE TEXT HERE', size) <= 50);
});

test('fitTextSize respects its floor rather than shrinking forever', () => {
  const size = fitTextSize('X'.repeat(500), measure, 10, 30, 9);
  assert.equal(size, 9);
});

test('fitTextSize leaves text that already fits alone', () => {
  assert.equal(fitTextSize('OK', measure, 999, 20, 8), 20);
});

test('a long wordmark is shrunk to fit the band', () => {
  const layout = buildPortraitLayout(
    { ...content, wordmark: 'MUSIC ASSISTANT' },
    measureByFont,
    105,
  );
  const available = PORTRAIT_WIDTH - PORTRAIT_MARGIN * 2;
  assert.ok(layout.wordmarkSize <= PORTRAIT_WORDMARK_START_SIZE);
  assert.ok(layout.wordmarkSize >= PORTRAIT_WORDMARK_MIN_SIZE);
  assert.ok(measure('MUSIC ASSISTANT', layout.wordmarkSize) <= available);
});

test('a short wordmark keeps the full size', () => {
  const layout = buildPortraitLayout({ ...content, wordmark: 'HA' }, measureByFont, 105);
  assert.equal(layout.wordmarkSize, PORTRAIT_WORDMARK_START_SIZE);
});

test('the QR is horizontally centred', () => {
  const qrSize = 105;
  const layout = buildPortraitLayout(content, measureByFont, qrSize);
  const leftGap = layout.qrX;
  const rightGap = PORTRAIT_WIDTH - (layout.qrX + qrSize);
  assert.ok(Math.abs(leftGap - rightGap) <= 1);
  assert.ok(layout.qrX >= 0);
});

test('the hero shrinks to fit the narrow canvas', () => {
  const layout = buildPortraitLayout(content, measureByFont, 105);
  const available = PORTRAIT_WIDTH - PORTRAIT_MARGIN * 2;
  assert.ok(measure(content.handle, layout.heroSize) <= available);
});

test('a very long handle still fits inside the canvas', () => {
  const layout = buildPortraitLayout(
    { ...content, handle: '@averyverylonghandleindeed' },
    measureByFont,
    105,
  );
  const available = PORTRAIT_WIDTH - PORTRAIT_MARGIN * 2;
  assert.ok(measure('@averyverylonghandleindeed', layout.heroSize) <= available);
});

test('the tap mark sits below the QR and inside the canvas', () => {
  const qrSize = 105;
  const layout = buildPortraitLayout(content, measureByFont, qrSize);
  const outer = Math.max(...PORTRAIT_NFC_MARK_RADII);
  assert.ok(layout.nfcCenterY - outer > PORTRAIT_QR_Y + qrSize);
  assert.ok(layout.nfcCenterY + outer < PORTRAIT_HEIGHT);
});


test('the logo is horizontally centred', () => {
  const layout = buildPortraitLayout(content, measureByFont, 105);
  assert.equal(layout.logoX, Math.round((PORTRAIT_WIDTH - PORTRAIT_LOGO_SIZE) / 2));
});

test('the hero underline is centred and matches the hero width', () => {
  const layout = buildPortraitLayout(content, measureByFont, 105);
  const mid = (layout.underlineXStart + layout.underlineXEnd) / 2;
  assert.ok(Math.abs(mid - PORTRAIT_CENTER_X) <= 1);
  assert.ok(Math.abs((layout.underlineXEnd - layout.underlineXStart) - layout.heroWidth) <= 1);
});

test('the underline stays inside the canvas even for a long handle', () => {
  const layout = buildPortraitLayout(
    { ...content, handle: '@averyverylonghandleindeed' },
    measureByFont,
    105,
  );
  assert.ok(layout.underlineXStart >= 0);
  assert.ok(layout.underlineXEnd <= PORTRAIT_WIDTH);
});


test('the whole portrait stack fits without colliding', () => {
  const qrSize = 105;
  const layout = buildPortraitLayout(content, measureByFont, qrSize);
  const outer = Math.max(...PORTRAIT_NFC_MARK_RADII) + PORTRAIT_NFC_MARK_WIDTH;

  // Band -> rule -> kicker -> hero -> underline -> name -> QR -> mark -> footer,
  // each strictly after the previous one.
  const bandBottom = PORTRAIT_BAND_HEIGHT + PORTRAIT_RULE_HEIGHT;
  assert.ok(PORTRAIT_LOGO_Y + PORTRAIT_LOGO_SIZE < PORTRAIT_WORDMARK_Y);
  assert.ok(PORTRAIT_WORDMARK_Y < PORTRAIT_DOMAIN_Y);
  assert.ok(PORTRAIT_DOMAIN_Y < PORTRAIT_BAND_HEIGHT);
  assert.ok(bandBottom < PORTRAIT_HERO_Y);
  assert.ok(PORTRAIT_HERO_Y < PORTRAIT_UNDERLINE_Y_START);
  assert.ok(PORTRAIT_UNDERLINE_Y_START < PORTRAIT_NAME_Y);
  assert.ok(PORTRAIT_NAME_Y < layout.qrY);

  const markBottom = layout.nfcCenterY + outer;
  const footerTop = PORTRAIT_HEIGHT - PORTRAIT_FOOTER_HEIGHT;
  assert.ok(layout.qrY + qrSize < layout.nfcCenterY - outer, 'mark overlaps the QR');
  assert.ok(markBottom < footerTop, `mark at ${markBottom} collides with footer at ${footerTop}`);
});

test('the brand mark fits inside the band', () => {
  assert.ok(PORTRAIT_LOGO_Y + PORTRAIT_LOGO_SIZE <= PORTRAIT_BAND_HEIGHT);
  assert.ok(PORTRAIT_LOGO_SIZE <= PORTRAIT_WIDTH - PORTRAIT_MARGIN * 2);
});
