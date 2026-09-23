import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALLOWED_TEXT_INKS,
  BADGE_TEXT_LAYERS,
  INK_HEX,
  inkFor,
  validateTextLayers,
} from '../src/pure/contrast.js';

test('the badge as shipped satisfies the contrast rules', () => {
  assert.deepEqual(validateTextLayers(BADGE_TEXT_LAYERS), []);
});

test('the badge declares every text layer it draws', () => {
  const ids = BADGE_TEXT_LAYERS.map((layer) => layer.id).sort();
  assert.deepEqual(ids, ['domain', 'hero', 'name', 'wordmark']);
});

test('red text on a black background is rejected', () => {
  const problems = validateTextLayers([{ id: 'domain', ink: 'red', background: 'black' }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unreadable/);
});

test('yellow text on a white background is rejected', () => {
  const problems = validateTextLayers([{ id: 'name', ink: 'yellow', background: 'white' }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unreadable/);
});

test('an unknown background is reported rather than silently passing', () => {
  const problems = validateTextLayers([{ id: 'x', ink: 'red', background: 'purple' }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /unknown background/);
});

test('both legal inks are accepted on each background', () => {
  for (const [background, inks] of Object.entries(ALLOWED_TEXT_INKS)) {
    for (const ink of inks) {
      assert.deepEqual(validateTextLayers([{ id: 'probe', ink, background }]), []);
    }
  }
});

test('inkFor returns the hex the renderer fills with', () => {
  assert.equal(inkFor('domain'), INK_HEX.yellow);
  assert.equal(inkFor('wordmark'), INK_HEX.white);
  assert.equal(inkFor('name'), INK_HEX.red);
  assert.equal(inkFor('hero'), INK_HEX.black);
});

test('inkFor rejects an unknown layer instead of returning undefined', () => {
  assert.throws(() => inkFor('nope'), /unknown text layer/);
});
