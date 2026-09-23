import test from 'node:test';
import assert from 'node:assert/strict';

import {
  antennaEdge,
  EDGE_DIRECTION,
  panelFromBadge,
} from '../src/pure/nfc-placement.js';
import { PANEL_HEIGHT, PANEL_WIDTH, panelRotationDegrees, renderedSize } from '../src/pure/panel-orientation.js';

const CASES = [
  ['landscape', 'ccw', 'left'],
  ['landscape', 'cw', 'right'],
  ['portrait', 'ccw', 'bottom'],
  ['portrait', 'cw', 'top'],
];

test('the antenna edge is derived correctly for every combination', () => {
  // The two default cases were confirmed on the real tag: landscape default
  // reads on the left, portrait default reads at the bottom. The other two
  // fall out of the same derivation.
  for (const [orientation, rotation, expected] of CASES) {
    const { width, height } = renderedSize(orientation);
    assert.equal(
      antennaEdge(orientation, rotation, width, height),
      expected,
      `${orientation}/${rotation}`,
    );
  }
});

test('the JS derivation agrees with the Python one', () => {
  // od_badge/nfc_placement.py must not drift from this module.
  assert.deepEqual(
    CASES.map(([o, r]) => antennaEdge(o, r, ...Object.values(renderedSize(o)))),
    CASES.map(([, , expected]) => expected),
  );
});

test('every rotation maps the badge onto the panel framebuffer', () => {
  for (const [orientation, rotation] of CASES) {
    const { width, height } = renderedSize(orientation);
    const degrees = panelRotationDegrees(orientation, rotation);
    const corners = [[0, 0], [width, 0], [0, height], [width, height]].map(([x, y]) =>
      panelFromBadge(x, y, width, height, degrees),
    );
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    assert.equal(Math.max(...xs) - Math.min(...xs), PANEL_WIDTH);
    assert.equal(Math.max(...ys) - Math.min(...ys), PANEL_HEIGHT);
  }
});

test('panelFromBadge identity, half turn and quarter turns', () => {
  assert.deepEqual(panelFromBadge(10, 20, 168, 384, 0), [10, 20]);
  assert.deepEqual(panelFromBadge(10, 20, 168, 384, 180), [158, 364]);
  assert.deepEqual(panelFromBadge(10, 20, 384, 168, 90), [148, 10]);
  assert.deepEqual(panelFromBadge(10, 20, 384, 168, 270), [20, 374]);
});

test('panelFromBadge rejects an unsupported angle', () => {
  assert.throws(() => panelFromBadge(0, 0, 168, 384, 45), /invalid rotation 45/);
});

test('each edge opens its wave outward', () => {
  assert.equal(EDGE_DIRECTION.left, 180);
  assert.equal(EDGE_DIRECTION.right, 0);
  assert.equal(EDGE_DIRECTION.top, 270);
  assert.equal(EDGE_DIRECTION.bottom, 90);
});
