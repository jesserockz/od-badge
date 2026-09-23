import test from 'node:test';
import assert from 'node:assert/strict';
import { PROJECTS, findProject, resolveBrand, DEFAULT_PROJECT_ID } from '../src/pure/brands.js';

test('PROJECTS lists exactly the five expected project choices', () => {
  const ids = PROJECTS.map((p) => p.id);
  assert.deepEqual(ids, ['esphome', 'home-assistant', 'music-assistant', 'open-home-foundation', 'custom']);
});

test('resolveBrand: esphome', () => {
  const brand = resolveBrand('esphome');
  assert.equal(brand.wordmark, 'ESPHOME');
  assert.equal(brand.domain, 'esphome.io');
  assert.equal(brand.logoUrl, 'assets/brands/esphome.png');
});

test('resolveBrand: home-assistant', () => {
  const brand = resolveBrand('home-assistant');
  assert.equal(brand.wordmark, 'HOME ASSISTANT');
  assert.equal(brand.domain, 'home-assistant.io');
  assert.equal(brand.logoUrl, 'assets/brands/home-assistant.png');
});

test('resolveBrand: music-assistant', () => {
  const brand = resolveBrand('music-assistant');
  assert.equal(brand.wordmark, 'MUSIC ASSISTANT');
  assert.equal(brand.domain, 'music-assistant.io');
  assert.equal(brand.logoUrl, 'assets/brands/music-assistant.png');
});

test('resolveBrand: open-home-foundation', () => {
  const brand = resolveBrand('open-home-foundation');
  assert.equal(brand.wordmark, 'OPEN HOME');
  assert.equal(brand.domain, 'openhomefoundation.org');
  assert.equal(brand.logoUrl, 'assets/brands/open-home-foundation.png');
});

test('resolveBrand: custom pulls from the supplied custom state, not the (empty) built-in entry', () => {
  const brand = resolveBrand('custom', { wordmark: 'MY THING', domain: 'my-thing.dev', logoUrl: 'data:image/png;base64,AAA' });
  assert.equal(brand.wordmark, 'MY THING');
  assert.equal(brand.domain, 'my-thing.dev');
  assert.equal(brand.logoUrl, 'data:image/png;base64,AAA');
});

test('resolveBrand: custom with no state yet falls back to empty strings and a null logo', () => {
  const brand = resolveBrand('custom');
  assert.equal(brand.wordmark, '');
  assert.equal(brand.domain, '');
  assert.equal(brand.logoUrl, null);
});

test('findProject falls back to the default project for an unknown id', () => {
  const project = findProject('does-not-exist');
  assert.equal(project.id, DEFAULT_PROJECT_ID);
});
