import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DESIGNS_KEY,
  MAX_DESIGNS,
  deleteDesign,
  designValuesFromPrefs,
  findDesign,
  loadDesigns,
  saveDesign,
} from '../src/pure/designs.js';

/** In-memory stand-in for localStorage. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

const PREFS = {
  project: 'esphome',
  handle: '@janedoe',
  name: 'JANE',
  qrUrl: 'https://github.com/janedoe',
  contactEmail: 'jane@example.com',
  devicePrefix: 'ODD8',
  rememberKey: true,
  orientation: 'landscape',
};

test('an empty store has no designs', () => {
  assert.deepEqual(loadDesigns(fakeStorage()), []);
});

test('a design keeps the badge and contact, but never device settings', () => {
  const values = designValuesFromPrefs(PREFS);
  assert.equal(values.handle, '@janedoe');
  assert.equal(values.contactEmail, 'jane@example.com');
  // A design describes a badge, not which tag it goes on.
  assert.equal(values.devicePrefix, undefined);
  assert.equal(values.rememberKey, undefined);
});

test('save then load round-trips', () => {
  const storage = fakeStorage();
  const result = saveDesign(storage, 'Conference', PREFS, 1000);
  assert.equal(result.ok, true);
  const found = findDesign(storage, 'Conference');
  assert.equal(found.values.handle, '@janedoe');
  assert.equal(found.savedAt, 1000);
});

test('saving the same name replaces rather than duplicating', () => {
  const storage = fakeStorage();
  saveDesign(storage, 'Dup', PREFS, 1000);
  saveDesign(storage, 'Dup', { ...PREFS, handle: '@changed' }, 2000);
  const designs = loadDesigns(storage);
  assert.equal(designs.length, 1);
  assert.equal(designs[0].values.handle, '@changed');
});

test('a blank or whitespace name is refused', () => {
  const storage = fakeStorage();
  for (const name of ['', '   ', null]) {
    const result = saveDesign(storage, name, PREFS);
    assert.equal(result.ok, false);
    assert.match(result.error, /name/);
  }
  assert.deepEqual(loadDesigns(storage), []);
});

test('names are trimmed', () => {
  const storage = fakeStorage();
  saveDesign(storage, '  Padded  ', PREFS);
  assert.ok(findDesign(storage, 'Padded'));
});

test('designs come back newest first', () => {
  const storage = fakeStorage();
  saveDesign(storage, 'old', PREFS, 1000);
  saveDesign(storage, 'new', PREFS, 3000);
  saveDesign(storage, 'middle', PREFS, 2000);
  assert.deepEqual(loadDesigns(storage).map((d) => d.name), ['new', 'middle', 'old']);
});

test('delete removes one and leaves the rest', () => {
  const storage = fakeStorage();
  saveDesign(storage, 'keep', PREFS, 1000);
  saveDesign(storage, 'drop', PREFS, 2000);
  const remaining = deleteDesign(storage, 'drop');
  assert.deepEqual(remaining.map((d) => d.name), ['keep']);
  assert.equal(findDesign(storage, 'drop'), null);
});

test('deleting something that is not there is harmless', () => {
  const storage = fakeStorage();
  saveDesign(storage, 'keep', PREFS, 1000);
  assert.equal(deleteDesign(storage, 'ghost').length, 1);
});

test('the design count is capped', () => {
  const storage = fakeStorage();
  for (let i = 0; i < MAX_DESIGNS; i++) saveDesign(storage, `design-${i}`, PREFS, i);
  const result = saveDesign(storage, 'one-too-many', PREFS, 9999);
  assert.equal(result.ok, false);
  assert.match(result.error, /up to/);
  assert.equal(findDesign(storage, 'one-too-many'), null);
});

test('corrupt or non-array stored data reads as empty, not a crash', () => {
  assert.deepEqual(loadDesigns(fakeStorage({ [DESIGNS_KEY]: 'not json' })), []);
  assert.deepEqual(loadDesigns(fakeStorage({ [DESIGNS_KEY]: '{"not":"an array"}' })), []);
});

test('malformed individual entries are skipped, good ones kept', () => {
  const stored = JSON.stringify([
    { name: 'good', savedAt: 1, values: { handle: '@a' } },
    { name: '', values: {} },
    { nope: true },
    null,
    'string',
  ]);
  const designs = loadDesigns(fakeStorage({ [DESIGNS_KEY]: stored }));
  assert.deepEqual(designs.map((d) => d.name), ['good']);
});

test('an entry with no timestamp still loads', () => {
  const stored = JSON.stringify([{ name: 'untimed', values: { handle: '@a' } }]);
  assert.equal(loadDesigns(fakeStorage({ [DESIGNS_KEY]: stored }))[0].savedAt, 0);
});

test('storage that throws on read reads as empty', () => {
  const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => {}, removeItem: () => {} };
  assert.deepEqual(loadDesigns(storage), []);
});

test('storage that throws on write reports failure instead of pretending', () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => {},
  };
  const result = saveDesign(storage, 'too big', PREFS);
  assert.equal(result.ok, false);
  assert.match(result.error, /refused to store/);
});

test('a saved design does not capture the preview scale', () => {
  const values = designValuesFromPrefs({ ...PREFS, previewScale: 1 });
  assert.equal(values.previewScale, undefined);
});
