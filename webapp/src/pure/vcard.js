// Ported byte-for-byte from od_badge/vcard.py.
//
// A URI record makes a phone offer to open a link. A "text/vcard" MIME
// record instead makes it offer to save a contact, which is what a name
// badge wants: tap the badge, keep the person's details.
//
// vCard 3.0 is used rather than 4.0 because Android and iOS both import it
// without complaint. Lines are joined with CRLF as the spec requires.

/** @type {string} */
export const VCARD_MIME_TYPE = 'text/vcard';

/** @type {string} */
export const VCARD_LINE_ENDING = '\r\n';

/** @type {string} */
export const DEFAULT_CONTACT_NAME = '';

/** @type {string} */
// No personal details are baked in: the contact fields start empty and
// whatever the user types stays in their own browser.
export const DEFAULT_CONTACT_EMAIL = '';

/**
 * @typedef {object} VCardContact
 * @property {string} [name]
 * @property {string} [email]
 * @property {string} [url]
 * @property {string} [nickname]
 */

/**
 * Split a display name into [family, given] for the vCard N property.
 *
 * The last whitespace-separated token is treated as the family name. A
 * single-token name has no family name, which is valid: N simply carries
 * the given name only.
 *
 * @param {string} fullName
 * @returns {[string, string]}
 */
export function splitName(fullName) {
  const parts = fullName.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length < 2) {
    return ['', fullName.trim()];
  }
  return [parts[parts.length - 1], parts.slice(0, -1).join(' ')];
}

/**
 * Escape a value for a vCard property per RFC 2426.
 *
 * Backslashes must be escaped first, otherwise the escapes added for the
 * other characters would themselves be escaped again.
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeValue(value) {
  let escaped = value.replace(/\\/g, '\\\\');
  escaped = escaped.replace(/;/g, '\\;');
  escaped = escaped.replace(/,/g, '\\,');
  return escaped.replace(/\n/g, '\\n');
}

/**
 * Render a contact as a vCard 3.0 string.
 *
 * Only non-empty fields are emitted, so a contact without a URL or nickname
 * produces a card without those properties rather than an empty one a phone
 * might import as blank.
 *
 * @param {VCardContact} contact
 * @returns {string}
 */
export function buildVCard(contact) {
  const name = contact.name ?? DEFAULT_CONTACT_NAME;
  const email = contact.email ?? DEFAULT_CONTACT_EMAIL;
  const url = contact.url ?? '';
  const nickname = contact.nickname ?? '';

  const [family, given] = splitName(name);
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escapeValue(family)};${escapeValue(given)};;;`, `FN:${escapeValue(name)}`];
  if (nickname) {
    lines.push(`NICKNAME:${escapeValue(nickname)}`);
  }
  if (email) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeValue(email)}`);
  }
  if (url) {
    lines.push(`URL:${escapeValue(url)}`);
  }
  lines.push('END:VCARD');
  return lines.join(VCARD_LINE_ENDING) + VCARD_LINE_ENDING;
}
