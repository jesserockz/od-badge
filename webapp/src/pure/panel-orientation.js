// How a rendered badge canvas maps onto the panel's 168x384 framebuffer.
//
// Landscape badges are 384x168 and must be turned a quarter turn. Portrait
// badges are already the panel's native 168x384, so they need no turn at all,
// and the same control instead chooses between upright and upside down (which
// side of the lanyard the tag hangs from).
//
// Pure module so the mapping is testable without a DOM.

/** @typedef {'landscape'|'portrait'} Orientation */
/** @typedef {'cw'|'ccw'} RotationChoice */

export const PANEL_WIDTH = 168;
export const PANEL_HEIGHT = 384;

/**
 * Degrees of clockwise rotation to apply to the rendered canvas.
 *
 * @param {Orientation} orientation
 * @param {RotationChoice} rotation
 * @returns {number} 0, 90, 180 or 270.
 */
export function panelRotationDegrees(orientation, rotation) {
  if (orientation !== 'landscape' && orientation !== 'portrait') {
    throw new Error(`invalid orientation ${orientation}, expected 'landscape' or 'portrait'`);
  }
  if (rotation !== 'cw' && rotation !== 'ccw') {
    throw new Error(`invalid rotation ${rotation}, expected 'cw' or 'ccw'`);
  }
  if (orientation === 'landscape') {
    return rotation === 'cw' ? 90 : 270;
  }
  // Portrait is already panel-native: "ccw" is the upright default, "cw" flips it.
  return rotation === 'cw' ? 180 : 0;
}

/**
 * Human labels for the rotation control, which means different things in each
 * orientation. Showing "Clockwise" for a portrait badge that is not turned at
 * all would be a lie.
 *
 * @param {Orientation} orientation
 * @returns {{ccw: string, cw: string}}
 */
export function rotationLabels(orientation) {
  if (orientation === 'portrait') {
    return { ccw: 'Upright (default)', cw: 'Upside down (180)' };
  }
  return { ccw: 'Counter-clockwise (default)', cw: 'Clockwise' };
}

/**
 * The canvas size a badge is rendered at, before any rotation.
 *
 * @param {Orientation} orientation
 * @returns {{width: number, height: number}}
 */
export function renderedSize(orientation) {
  return orientation === 'portrait'
    ? { width: PANEL_WIDTH, height: PANEL_HEIGHT }
    : { width: PANEL_HEIGHT, height: PANEL_WIDTH };
}

/**
 * Whether the given rendered size, once rotated, lands on the panel framebuffer.
 *
 * @param {number} width Width after rotation.
 * @param {number} height Height after rotation.
 * @returns {boolean}
 */
export function matchesPanel(width, height) {
  return width === PANEL_WIDTH && height === PANEL_HEIGHT;
}
