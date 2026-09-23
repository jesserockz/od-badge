// How big to draw the badge preview.
//
// The preview uses image-rendering: pixelated, so it only matches what the
// panel will show when every source pixel covers the same whole number of
// device pixels. The chosen 1x or 2x is in CSS pixels, which is a whole number
// of device pixels on any integer-DPR screen. When that does not fit (a phone
// held upright), this steps down to the largest whole number of *device*
// pixels per source pixel that does fit, rather than shrinking to a
// fractional size.
//
// Pure module so the arithmetic is testable without a DOM.

/**
 * CSS pixels per source pixel for the preview canvas.
 *
 * Never larger than the chosen scale. When even one device pixel per source
 * pixel does not fit, it stays at one device pixel and the frame scrolls.
 *
 * @param {number} chosenScale The user's preview scale in CSS pixels (1 or 2).
 * @param {number} sourceWidth The canvas width in source pixels.
 * @param {number} availableWidth The CSS width the preview may take up.
 * @param {number} devicePixelRatio window.devicePixelRatio (1 if unknown).
 * @returns {number}
 */
export function fitPreviewScale(chosenScale, sourceWidth, availableWidth, devicePixelRatio) {
  if (!(availableWidth > 0) || chosenScale * sourceWidth <= availableWidth) {
    return chosenScale;
  }
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const maxDevicePixels = Math.floor(chosenScale * dpr);
  const fitting = Math.floor((availableWidth * dpr) / sourceWidth);
  const devicePixels = Math.max(1, Math.min(maxDevicePixels, fitting));
  return devicePixels / dpr;
}
