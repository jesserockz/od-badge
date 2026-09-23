// Project / brand picker configuration and resolution. Pure module: no DOM,
// no fetch. The DOM-dependent renderer (src/render/badge-canvas.js) is
// responsible for actually loading the logoAsset URL or a custom logo image.

/** Brand cyan, used across all four built-in brand marks. */
export const BRAND_CYAN = '#18BCF2';
/** Brand near-white, used across all four built-in brand marks. */
export const BRAND_NEAR_WHITE = '#F2F4F9';
/** Home Assistant's additional dark colour (not used by the badge itself, kept for reference). */
export const HOME_ASSISTANT_DARK = '#1D2126';

/**
 * @typedef {object} ProjectConfig
 * @property {string} id
 * @property {string} label
 * @property {string} wordmark
 * @property {string} domain
 * @property {string|null} logoAsset Relative URL to the baked brand mark PNG, or null for "custom".
 */

/** @type {ProjectConfig[]} */
export const PROJECTS = Object.freeze([
  Object.freeze({
    id: 'esphome',
    label: 'ESPHome',
    wordmark: 'ESPHOME',
    domain: 'esphome.io',
    logoAsset: 'assets/brands/esphome.png',
  }),
  Object.freeze({
    id: 'home-assistant',
    label: 'Home Assistant',
    wordmark: 'HOME ASSISTANT',
    domain: 'home-assistant.io',
    logoAsset: 'assets/brands/home-assistant.png',
  }),
  Object.freeze({
    id: 'music-assistant',
    label: 'Music Assistant',
    wordmark: 'MUSIC ASSISTANT',
    domain: 'music-assistant.io',
    logoAsset: 'assets/brands/music-assistant.png',
  }),
  Object.freeze({
    id: 'open-home-foundation',
    label: 'Open Home Foundation',
    wordmark: 'OPEN HOME',
    domain: 'openhomefoundation.org',
    logoAsset: 'assets/brands/open-home-foundation.png',
  }),
  Object.freeze({
    id: 'custom',
    label: 'Custom',
    wordmark: '',
    domain: '',
    logoAsset: null,
  }),
]);

export const DEFAULT_PROJECT_ID = 'esphome';

/**
 * @param {string} projectId
 * @returns {ProjectConfig}
 */
export function findProject(projectId) {
  return PROJECTS.find((project) => project.id === projectId) ?? PROJECTS[0];
}

/**
 * @typedef {object} CustomBrandState
 * @property {string} [wordmark]
 * @property {string} [domain]
 * @property {string|null} [logoUrl] Data URL (or object URL) of a user-uploaded logo image.
 */

/**
 * @typedef {object} ResolvedBrand
 * @property {string} wordmark
 * @property {string} domain
 * @property {string|null} logoUrl
 */

/**
 * Resolve the wordmark/domain/logo to render for the given project
 * selection. For "custom" this pulls from the caller-supplied custom brand
 * state instead of the (empty) built-in project entry.
 *
 * @param {string} projectId
 * @param {CustomBrandState} [custom]
 * @returns {ResolvedBrand}
 */
export function resolveBrand(projectId, custom = {}) {
  const project = findProject(projectId);
  if (project.id === 'custom') {
    return {
      wordmark: custom.wordmark ?? '',
      domain: custom.domain ?? '',
      logoUrl: custom.logoUrl ?? null,
    };
  }
  return { wordmark: project.wordmark, domain: project.domain, logoUrl: project.logoAsset };
}
