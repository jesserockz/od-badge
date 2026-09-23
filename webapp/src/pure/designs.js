// A small library of named badge designs kept in localStorage.
//
// Separate from the live preferences: prefs are "what the form currently
// shows", designs are "things worth keeping". Saving a design does not change
// what you are editing, and loading one does not delete anything.
//
// Device settings and the encryption key are deliberately NOT part of a
// design. A design describes a badge, not which tag it goes on.

import { CONTACT_KEYS, DESIGN_KEYS } from './config-share.js';

export const DESIGNS_KEY = 'od-badge:v1:designs';

/** Keeps one oversized logo from filling the origin's storage quota. */
export const MAX_DESIGNS = 50;

/**
 * @typedef {object} SavedDesign
 * @property {string} name
 * @property {number} savedAt Epoch milliseconds.
 * @property {Record<string, any>} values
 */

/**
 * Read every saved design, newest first.
 *
 * Returns an empty list rather than throwing if storage is unavailable or
 * holds something unparsable: a corrupt entry should not break the app.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @returns {SavedDesign[]}
 */
export function loadDesigns(storage) {
  let raw;
  try {
    raw = storage.getItem(DESIGNS_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.name === 'string' &&
        entry.name !== '' &&
        entry.values &&
        typeof entry.values === 'object',
    )
    .map((entry) => ({
      name: entry.name,
      savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : 0,
      values: entry.values,
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Persist a list of designs.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @param {SavedDesign[]} designs
 * @returns {boolean} False if storage rejected the write (quota, private mode).
 */
export function saveDesigns(storage, designs) {
  try {
    storage.setItem(DESIGNS_KEY, JSON.stringify(designs.slice(0, MAX_DESIGNS)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract just the parts of prefs a design keeps.
 *
 * @param {Record<string, any>} prefs
 * @returns {Record<string, any>}
 */
export function designValuesFromPrefs(prefs) {
  const values = {};
  for (const key of [...DESIGN_KEYS, ...CONTACT_KEYS]) {
    if (prefs[key] !== undefined) values[key] = prefs[key];
  }
  return values;
}

/**
 * Save a design under a name, replacing any existing one with that name.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @param {string} name
 * @param {Record<string, any>} prefs
 * @param {number} [now] Injectable clock, so tests are not time-dependent.
 * @returns {{ok: boolean, designs: SavedDesign[], error?: string}}
 */
export function saveDesign(storage, name, prefs, now = Date.now()) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return { ok: false, designs: loadDesigns(storage), error: 'Give the design a name first.' };
  }
  const existing = loadDesigns(storage).filter((design) => design.name !== trimmed);
  if (existing.length >= MAX_DESIGNS) {
    return {
      ok: false,
      designs: existing,
      error: `You can keep up to ${MAX_DESIGNS} designs. Delete one first.`,
    };
  }
  const designs = [{ name: trimmed, savedAt: now, values: designValuesFromPrefs(prefs) }, ...existing];
  if (!saveDesigns(storage, designs)) {
    return { ok: false, designs: existing, error: 'Could not save: this browser refused to store it.' };
  }
  return { ok: true, designs };
}

/**
 * Delete a design by name.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @param {string} name
 * @returns {SavedDesign[]} The remaining designs.
 */
export function deleteDesign(storage, name) {
  const remaining = loadDesigns(storage).filter((design) => design.name !== name);
  saveDesigns(storage, remaining);
  return remaining;
}

/**
 * Find a design by name.
 *
 * @param {import('./prefs.js').StorageLike} storage
 * @param {string} name
 * @returns {SavedDesign|null}
 */
export function findDesign(storage, name) {
  return loadDesigns(storage).find((design) => design.name === name) || null;
}
