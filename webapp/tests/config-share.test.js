import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIG_VERSION,
  buildConfig,
  buildShareUrl,
  configToPrefs,
  decodeConfig,
  encodeConfig,
  shareStringFromHash,
} from '../src/pure/config-share.js';

const PREFS = {
  project: 'esphome',
  customWordmark: '',
  customDomain: '',
  customLogoDataUrl: 'data:image/png;base64,AAAA',
  handle: '@janedoe',
  name: 'JANE',
  qrUrl: 'https://github.com/janedoe',
  contactName: 'Jane Doe',
  contactEmail: 'jane@example.com',
  orientation: 'landscape',
  rotation: 'ccw',
  previewScale: 2,
  compensateRedYellow: true,
  devicePrefix: 'ODD8',
  rememberKey: true,
};

test('a default config carries the design and nothing personal', () => {
  const config = buildConfig(PREFS);
  assert.equal(config.v, CONFIG_VERSION);
  assert.equal(config.design.handle, '@janedoe');
  assert.equal(config.contact, undefined);
  assert.equal(config.device, undefined);
});

test('contact details are only included when asked for', () => {
  const without = buildConfig(PREFS, { includeContact: false });
  assert.equal(without.contact, undefined);
  const withContact = buildConfig(PREFS, { includeContact: true });
  assert.equal(withContact.contact.contactEmail, 'jane@example.com');
});

test('the encryption key is never included unless explicitly requested', () => {
  const shared = buildConfig(PREFS, { includeContact: true, includeDevice: true, forShare: true }, 'AABB');
  assert.equal(JSON.stringify(shared).includes('AABB'), false);

  const file = buildConfig(PREFS, { includeDevice: true, includeKey: true }, 'AABB');
  assert.equal(file.device.key, 'AABB');
});

test('includeKey without a key does not invent a device section', () => {
  const config = buildConfig(PREFS, { includeKey: true }, '');
  assert.equal(config.device, undefined);
});

test('a share config drops the custom logo, a file config keeps it', () => {
  const shared = buildConfig(PREFS, { forShare: true });
  assert.equal(shared.design.customLogoDataUrl, undefined);
  const file = buildConfig(PREFS);
  assert.equal(file.design.customLogoDataUrl, 'data:image/png;base64,AAAA');
});

test('encode and decode round-trip', () => {
  const config = buildConfig(PREFS, { includeContact: true });
  assert.deepEqual(decodeConfig(encodeConfig(config)), config);
});

test('the share string is URL safe', () => {
  const encoded = encodeConfig(buildConfig(PREFS, { includeContact: true }));
  assert.equal(/^[A-Za-z0-9_-]+$/.test(encoded), true);
});

test('non-ASCII content survives the round-trip', () => {
  const config = buildConfig({ ...PREFS, name: 'JOSÉ 日本 🎉' });
  assert.equal(decodeConfig(encodeConfig(config)).design.name, 'JOSÉ 日本 🎉');
});

test('decode rejects rubbish, non-JSON and non-objects', () => {
  assert.throws(() => decodeConfig('!!!not base64!!!'), /not valid/);
  assert.throws(() => decodeConfig(encodeConfigRaw('not json at all')), /not valid/);
  assert.throws(() => decodeConfig(encodeConfigRaw(JSON.stringify([1, 2]))), /not valid/);
});

test('decode rejects a config from a different version', () => {
  const encoded = encodeConfigRaw(JSON.stringify({ v: 999, design: {} }));
  assert.throws(() => decodeConfig(encoded), /different version/);
});

test('configToPrefs keeps known keys and drops unknown ones', () => {
  const { prefs } = configToPrefs({
    v: CONFIG_VERSION,
    design: { handle: '@someone', evil: 'nope' },
    contact: { contactEmail: 'a@b.c', alsoEvil: 'nope' },
  });
  assert.equal(prefs.handle, '@someone');
  assert.equal(prefs.contactEmail, 'a@b.c');
  assert.equal(prefs.evil, undefined);
  assert.equal(prefs.alsoEvil, undefined);
});

test('configToPrefs rejects a remote logo URL but keeps a data URL', () => {
  // A config can come from someone else's link: fetching their URL would tell
  // them the badge was opened.
  const remote = configToPrefs({
    v: CONFIG_VERSION,
    design: { customLogoDataUrl: 'https://tracker.example/pixel.png' },
  });
  assert.equal(remote.prefs.customLogoDataUrl, undefined);

  const inline = configToPrefs({
    v: CONFIG_VERSION,
    design: { customLogoDataUrl: 'data:image/png;base64,AAAA' },
  });
  assert.equal(inline.prefs.customLogoDataUrl, 'data:image/png;base64,AAAA');
});

test('configToPrefs survives missing or malformed sections', () => {
  const { prefs, key } = configToPrefs({ v: CONFIG_VERSION, design: null, contact: 'nope' });
  assert.deepEqual(prefs, {});
  assert.equal(key, '');
});

test('configToPrefs returns the key from a downloaded file', () => {
  const { key } = configToPrefs({ v: CONFIG_VERSION, device: { key: 'AABB' } });
  assert.equal(key, 'AABB');
});

test('the share URL uses the fragment so it never reaches a server', () => {
  const url = buildShareUrl('https://example.com/badge/', buildConfig(PREFS));
  assert.equal(url.includes('#badge='), true);
  assert.equal(url.includes('?'), false);
});

test('buildShareUrl replaces an existing fragment rather than stacking', () => {
  const url = buildShareUrl('https://example.com/#badge=old', buildConfig(PREFS));
  assert.equal(url.split('#badge=').length, 2);
});

test('shareStringFromHash finds the config, or returns null', () => {
  assert.equal(shareStringFromHash('#badge=abc123'), 'abc123');
  assert.equal(shareStringFromHash('#other=1&badge=abc123'), 'abc123');
  assert.equal(shareStringFromHash('#nothing'), null);
  assert.equal(shareStringFromHash(''), null);
  assert.equal(shareStringFromHash(undefined), null);
});

/** Encode an arbitrary string the same way encodeConfig does, for negative tests. */
function encodeConfigRaw(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('previewScale is a local viewing preference, not part of a config', () => {
  // How big the preview is drawn on this screen should not follow a link
  // around or come back when a saved design is loaded.
  for (const options of [{}, { forShare: true }, { includeContact: true, includeDevice: true }]) {
    const config = buildConfig(PREFS, options);
    assert.equal(config.design.previewScale, undefined);
    assert.equal(JSON.stringify(config).includes('previewScale'), false);
  }
  const { prefs } = configToPrefs({ v: CONFIG_VERSION, design: { previewScale: 1 } });
  assert.equal(prefs.previewScale, undefined);
});
