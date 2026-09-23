// Badge configuration as portable data: a share string for a link, and a
// full JSON file for download.
//
// Three deliberate splits, because these carry different risk:
//
//   design   the badge itself. Always included, never sensitive.
//   contact  the name and email on the NFC vCard. Personal, so including it
//            in a share link is asked about each time rather than assumed.
//   device   the tag's name prefix and encryption key. NEVER in a share
//            string, only in a file the user downloads deliberately.
//
// Share strings go in the URL fragment rather than a query parameter, so the
// config is never sent to a web server or written to its logs.

/** Bumped when the shape changes in a way older readers cannot handle. */
export const CONFIG_VERSION = 1;

/** Fields that describe the badge itself. */
export const DESIGN_KEYS = Object.freeze([
  'project',
  'customWordmark',
  'customDomain',
  'customLogoDataUrl',
  'handle',
  'name',
  'qrUrl',
  'orientation',
  'rotation',
  'previewScale',
  'compensateRedYellow',
]);

/** Personal fields: only shared when the user opts in. */
export const CONTACT_KEYS = Object.freeze(['contactName', 'contactEmail']);

/** Device fields: file download only, never a share string. */
export const DEVICE_KEYS = Object.freeze(['devicePrefix']);

/**
 * A custom logo is a data URL and can be hundreds of kilobytes, which does
 * not fit in a URL. It is kept in downloaded files and dropped from share
 * strings.
 */
export const SHARE_EXCLUDED_KEYS = Object.freeze(['customLogoDataUrl']);

/** Practical ceiling for a URL that should survive being pasted around. */
export const SHARE_URL_SOFT_LIMIT = 2000;

/**
 * @typedef {object} ConfigOptions
 * @property {boolean} [includeContact] Include the vCard name and email.
 * @property {boolean} [includeDevice] Include the device name prefix.
 * @property {boolean} [includeKey] Include the encryption key. File only.
 * @property {boolean} [forShare] Drop fields too large for a URL.
 */

/**
 * Build a config object from preferences.
 *
 * @param {Record<string, any>} prefs
 * @param {ConfigOptions} [options]
 * @param {string} [keyHex] The encryption key, used only with includeKey.
 * @returns {Record<string, any>}
 */
export function buildConfig(prefs, options = {}, keyHex = '') {
  const pick = (keys) => {
    const out = {};
    for (const key of keys) {
      if (options.forShare && SHARE_EXCLUDED_KEYS.includes(key)) continue;
      if (prefs[key] !== undefined) out[key] = prefs[key];
    }
    return out;
  };

  /** @type {Record<string, any>} */
  const config = { v: CONFIG_VERSION, design: pick(DESIGN_KEYS) };
  if (options.includeContact) config.contact = pick(CONTACT_KEYS);
  if (options.includeDevice) config.device = pick(DEVICE_KEYS);
  if (options.includeKey && keyHex) {
    config.device = { ...(config.device || {}), key: keyHex };
  }
  return config;
}

/**
 * Flatten a config back into a partial preferences object.
 *
 * Unknown keys are dropped rather than trusted: a config can arrive from a
 * link someone else built, so only the fields this app knows about are
 * applied.
 *
 * @param {Record<string, any>} config
 * @returns {{prefs: Record<string, any>, key: string}}
 */
export function configToPrefs(config) {
  const prefs = {};
  const take = (source, keys) => {
    if (!source || typeof source !== 'object') return;
    for (const key of keys) {
      if (typeof source[key] !== 'undefined') prefs[key] = source[key];
    }
  };
  take(config.design, DESIGN_KEYS);
  take(config.contact, CONTACT_KEYS);
  take(config.device, DEVICE_KEYS);

  // A custom logo from an untrusted config must be an inline data URL. An
  // http(s) URL here would make the page fetch a third party's server, which
  // leaks that the badge was opened.
  if (typeof prefs.customLogoDataUrl === 'string' && !prefs.customLogoDataUrl.startsWith('data:')) {
    delete prefs.customLogoDataUrl;
  }

  const key = config.device && typeof config.device.key === 'string' ? config.device.key : '';
  return { prefs, key };
}

/**
 * Encode a config as a URL-safe base64 string.
 *
 * @param {Record<string, any>} config
 * @returns {string}
 */
export function encodeConfig(config) {
  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode a URL-safe base64 share string.
 *
 * @param {string} encoded
 * @returns {Record<string, any>}
 * @throws {Error} If it is not valid base64, not JSON, or not a config object.
 */
export function decodeConfig(encoded) {
  const normalised = String(encoded).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  let json;
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    json = new TextDecoder().decode(bytes);
  } catch {
    throw new Error('That badge link is not valid (could not decode it).');
  }
  let config;
  try {
    config = JSON.parse(json);
  } catch {
    throw new Error('That badge link is not valid (not readable as a config).');
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('That badge link is not valid (not a config).');
  }
  if (config.v !== CONFIG_VERSION) {
    throw new Error(`That badge link was made by a different version (v${config.v}).`);
  }
  return config;
}

/**
 * Build a full share URL from a base URL and a config.
 *
 * @param {string} baseUrl The page URL, without any existing fragment.
 * @param {Record<string, any>} config
 * @returns {string}
 */
export function buildShareUrl(baseUrl, config) {
  const base = String(baseUrl).split('#')[0];
  return `${base}#badge=${encodeConfig(config)}`;
}

/**
 * Pull the share string out of a URL fragment, if present.
 *
 * @param {string} hash e.g. "#badge=eyJ2Ijox..."
 * @returns {string|null}
 */
export function shareStringFromHash(hash) {
  const match = /(?:^#|&)badge=([^&]+)/.exec(String(hash || ''));
  return match ? match[1] : null;
}
