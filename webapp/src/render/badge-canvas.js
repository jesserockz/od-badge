// DOM-dependent badge renderer: draws the layout computed by
// src/pure/badge-layout.js onto a real <canvas>, using the vendored QR
// library (via src/render/qr.js) and the two bundled fonts loaded through
// @font-face in webapp/styles.css.

import {
  buildLayout,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  WORDMARK_FONT_SIZE,
  DOMAIN_FONT_SIZE,
  NAME_FONT_SIZE,
  LOGO_X,
  LOGO_Y,
  LOGO_SIZE,
  WORDMARK_X,
  HERO_Y,
  NAME_Y,
  NFC_MARK_SWEEP,
  QR_BOX_SIZE,
  QR_BORDER,
  NFC_MARK_RADII,
  NFC_MARK_WIDTH,
} from '../pure/badge-layout.js';
import { snapPixelsToPalette } from '../pure/palette.js';
import {
  buildPortraitLayout,
  PORTRAIT_WIDTH,
  PORTRAIT_HEIGHT,
  PORTRAIT_CENTER_X,
  PORTRAIT_BAND_HEIGHT,
  PORTRAIT_RULE_HEIGHT,
  PORTRAIT_LOGO_Y,
  PORTRAIT_LOGO_SIZE,
  PORTRAIT_WORDMARK_Y,
  PORTRAIT_DOMAIN_Y,
  PORTRAIT_HERO_Y,
  PORTRAIT_UNDERLINE_Y_START,
  PORTRAIT_UNDERLINE_Y_END,
  PORTRAIT_NAME_Y,
  PORTRAIT_NAME_FONT_SIZE,
  PORTRAIT_FOOTER_HEIGHT,
} from '../pure/badge-layout-portrait.js';
import { inkFor } from '../pure/contrast.js';
import { EDGE_DIRECTION } from '../pure/nfc-placement.js';
import {
  matchesPanel,
  panelRotationDegrees,
  PANEL_HEIGHT,
  PANEL_WIDTH,
} from '../pure/panel-orientation.js';
import { buildQrMatrix, qrPixelSizeFromMatrix } from './qr.js';

/** Font-family names declared via @font-face in styles.css. */
export const FONT_PPB = 'ODBadgePPB';
export const FONT_RBM = 'ODBadgeRBM';

const COLOR_BLACK = '#000000';
const COLOR_WHITE = '#ffffff';
const COLOR_RED = '#ff0000';


/**
 * Wait until both bundled fonts have finished loading, so the very first
 * render measures and draws text with the real metrics instead of a
 * fallback font.
 *
 * @returns {Promise<void>}
 */
export async function ensureFontsLoaded() {
  if (typeof document === 'undefined' || !document.fonts) {
    return;
  }
  await Promise.all([document.fonts.load(`16px "${FONT_PPB}"`), document.fonts.load(`16px "${FONT_RBM}"`)]);
  await document.fonts.ready;
}

const imageCache = new Map();

/**
 * Load (and cache) an image from a URL or data URL.
 *
 * @param {string} url
 * @returns {Promise<HTMLImageElement>}
 */
function loadImage(url) {
  let pending = imageCache.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load image: ${url}`));
      img.src = url;
    });
    imageCache.set(url, pending);
  }
  return pending;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @returns {import('../pure/badge-layout.js').MeasureWidth}
 */
function measureWidthFactory(ctx) {
  return (text, size) => {
    ctx.font = `${size}px "${FONT_PPB}"`;
    return ctx.measureText(text).width;
  };
}

/**
 * Font-aware width measurer. The portrait layout auto-fits both a ppb
 * wordmark and an rbm domain, so it cannot assume a single face.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @returns {(text: string, size: number, font?: 'ppb'|'rbm') => number}
 */
function measureWidthByFontFactory(ctx) {
  return (text, size, font = 'ppb') => {
    ctx.font = `${size}px "${font === 'rbm' ? FONT_RBM : FONT_PPB}"`;
    return ctx.measureText(text).width;
  };
}

/**
 * @typedef {object} RenderOptions
 * @property {import('../pure/badge-layout.js').BadgeContent} content
 * @property {string|null} logoUrl
 */

/**
 * Draw the contactless tap mark: concentric arcs opening toward `edge`.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} centerX
 * @param {number} centerY
 * @param {import('../pure/nfc-placement.js').Edge} edge
 * @param {string} stroke
 * @returns {void}
 */
function drawTapMark(ctx, centerX, centerY, edge, stroke) {
  const direction = EDGE_DIRECTION[edge];
  const half = NFC_MARK_SWEEP / 2;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = NFC_MARK_WIDTH;
  for (const radius of NFC_MARK_RADII) {
    ctx.beginPath();
    ctx.arc(
      centerX,
      centerY,
      radius,
      ((direction - half) * Math.PI) / 180,
      ((direction + half) * Math.PI) / 180,
    );
    ctx.stroke();
  }
}

/**
 * Render the landscape 384x168 badge onto `canvas`.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {RenderOptions} options
 * @returns {Promise<import('../pure/badge-layout.js').BadgeLayout>}
 */
export async function renderBadge(canvas, { content, logoUrl, markEdge = 'left' }) {
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  // Downscaling the baked (supersampled) brand mark PNGs into the 34x34 logo
  // slot should look smooth, not aliased -- this only affects drawImage()
  // calls, not the CSS upscale of the whole canvas for on-screen preview.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.fillStyle = COLOR_WHITE;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const measureWidth = measureWidthFactory(ctx);
  const qrMatrix = buildQrMatrix(content.qrUrl);
  const qrPixelSize = qrPixelSizeFromMatrix(qrMatrix, QR_BOX_SIZE, QR_BORDER);
  const layout = buildLayout(content, measureWidth, qrPixelSize, markEdge);

  // Brand band.
  ctx.fillStyle = COLOR_BLACK;
  ctx.fillRect(0, 0, CANVAS_WIDTH, 44);

  // Logo mark.
  if (logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      ctx.drawImage(img, LOGO_X, LOGO_Y, LOGO_SIZE, LOGO_SIZE);
    } catch {
      // A broken/missing logo should not stop the rest of the badge from rendering.
    }
  }

  // Wordmark.
  ctx.fillStyle = inkFor('wordmark');
  ctx.font = `${WORDMARK_FONT_SIZE}px "${FONT_PPB}"`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(content.wordmark, WORDMARK_X, 22);

  // Domain text.
  ctx.fillStyle = inkFor('domain');
  ctx.font = `${DOMAIN_FONT_SIZE}px "${FONT_RBM}"`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(content.domain, 376, 23);

  // Red band.
  ctx.fillStyle = COLOR_RED;
  ctx.fillRect(0, 44, CANVAS_WIDTH, 6);

  // Hero (auto-fit handle).
  ctx.fillStyle = inkFor('hero');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `${layout.heroSize}px "${FONT_PPB}"`;
  ctx.fillText(content.handle, layout.contentX, HERO_Y);

  // Underline beneath the hero text.
  ctx.fillStyle = COLOR_BLACK;
  ctx.fillRect(layout.underlineXStart, layout.underlineYStart, layout.underlineXEnd - layout.underlineXStart, layout.underlineYEnd - layout.underlineYStart);

  // Name.
  ctx.fillStyle = inkFor('name');
  ctx.font = `${NAME_FONT_SIZE}px "${FONT_PPB}"`;
  ctx.fillText(content.name, layout.contentX, NAME_Y);

  // Contactless tap mark, on the antenna edge, arcs opening outward.
  drawTapMark(ctx, layout.markCenterX, layout.markCenterY, layout.markEdge, inkFor('hero'));

  // QR code (drawn module-by-module, matching box_size/border exactly).
  ctx.fillStyle = COLOR_BLACK;
  for (let row = 0; row < qrMatrix.moduleCount; row++) {
    for (let col = 0; col < qrMatrix.moduleCount; col++) {
      if (qrMatrix.isDark(row, col)) {
        ctx.fillRect(layout.qrX + (col + QR_BORDER) * QR_BOX_SIZE, layout.qrY + (row + QR_BORDER) * QR_BOX_SIZE, QR_BOX_SIZE, QR_BOX_SIZE);
      }
    }
  }

  // Flatten canvas antialiasing onto the four panel inks so the preview shows
  // exactly what the device will render, not a softer version of it.
  const snapData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  snapPixelsToPalette(snapData.data, CANVAS_WIDTH * CANVAS_HEIGHT);
  ctx.putImageData(snapData, 0, 0);

  return layout;
}

/**
 * Rotate the rendered landscape 384x168 badge canvas onto the 168x384
 * portrait panel orientation, matching od_badge/badge.py's
 * rotate_to_panel().
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {'cw'|'ccw'} rotation
 * @returns {HTMLCanvasElement}
 */
export function rotateToPanel(sourceCanvas, rotation) {
  if (rotation !== 'cw' && rotation !== 'ccw') {
    throw new Error(`invalid rotation ${rotation}, expected 'cw' or 'ccw'`);
  }
  const out = document.createElement('canvas');
  out.width = sourceCanvas.height;
  out.height = sourceCanvas.width;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (rotation === 'ccw') {
    // Visually counter-clockwise 90deg, matching PIL's Image.rotate(90) (badge.py's "ccw").
    // Canvas rotate() is visually clockwise for a positive angle (y-axis points down),
    // so a counter-clockwise turn needs a negative angle here.
    ctx.translate(0, out.height);
    ctx.rotate(-Math.PI / 2);
  } else {
    // Visually clockwise 90deg, matching PIL's Image.rotate(-90) (badge.py's "cw").
    ctx.translate(out.width, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.restore();
  return out;
}


/**
 * Render the portrait 168x384 badge onto `canvas`.
 *
 * This is the panel's native orientation, so unlike the landscape badge it
 * needs no rotation before upload. Preview only for now: it has not been
 * verified on hardware.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {RenderOptions} options
 * @returns {Promise<import('../pure/badge-layout-portrait.js').PortraitLayout>}
 */
export async function renderBadgePortrait(canvas, { content, logoUrl, markEdge = 'bottom' }) {
  canvas.width = PORTRAIT_WIDTH;
  canvas.height = PORTRAIT_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.clearRect(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
  ctx.fillStyle = COLOR_WHITE;
  ctx.fillRect(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);

  const measureWidth = measureWidthByFontFactory(ctx);
  const qrMatrix = buildQrMatrix(content.qrUrl);
  const qrPixelSize = qrPixelSizeFromMatrix(qrMatrix, QR_BOX_SIZE, QR_BORDER);
  const layout = buildPortraitLayout(content, measureWidth, qrPixelSize, markEdge);

  // Brand band: a centred stack of logo, wordmark and domain.
  ctx.fillStyle = COLOR_BLACK;
  ctx.fillRect(0, 0, PORTRAIT_WIDTH, PORTRAIT_BAND_HEIGHT);

  if (logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      ctx.drawImage(img, layout.logoX, PORTRAIT_LOGO_Y, PORTRAIT_LOGO_SIZE, PORTRAIT_LOGO_SIZE);
    } catch {
      // A missing logo must not blank the whole badge.
    }
  }

  // Every text layer in portrait is centred on the same axis.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  ctx.fillStyle = inkFor('wordmark');
  ctx.font = `${layout.wordmarkSize}px "${FONT_PPB}"`;
  ctx.fillText(content.wordmark, PORTRAIT_CENTER_X, PORTRAIT_WORDMARK_Y);

  ctx.fillStyle = inkFor('domain');
  ctx.font = `${layout.domainSize}px "${FONT_RBM}"`;
  ctx.fillText(content.domain, PORTRAIT_CENTER_X, PORTRAIT_DOMAIN_Y);

  ctx.fillStyle = COLOR_RED;
  ctx.fillRect(0, PORTRAIT_BAND_HEIGHT, PORTRAIT_WIDTH, PORTRAIT_RULE_HEIGHT);

  ctx.fillStyle = inkFor('hero');
  ctx.font = `${layout.heroSize}px "${FONT_PPB}"`;
  ctx.fillText(content.handle, PORTRAIT_CENTER_X, PORTRAIT_HERO_Y);

  ctx.fillStyle = inkFor('hero');
  ctx.fillRect(
    layout.underlineXStart,
    PORTRAIT_UNDERLINE_Y_START,
    layout.underlineXEnd - layout.underlineXStart,
    PORTRAIT_UNDERLINE_Y_END - PORTRAIT_UNDERLINE_Y_START,
  );

  ctx.fillStyle = inkFor('name');
  ctx.font = `${PORTRAIT_NAME_FONT_SIZE}px "${FONT_PPB}"`;
  ctx.fillText(content.name, PORTRAIT_CENTER_X, PORTRAIT_NAME_Y);

  // QR code, centred.
  ctx.fillStyle = COLOR_BLACK;
  for (let row = 0; row < qrMatrix.moduleCount; row++) {
    for (let col = 0; col < qrMatrix.moduleCount; col++) {
      if (qrMatrix.isDark(row, col)) {
        ctx.fillRect(
          layout.qrX + (col + QR_BORDER) * QR_BOX_SIZE,
          layout.qrY + (row + QR_BORDER) * QR_BOX_SIZE,
          QR_BOX_SIZE,
          QR_BOX_SIZE,
        );
      }
    }
  }

  // Contactless tap mark. A top antenna puts it inside the black band, where
  // it has to be white to be visible at all.
  drawTapMark(
    ctx,
    layout.nfcCenterX,
    layout.nfcCenterY,
    layout.markEdge,
    layout.markEdge === 'top' ? COLOR_WHITE : inkFor('hero'),
  );

  ctx.fillStyle = COLOR_RED;
  ctx.fillRect(0, PORTRAIT_HEIGHT - PORTRAIT_FOOTER_HEIGHT, PORTRAIT_WIDTH, PORTRAIT_FOOTER_HEIGHT);

  const snapData = ctx.getImageData(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
  snapPixelsToPalette(snapData.data, PORTRAIT_WIDTH * PORTRAIT_HEIGHT);
  ctx.putImageData(snapData, 0, 0);

  return layout;
}


/**
 * Put a rendered badge canvas onto the panel's 168x384 framebuffer.
 *
 * Landscape badges are turned a quarter turn; portrait badges are already
 * panel-native and are either passed through or flipped 180.
 *
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {import('../pure/panel-orientation.js').Orientation} orientation
 * @param {import('../pure/panel-orientation.js').RotationChoice} rotation
 * @returns {HTMLCanvasElement} A canvas of exactly PANEL_WIDTH x PANEL_HEIGHT.
 */
export function prepareForPanel(sourceCanvas, orientation, rotation) {
  const degrees = panelRotationDegrees(orientation, rotation);
  const quarterTurn = degrees === 90 || degrees === 270;

  const out = document.createElement('canvas');
  out.width = quarterTurn ? sourceCanvas.height : sourceCanvas.width;
  out.height = quarterTurn ? sourceCanvas.width : sourceCanvas.height;

  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  if (degrees === 90) {
    ctx.translate(out.width, 0);
    ctx.rotate(Math.PI / 2);
  } else if (degrees === 270) {
    ctx.translate(0, out.height);
    ctx.rotate(-Math.PI / 2);
  } else if (degrees === 180) {
    ctx.translate(out.width, out.height);
    ctx.rotate(Math.PI);
  }
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.restore();

  if (!matchesPanel(out.width, out.height)) {
    throw new Error(
      `rendered badge is ${out.width}x${out.height} after rotation, expected ${PANEL_WIDTH}x${PANEL_HEIGHT}`,
    );
  }
  return out;
}
