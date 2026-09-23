import test from 'node:test';
import assert from 'node:assert/strict';

import { PREVIEW_EXAMPLE, hasOwnContent, withPreviewExample } from '../src/pure/preview-example.js';

test('an empty form previews the example rather than a blank badge', () => {
  const { content, usingExample } = withPreviewExample({ handle: '', name: '', qrUrl: '' });
  assert.equal(usingExample, true);
  assert.equal(content.handle, PREVIEW_EXAMPLE.handle);
  assert.equal(content.name, PREVIEW_EXAMPLE.name);
  assert.equal(content.qrUrl, PREVIEW_EXAMPLE.qrUrl);
});

test('whitespace counts as empty', () => {
  const { content, usingExample } = withPreviewExample({ handle: '   ', name: '\t', qrUrl: '' });
  assert.equal(usingExample, true);
  assert.equal(content.handle, PREVIEW_EXAMPLE.handle);
});

test('a missing field is treated as empty, not left undefined', () => {
  const { content } = withPreviewExample({});
  assert.equal(content.handle, PREVIEW_EXAMPLE.handle);
  assert.equal(content.name, PREVIEW_EXAMPLE.name);
});

test('real values are never overwritten', () => {
  const { content, usingExample } = withPreviewExample({
    handle: '@someone',
    name: 'SOMEONE',
    qrUrl: 'https://example.com',
  });
  assert.equal(usingExample, false);
  assert.equal(content.handle, '@someone');
  assert.equal(content.name, 'SOMEONE');
  assert.equal(content.qrUrl, 'https://example.com');
});

test('a partly filled form keeps what was typed and fills the rest', () => {
  const { content, usingExample } = withPreviewExample({ handle: '@someone', name: '', qrUrl: '' });
  assert.equal(usingExample, true);
  assert.equal(content.handle, '@someone');
  assert.equal(content.name, PREVIEW_EXAMPLE.name);
});

test('other fields pass through untouched', () => {
  const { content } = withPreviewExample({ handle: '', wordmark: 'ESPHOME', domain: 'esphome.io' });
  assert.equal(content.wordmark, 'ESPHOME');
  assert.equal(content.domain, 'esphome.io');
});

test('withPreviewExample does not mutate its input', () => {
  const original = { handle: '', name: '', qrUrl: '' };
  withPreviewExample(original);
  assert.deepEqual(original, { handle: '', name: '', qrUrl: '' });
});

test('hasOwnContent gates anything that leaves the browser', () => {
  // Sending the example to a real tag would print "@yourhandle" on a badge.
  assert.equal(hasOwnContent({ handle: '', name: '', qrUrl: '' }), false);
  assert.equal(hasOwnContent({ handle: '  ', name: '', qrUrl: '' }), false);
  assert.equal(hasOwnContent({}), false);
  assert.equal(hasOwnContent({ handle: '@someone' }), true);
  assert.equal(hasOwnContent({ name: 'SOMEONE' }), true);
  assert.equal(hasOwnContent({ qrUrl: 'https://example.com' }), true);
});

test('the example is not mistaken for real content', () => {
  // A visitor who never types anything must still count as having typed nothing.
  const { content } = withPreviewExample({ handle: '', name: '', qrUrl: '' });
  assert.equal(hasOwnContent({ handle: '', name: '', qrUrl: '' }), false);
  assert.equal(content.handle, PREVIEW_EXAMPLE.handle);
});
