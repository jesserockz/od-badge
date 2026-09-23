// Where the tag's NFC antenna lands on the badge, per rotation.
//
// The antenna sits at a fixed physical spot: the middle of the panel
// framebuffer's bottom edge. Because the badge is rotated onto the panel,
// that spot appears on a different edge of the badge depending on how it is
// turned, so the "tap here" mark has to move with it.
//
// Derived from the rotation transform rather than hardcoded, so it stays
// correct if a rotation is ever added or changed. Mirrors
// od_badge/nfc_placement.py.

import { PANEL_HEIGHT, PANEL_WIDTH, panelRotationDegrees } from './panel-orientation.js';

/** @typedef {'left'|'right'|'top'|'bottom'} Edge */

/** Antenna position in panel framebuffer coordinates. */
export const ANTENNA_PANEL_X = PANEL_WIDTH / 2;
export const ANTENNA_PANEL_Y = PANEL_HEIGHT;

/** Direction each edge's wave opens, in degrees (0 = right, 90 = down). */
export const EDGE_DIRECTION = Object.freeze({
  right: 0,
  bottom: 90,
  left: 180,
  top: 270,
});

/**
 * Map a badge coordinate to its panel framebuffer coordinate.
 *
 * @param {number} badgeX
 * @param {number} badgeY
 * @param {number} badgeWidth
 * @param {number} badgeHeight
 * @param {number} degrees 0, 90, 180 or 270.
 * @returns {[number, number]}
 */
export function panelFromBadge(badgeX, badgeY, badgeWidth, badgeHeight, degrees) {
  if (degrees === 0) return [badgeX, badgeY];
  if (degrees === 180) return [badgeWidth - badgeX, badgeHeight - badgeY];
  if (degrees === 90) return [badgeHeight - badgeY, badgeX];
  if (degrees === 270) return [badgeY, badgeWidth - badgeX];
  throw new Error(`invalid rotation ${degrees}, expected 0, 90, 180 or 270`);
}

/**
 * Which edge of the badge the NFC antenna sits against.
 *
 * Found by searching badge coordinates for the point mapping closest to the
 * antenna, then reporting which edge it lies on. Derived rather than
 * tabulated so it cannot silently disagree with the rotation transform.
 *
 * @param {import('./panel-orientation.js').Orientation} orientation
 * @param {import('./panel-orientation.js').RotationChoice} rotation
 * @param {number} badgeWidth
 * @param {number} badgeHeight
 * @returns {Edge}
 */
export function antennaEdge(orientation, rotation, badgeWidth, badgeHeight) {
  const degrees = panelRotationDegrees(orientation, rotation);
  let best = [0, 0];
  let bestDistance = Infinity;
  for (let badgeX = 0; badgeX <= badgeWidth; badgeX += 2) {
    for (let badgeY = 0; badgeY <= badgeHeight; badgeY += 2) {
      const [panelX, panelY] = panelFromBadge(badgeX, badgeY, badgeWidth, badgeHeight, degrees);
      const distance = (panelX - ANTENNA_PANEL_X) ** 2 + (panelY - ANTENNA_PANEL_Y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [badgeX, badgeY];
      }
    }
  }
  const [badgeX, badgeY] = best;
  if (badgeX <= badgeWidth * 0.02) return 'left';
  if (badgeX >= badgeWidth * 0.98) return 'right';
  if (badgeY <= badgeHeight * 0.02) return 'top';
  return 'bottom';
}
