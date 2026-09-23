// Example content used to fill the preview before anyone has typed anything.
//
// Nothing is pre-filled into the form: the fields start empty and show these
// as placeholder attributes. But an empty form would otherwise draw an almost
// blank badge, which tells a first-time visitor nothing about what the tool
// makes. So the preview substitutes these examples for whatever is still
// empty.
//
// This is strictly a preview affordance. Everything that leaves the browser
// uses what the user actually typed: sending to a tag, writing the NFC card,
// sharing a link, saving a design and downloading a config all read the real
// values, so nobody can accidentally publish a badge that says "@yourhandle".

/** @type {Readonly<Record<string, string>>} */
export const PREVIEW_EXAMPLE = Object.freeze({
  handle: '@yourhandle',
  name: 'YOUR NAME',
  qrUrl: 'https://github.com/yourhandle',
});

/**
 * Fill empty content fields with the example values, for preview only.
 *
 * @param {Record<string, any>} content
 * @returns {{content: Record<string, any>, usingExample: boolean}}
 */
export function withPreviewExample(content) {
  const filled = { ...content };
  let usingExample = false;
  for (const [key, example] of Object.entries(PREVIEW_EXAMPLE)) {
    if (typeof filled[key] !== 'string' || filled[key].trim() === '') {
      filled[key] = example;
      usingExample = true;
    }
  }
  return { content: filled, usingExample };
}

/**
 * Whether the user has supplied any content of their own at all.
 *
 * Used to refuse sending or writing a badge that carries nothing but the
 * example text.
 *
 * @param {Record<string, any>} content
 * @returns {boolean}
 */
export function hasOwnContent(content) {
  return Object.keys(PREVIEW_EXAMPLE).some(
    (key) => typeof content[key] === 'string' && content[key].trim() !== '',
  );
}
