// DOM-dependent: wraps the vendored classic-script QRCode library
// (webapp/vendor/l/qrcode.js) to expose its raw module matrix, so the badge
// renderer can draw pixel-exact squares itself (matching
// od_badge/badge.py's box_size/border handling) instead of relying on
// the library's own DOM-attached canvas/table drawing path.
//
// The vendored library is loaded as a classic <script> before any module
// script runs, so `window.QRCode` is a global by the time this file's
// functions are called.

/**
 * @typedef {object} QrMatrix
 * @property {number} moduleCount
 * @property {(row: number, col: number) => boolean} isDark
 */

/**
 * Build the QR module matrix for `data` at error-correction level H,
 * matching od_badge/badge.py's use of the Python `qrcode` library
 * (ERROR_CORRECT_H, `qr.make(fit=True)` automatic version/type-number
 * selection).
 *
 * @param {string} data
 * @returns {QrMatrix}
 */
export function buildQrMatrix(data) {
  if (typeof window === 'undefined' || !window.QRCode) {
    throw new Error('vendored QRCode library (vendor/l/qrcode.js) not loaded');
  }
  // A detached element is enough -- QRCode's canvas drawer just needs
  // something to appendChild() a scratch <canvas> onto; it never needs to be
  // attached to the visible document.
  const scratch = document.createElement('div');
  const instance = new window.QRCode(scratch, {
    text: data,
    correctLevel: window.QRCode.CorrectLevel.H,
    width: 1,
    height: 1,
  });
  const model = instance._oQRCode;
  return {
    moduleCount: model.moduleCount,
    isDark: (row, col) => model.isDark(row, col),
  };
}

/**
 * The rendered pixel size (square) of a QR code for `data`, matching
 * od_badge/badge.py's qr_pixel_size().
 *
 * @param {QrMatrix} matrix
 * @param {number} boxSize
 * @param {number} border
 * @returns {number}
 */
export function qrPixelSizeFromMatrix(matrix, boxSize, border) {
  return (matrix.moduleCount + border * 2) * boxSize;
}
