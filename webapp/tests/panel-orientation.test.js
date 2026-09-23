import test from 'node:test';
import assert from 'node:assert/strict';

import {
  matchesPanel,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  panelRotationDegrees,
  renderedSize,
  rotationLabels,
} from '../src/pure/panel-orientation.js';

test('landscape needs a quarter turn in either direction', () => {
  assert.equal(panelRotationDegrees('landscape', 'ccw'), 270);
  assert.equal(panelRotationDegrees('landscape', 'cw'), 90);
});

test('portrait is panel-native, so the default is no rotation at all', () => {
  assert.equal(panelRotationDegrees('portrait', 'ccw'), 0);
  assert.equal(panelRotationDegrees('portrait', 'cw'), 180);
});

test('an invalid orientation is rejected', () => {
  assert.throws(() => panelRotationDegrees('sideways', 'cw'), /invalid orientation/);
});

test('an invalid rotation is rejected', () => {
  assert.throws(() => panelRotationDegrees('portrait', 'upright'), /invalid rotation/);
});

test('every rotation lands the rendered size on the panel framebuffer', () => {
  for (const orientation of ['landscape', 'portrait']) {
    for (const rotation of ['cw', 'ccw']) {
      const { width, height } = renderedSize(orientation);
      const degrees = panelRotationDegrees(orientation, rotation);
      const quarter = degrees === 90 || degrees === 270;
      const outWidth = quarter ? height : width;
      const outHeight = quarter ? width : height;
      assert.ok(
        matchesPanel(outWidth, outHeight),
        `${orientation}/${rotation} gave ${outWidth}x${outHeight}`,
      );
    }
  }
});

test('rendered sizes are the two panel orientations', () => {
  assert.deepEqual(renderedSize('portrait'), { width: PANEL_WIDTH, height: PANEL_HEIGHT });
  assert.deepEqual(renderedSize('landscape'), { width: PANEL_HEIGHT, height: PANEL_WIDTH });
});

test('matchesPanel rejects a transposed size', () => {
  assert.ok(matchesPanel(PANEL_WIDTH, PANEL_HEIGHT));
  assert.ok(!matchesPanel(PANEL_HEIGHT, PANEL_WIDTH));
});

test('rotation labels describe what the control actually does', () => {
  assert.match(rotationLabels('landscape').cw, /Clockwise/);
  assert.match(rotationLabels('portrait').cw, /Upside down/);
  assert.match(rotationLabels('portrait').ccw, /Upright/);
});
