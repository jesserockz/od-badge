// Portrait badge layout: 168x384, the panel's native orientation.
//
// The landscape layout (badge-layout.js) is 384x168 and gets rotated onto the
// panel. Portrait needs its own geometry rather than a rotation, because at
// 168px wide the wordmark and the hero handle both have to auto-fit where the
// landscape layout could let them run: "MUSIC ASSISTANT" at the landscape
// wordmark size is wider than the whole portrait canvas.
//
// Colour pairings follow the same contrast rules as landscape (see
// contrast.js): white or yellow on the black band, black or red on white.

import { fitHeroSize } from './badge-layout.js';

export const PORTRAIT_WIDTH = 168;
export const PORTRAIT_HEIGHT = 384;

export const PORTRAIT_MARGIN = 8;

/** Everything in portrait is centred on this axis. */
export const PORTRAIT_CENTER_X = PORTRAIT_WIDTH / 2;

/** Black brand band across the top: a centred stack of logo, wordmark, domain. */
export const PORTRAIT_BAND_HEIGHT = 100;
/** Red rule directly under the brand band. */
export const PORTRAIT_RULE_HEIGHT = 6;

export const PORTRAIT_LOGO_SIZE = 46;
export const PORTRAIT_LOGO_Y = 8;

export const PORTRAIT_WORDMARK_Y = 68;
export const PORTRAIT_WORDMARK_START_SIZE = 20;
export const PORTRAIT_WORDMARK_MIN_SIZE = 9;

export const PORTRAIT_DOMAIN_Y = 88;
export const PORTRAIT_DOMAIN_START_SIZE = 12;
export const PORTRAIT_DOMAIN_MIN_SIZE = 7;


export const PORTRAIT_HERO_Y = 140;
export const PORTRAIT_HERO_START_SIZE = 40;

export const PORTRAIT_UNDERLINE_Y_START = 160;
export const PORTRAIT_UNDERLINE_Y_END = 163;

export const PORTRAIT_NAME_Y = 188;
export const PORTRAIT_NAME_FONT_SIZE = 24;

export const PORTRAIT_QR_Y = 210;

/** Contactless tap mark, centred under the QR. */
export const PORTRAIT_NFC_MARK_RADII = Object.freeze([4, 9, 14]);
export const PORTRAIT_NFC_MARK_WIDTH = 2;

/** Red bar closing the bottom edge, balancing the black band at the top. */
export const PORTRAIT_FOOTER_HEIGHT = 8;

/**
 * @typedef {object} PortraitLayout
 * @property {number} wordmarkSize
 * @property {number} domainSize
 * @property {number} heroSize
 * @property {number} heroWidth
 * @property {number} qrX
 * @property {number} qrY
 * @property {number} qrPixelSize
 * @property {number} logoX
 * @property {number} underlineXStart
 * @property {number} underlineXEnd
 * @property {number} nfcCenterY
 */

/**
 * Shrink a font size until the text fits, down to a floor.
 *
 * @param {string} value
 * @param {(text: string, size: number) => number} measureWidth
 * @param {number} maxWidth
 * @param {number} startSize
 * @param {number} minSize
 * @returns {number}
 */
export function fitTextSize(value, measureWidth, maxWidth, startSize, minSize) {
  let size = startSize;
  while (size > minSize && measureWidth(value, size) > maxWidth) {
    size -= 1;
  }
  return size;
}

/**
 * Compute the portrait layout for the given content.
 *
 * @param {{handle: string, wordmark: string, domain: string}} content
 * @param {(text: string, size: number, font?: string) => number} measureWidth
 * @param {number} qrPixelSize
 * @returns {PortraitLayout}
 */
export function buildPortraitLayout(content, measureWidth, qrPixelSize, markEdge = 'bottom') {
  const textWidth = PORTRAIT_WIDTH - PORTRAIT_MARGIN * 2;

  const wordmarkSize = fitTextSize(
    content.wordmark,
    (text, size) => measureWidth(text, size, 'ppb'),
    textWidth,
    PORTRAIT_WORDMARK_START_SIZE,
    PORTRAIT_WORDMARK_MIN_SIZE,
  );
  const domainSize = fitTextSize(
    content.domain,
    (text, size) => measureWidth(text, size, 'rbm'),
    textWidth,
    PORTRAIT_DOMAIN_START_SIZE,
    PORTRAIT_DOMAIN_MIN_SIZE,
  );

  const heroSize = fitHeroSize(
    content.handle,
    (text, size) => measureWidth(text, size, 'ppb'),
    textWidth,
    PORTRAIT_HERO_START_SIZE,
  );
  const heroWidth = measureWidth(content.handle, heroSize, 'ppb');

  const qrX = Math.round((PORTRAIT_WIDTH - qrPixelSize) / 2);
    // Bottom antenna: sit low, just above the footer. Top antenna: inside the
  // brand band, offset from the centred logo.
  const nfcCenterY =
    markEdge === 'top' ? 30 : PORTRAIT_HEIGHT - PORTRAIT_FOOTER_HEIGHT - 20;
  const nfcCenterX = markEdge === 'top' ? PORTRAIT_WIDTH - 26 : PORTRAIT_CENTER_X;

  return {
    wordmarkSize,
    domainSize,
    heroSize,
    heroWidth,
    logoX: Math.round((PORTRAIT_WIDTH - PORTRAIT_LOGO_SIZE) / 2),
    qrX,
    qrY: PORTRAIT_QR_Y,
    qrPixelSize,
    // The rule under the hero is centred and matches the hero's own width.
    underlineXStart: Math.round(PORTRAIT_CENTER_X - heroWidth / 2),
    underlineXEnd: Math.round(PORTRAIT_CENTER_X + heroWidth / 2),
    nfcCenterX,
    nfcCenterY,
    markEdge,
  };
}
