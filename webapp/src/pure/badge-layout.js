// Ported from od_badge/badge.py's build_elements(). Every coordinate,
// size and the hero auto-fit behaviour here matches that module; this file
// only computes the layout (positions and sizes), not pixels, so it can be
// unit tested with a fake text measurer and a fake QR pixel size instead of
// a real canvas and a real QR encoder.

/** @type {number} */
export const CANVAS_WIDTH = 384;
/** @type {number} */
export const CANVAS_HEIGHT = 168;
/** @type {number} */
export const PANEL_WIDTH = 168;
/** @type {number} */
export const PANEL_HEIGHT = 384;

export const DEFAULT_HANDLE = '';
export const DEFAULT_NAME = '';
export const DEFAULT_QR_URL = '';
export const DEFAULT_WORDMARK = 'ESPHOME';

/** Colour name used for the domain text; only reads correctly with the red/yellow compensation applied at upload time. */
export const DOMAIN_COLOR = 'yellow';

export const QR_BOX_SIZE = 3;
export const QR_BORDER = 1;

export const HERO_FONT_START_SIZE = 50;
export const HERO_FONT_MIN_SIZE = 8;
export const WORDMARK_FONT_SIZE = 22;
export const DOMAIN_FONT_SIZE = 13;
export const NAME_FONT_SIZE = 26;

export const LOGO_X = 8;
export const LOGO_Y = 3;
export const LOGO_SIZE = 38;
/** Wordmark starts clear of the enlarged brand mark. */
export const WORDMARK_X = 54;

/** Width reserved on the antenna side for the tap mark. */
export const MARK_STRIP = 28;
export const CONTENT_X = 6;
export const HERO_Y = 92;
export const UNDERLINE_Y_START = 118;
export const UNDERLINE_Y_END = 121;
export const NAME_Y = 145;
export const NFC_MARK_SWEEP = 96;

// Contactless "tap here" mark, drawn as concentric arcs opening to the right.
// Sits immediately left of the QR code so the two read as a pair: scan it or
// tap it. Deliberately not the NFC Forum N-Mark, which is a trademark with
// its own licensing terms. Kept in sync with od_badge/badge.py.
export const NFC_MARK_CENTER_X = 248;
export const NFC_MARK_CENTER_Y = 147;
/** @type {ReadonlyArray<number>} */
export const NFC_MARK_RADII = Object.freeze([4, 9, 14]);
export const NFC_MARK_WIDTH = 2;
/** Arc sweep in degrees, measured from the positive x axis (opening rightward). */
export const NFC_MARK_START_ANGLE = -48;
export const NFC_MARK_END_ANGLE = 48;

/**
 * @typedef {object} BadgeContent
 * @property {string} handle
 * @property {string} name
 * @property {string} qrUrl
 * @property {string} wordmark
 * @property {string} domain
 */

/**
 * @returns {BadgeContent}
 */
export function defaultBadgeContent() {
  return {
    handle: DEFAULT_HANDLE,
    name: DEFAULT_NAME,
    qrUrl: DEFAULT_QR_URL,
    wordmark: DEFAULT_WORDMARK,
    domain: 'esphome.io',
  };
}

/**
 * A function that measures the pixel width of ``value`` rendered in the
 * hero font ("ppb") at ``size``, matching od_badge/badge.py's
 * text_width() (PIL getbbox-based).
 *
 * @callback MeasureWidth
 * @param {string} value
 * @param {number} size
 * @returns {number}
 */

/**
 * Shrink a font size from ``startSize`` until ``value`` fits ``maxWidth``.
 * Never goes below HERO_FONT_MIN_SIZE.
 *
 * @param {string} value
 * @param {MeasureWidth} measureWidth
 * @param {number} maxWidth
 * @param {number} [startSize]
 * @returns {number}
 */
export function fitHeroSize(value, measureWidth, maxWidth, startSize = HERO_FONT_START_SIZE) {
  let size = startSize;
  while (size > HERO_FONT_MIN_SIZE && measureWidth(value, size) > maxWidth) {
    size -= 1;
  }
  return size;
}

/**
 * @typedef {object} BadgeLayout
 * @property {number} qrX
 * @property {number} qrY
 * @property {number} qrPixelSize
 * @property {number} heroSize
 * @property {number} heroWidth
 * @property {number} underlineXStart
 * @property {number} underlineYStart
 * @property {number} underlineXEnd
 * @property {number} underlineYEnd
 */

/**
 * Compute the full badge layout for ``content``, re-running the hero-text
 * auto-fit for whatever handle is supplied.
 *
 * @param {BadgeContent} content
 * @param {MeasureWidth} measureWidth
 * @param {number} qrPixelSize The rendered pixel size (square) of the QR code for content.qrUrl.
 * @returns {BadgeLayout}
 */
export function buildLayout(content, measureWidth, qrPixelSize, markEdge = 'left') {
  const contentX = CONTENT_X + (markEdge === 'left' ? MARK_STRIP : 0);
  const qrX = CANVAS_WIDTH - qrPixelSize - 8 - (markEdge === 'right' ? MARK_STRIP : 0);
  const qrY = 54;
  const availableWidth = qrX - contentX - 14;
  const heroSize = fitHeroSize(content.handle, measureWidth, availableWidth, HERO_FONT_START_SIZE);
  const heroWidth = measureWidth(content.handle, heroSize);
  const markCenterX =
    markEdge === 'left' ? CONTENT_X + MARK_STRIP / 2 : CANVAS_WIDTH - MARK_STRIP / 2;

  return {
    qrX,
    qrY,
    qrPixelSize,
    heroSize,
    heroWidth,
    contentX,
    markCenterX,
    markCenterY: 84,
    markEdge,
    underlineXStart: contentX,
    underlineYStart: UNDERLINE_Y_START,
    underlineXEnd: contentX + heroWidth - 6,
    underlineYEnd: UNDERLINE_Y_END,
  };
}
