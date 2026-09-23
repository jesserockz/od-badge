// Text contrast rules for the BWRY panel.
//
// Only two pairings are readable at badge size and viewing distance:
//   black background -> white or yellow text
//   white background -> black or red text
//
// Red on black and yellow on white are both too low contrast, even though all
// four inks are available. This mirrors the enforced rule in the Python
// package's tests (tests/test_badge.py), so the two implementations cannot
// drift apart.

/** @typedef {'black'|'white'|'red'|'yellow'} Ink */

/** @type {Readonly<Record<'black'|'white', ReadonlyArray<Ink>>>} */
export const ALLOWED_TEXT_INKS = Object.freeze({
  black: Object.freeze(['white', 'yellow']),
  white: Object.freeze(['black', 'red']),
});

/** @type {Readonly<Record<Ink, string>>} */
export const INK_HEX = Object.freeze({
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  yellow: '#ffff00',
});

/**
 * @typedef {object} TextLayer
 * @property {string} id
 * @property {Ink} ink Text colour.
 * @property {'black'|'white'} background Background the text sits on.
 */

/**
 * Every text layer the badge draws, with the background it sits on.
 *
 * The renderer takes its fill colours from here rather than hardcoding them,
 * so validateTextLayers() checks the colours actually drawn.
 *
 * @type {ReadonlyArray<TextLayer>}
 */
export const BADGE_TEXT_LAYERS = Object.freeze([
  Object.freeze({ id: 'wordmark', ink: 'white', background: 'black' }),
  Object.freeze({ id: 'domain', ink: 'yellow', background: 'black' }),
  Object.freeze({ id: 'hero', ink: 'black', background: 'white' }),
  Object.freeze({ id: 'name', ink: 'red', background: 'white' }),
]);

/**
 * Return the hex fill for a named text layer.
 *
 * @param {string} id
 * @returns {string}
 */
export function inkFor(id) {
  const layer = BADGE_TEXT_LAYERS.find((candidate) => candidate.id === id);
  if (!layer) {
    throw new Error(`unknown text layer ${id}`);
  }
  return INK_HEX[layer.ink];
}

/**
 * Validate text layers against the contrast rules.
 *
 * @param {ReadonlyArray<TextLayer>} layers
 * @returns {string[]} One message per violation; empty when all pairings are legal.
 */
export function validateTextLayers(layers) {
  const problems = [];
  for (const layer of layers) {
    const allowed = ALLOWED_TEXT_INKS[layer.background];
    if (!allowed) {
      problems.push(`${layer.id}: unknown background ${layer.background}`);
      continue;
    }
    if (!allowed.includes(layer.ink)) {
      problems.push(
        `${layer.id}: ${layer.ink} on ${layer.background} is unreadable; allowed: ${allowed.join(', ')}`,
      );
    }
  }
  return problems;
}
