// The BWRY (black / white / red / yellow) colour palette used by the panel,
// and the wire-level palette index mapping used by the vendored BLE library
// (webapp/vendor/js/dither.js / ble-common.js buildWireCodes) for a
// colorScheme 3 (BWRY) upload.
//
// Two different orderings exist in this codebase and must not be confused:
//  - od_badge/palette.py's BWRY list is [BLACK, WHITE, RED, YELLOW],
//    used there only to snap arbitrary RGB colours to the nearest of the
//    four palette colours (returns an RGB triple, order is irrelevant to
//    callers).
//  - The wire ditherIndices consumed by sendCanvasToDisplay expect palette
//    index order [black, white, yellow, red] (confirmed by the comment in
//    vendor/js/dither.js: "Index order comes from the library palette
//    (black, white, yellow, red, blue, green...)"). This is the order used
//    below, since it is the one that actually reaches the device.

/** @type {[number, number, number]} */
export const BLACK = [0, 0, 0];
/** @type {[number, number, number]} */
export const WHITE = [255, 255, 255];
/** @type {[number, number, number]} */
export const RED = [255, 0, 0];
/** @type {[number, number, number]} */
export const YELLOW = [255, 255, 0];

/**
 * Wire palette index order: 0=black, 1=white, 2=yellow, 3=red.
 * @type {Array<[number, number, number]>}
 */
export const WIRE_PALETTE = [BLACK, WHITE, YELLOW, RED];

/** Unswapped wire map: palette index -> wire code (the compensated / "ON" case for panel 0x1E). */
export const WIRE_MAP_COMPENSATED = [0, 1, 2, 3];

/** Upstream's own swapped wire map (the "OFF" case, for re-testing if upstream fixes their table). */
export const WIRE_MAP_UNCOMPENSATED = [0, 1, 3, 2];

/**
 * Snap an RGB colour to the nearest of the four BWRY colours and return its
 * wire palette index (0=black, 1=white, 2=yellow, 3=red).
 *
 * Uses squared Euclidean distance in RGB space, mirroring
 * od_badge/palette.py's nearest().
 *
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number}
 */
export function nearestBwryIndex(r, g, b) {
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < WIRE_PALETTE.length; i++) {
    const [pr, pg, pb] = WIRE_PALETTE[i];
    const dist = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * Compute one wire palette index per pixel from RGBA canvas pixel data.
 *
 * The badge is rendered in exact flat BWRY colours already (no dithering
 * needed), so this just nearest-matches each pixel to one of the four
 * palette colours rather than running any actual dithering algorithm.
 *
 * @param {Uint8ClampedArray|Uint8Array} pixels RGBA pixel data, 4 bytes per pixel.
 * @param {number} pixelCount Number of pixels (pixels.length / 4).
 * @returns {Uint8Array}
 */
export function computeDitherIndices(pixels, pixelCount) {
  const indices = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const p = i * 4;
    indices[i] = nearestBwryIndex(pixels[p], pixels[p + 1], pixels[p + 2]);
  }
  return indices;
}

/**
 * Resolve the ditherWireMap to pass to sendCanvasToDisplay for panel 0x1E,
 * per the compensate-red-yellow checkbox state.
 *
 * @param {boolean} compensate
 * @returns {number[]}
 */
export function wireMapFor(compensate) {
  return compensate ? [...WIRE_MAP_COMPENSATED] : [...WIRE_MAP_UNCOMPENSATED];
}

/**
 * Snap every pixel of RGBA canvas data to its exact BWRY palette colour, in place.
 *
 * Canvas 2D antialiases text and cannot be told not to, so a freshly rendered
 * badge carries hundreds of intermediate greys. The upload path already snaps
 * to the nearest palette entry, which means an un-snapped preview shows softer
 * edges than the panel will actually display. Snapping the preview too keeps
 * what you see and what you send identical.
 *
 * @param {Uint8ClampedArray} pixels RGBA pixel data, modified in place.
 * @param {number} pixelCount Number of pixels (pixels.length / 4).
 * @returns {void}
 */
export function snapPixelsToPalette(pixels, pixelCount) {
  for (let i = 0; i < pixelCount; i++) {
    const p = i * 4;
    const [r, g, b] = WIRE_PALETTE[nearestBwryIndex(pixels[p], pixels[p + 1], pixels[p + 2])];
    pixels[p] = r;
    pixels[p + 1] = g;
    pixels[p + 2] = b;
    pixels[p + 3] = 255;
  }
}
