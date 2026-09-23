// DOM wiring for the badge designer. This module is intentionally thin: all
// the logic that can be unit tested lives in src/pure/*.js, and all the
// canvas drawing lives in src/render/*.js. This file just reads/writes form
// fields, persists preferences, and drives the BLE/NFC actions.

import { buildVCard } from '../pure/vcard.js';
import { computeDitherIndices, wireMapFor } from '../pure/palette.js';
import { PROJECTS, resolveBrand } from '../pure/brands.js';
import { loadPrefs, savePrefs, loadStoredKey, saveStoredKey, clearStoredKey } from '../pure/prefs.js';
import {
  buildConfig,
  buildShareUrl,
  configToPrefs,
  decodeConfig,
  shareStringFromHash,
  SHARE_URL_SOFT_LIMIT,
} from '../pure/config-share.js';
import { deleteDesign, findDesign, loadDesigns, saveDesign } from '../pure/designs.js';
import {
  deleteDevice,
  findDevice,
  isValidKeyHex,
  loadDevices,
  mergeDevices,
  saveDevice,
} from '../pure/devices.js';
import {
  renderBadge,
  renderBadgePortrait,
  prepareForPanel,
  ensureFontsLoaded,
} from '../render/badge-canvas.js';
import { rotationLabels, renderedSize } from '../pure/panel-orientation.js';
import { hasOwnContent, withPreviewExample } from '../pure/preview-example.js';
import { antennaEdge } from '../pure/nfc-placement.js';
import { isWebBluetoothSupported, createBleClient, connectAndAuthenticate, disconnectBleClient, sendBadgeToDisplay, parseKeyHex } from '../ble/ble-client.js';
import { writeVCardOverBle } from '../ble/nfc-write.js';

/** A minimal storage interface wrapping window.localStorage, or an in-memory fallback if it throws on access. */
function getStorage() {
  try {
    const probeKey = '__od_badge_storage_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    return window.localStorage;
  } catch {
    // Private-mode Safari (and similar) can throw just accessing
    // localStorage. Fall back to an in-memory stand-in so the rest of the
    // app still works for the current page load.
    const memory = new Map();
    return {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    };
  }
}

const storage = getStorage();

/** @type {{[id: string]: HTMLElement}} */
const el = {};
for (const id of [
  'bluetooth-unsupported',
  'badge-form',
  'field-project',
  'custom-fields',
  'field-custom-wordmark',
  'field-custom-domain',
  'field-custom-logo',
  'field-handle',
  'field-name',
  'field-scale',
  'field-qrurl',
  'field-contact-name',
  'field-contact-email',
  'field-orientation',
  'field-rotation',
  'field-compensate',
  'field-device-prefix',
  'field-key',
  'field-remember-key',
  'btn-toggle-key',
  'remember-key-warning',
  'badge-canvas',
  'btn-connect',
  'btn-disconnect',
  'btn-send',
  'btn-nfc',
  'btn-download',
  'progress-wrap',
  'progress-bar',
  'btn-share',
  'btn-export',
  'btn-import',
  'field-import-file',
  'share-dialog',
  'field-share-contact',
  'field-share-device',
  'field-share-url',
  'share-size',
  'btn-share-copy',
  'field-design-name',
  'field-design-list',
  'btn-design-save',
  'btn-design-load',
  'btn-design-delete',
  'field-device-list',
  'btn-device-load',
  'btn-device-delete',
  'field-device-name',
  'btn-device-save',
  'preview-example-note',
  'status-line',
]) {
  el[id] = document.getElementById(id);
}

/** @type {import('../pure/prefs.js').BadgePrefs} */
let prefs = loadPrefs(storage);

/** The encryption key, held only in memory unless "remember key" is on. Never logged. */
let encryptionKeyHex = loadStoredKey(storage) || '';

/** @type {any} */
let bleClient = null;

/**
 * @param {string} message
 */
function setStatus(message) {
  el['status-line'].textContent = message;
}

/**
 * @param {boolean} visible
 * @param {number} [percent]
 */
function setProgress(visible, percent = 0) {
  el['progress-wrap'].hidden = !visible;
  el['progress-bar'].value = Math.max(0, Math.min(100, percent));
}

/**
 * Populate the project <select> options from the shared PROJECTS config,
 * so the dropdown can never drift out of sync with what resolveBrand()
 * actually knows about.
 * @returns {void}
 */
function populateProjectOptions() {
  const select = /** @type {HTMLSelectElement} */ (el['field-project']);
  select.innerHTML = '';
  for (const project of PROJECTS) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.label;
    select.appendChild(option);
  }
}

/**
 * Apply loaded preferences to the form fields.
 * @returns {void}
 */
function applyPrefsToForm() {
  el['field-project'].value = prefs.project;
  el['field-custom-wordmark'].value = prefs.customWordmark;
  el['field-custom-domain'].value = prefs.customDomain;
  el['field-handle'].value = prefs.handle;
  el['field-name'].value = prefs.name;
  el['field-scale'].value = String(prefs.previewScale);
  el['field-qrurl'].value = prefs.qrUrl;
  el['field-contact-name'].value = prefs.contactName;
  el['field-contact-email'].value = prefs.contactEmail;
  el['field-orientation'].value = prefs.orientation;
  el['field-rotation'].value = prefs.rotation;
  el['field-compensate'].checked = prefs.compensateRedYellow;
  el['field-device-prefix'].value = prefs.devicePrefix;
  el['field-remember-key'].checked = prefs.rememberKey;
  el['field-key'].value = encryptionKeyHex;
  el['custom-fields'].hidden = prefs.project !== 'custom';
}

/**
 * Read the form fields back into the in-memory prefs object.
 * @returns {void}
 */
function readFormIntoPrefs() {
  prefs = {
    ...prefs,
    project: el['field-project'].value,
    customWordmark: el['field-custom-wordmark'].value,
    customDomain: el['field-custom-domain'].value,
    handle: el['field-handle'].value,
    name: el['field-name'].value,
    previewScale: Number(el['field-scale'].value) === 1 ? 1 : 2,
    qrUrl: el['field-qrurl'].value,
    contactName: el['field-contact-name'].value,
    contactEmail: el['field-contact-email'].value,
    orientation: el['field-orientation'].value,
    rotation: el['field-rotation'].value,
    compensateRedYellow: el['field-compensate'].checked,
    devicePrefix: el['field-device-prefix'].value,
    rememberKey: el['field-remember-key'].checked,
  };
}

/**
 * @template {(...args: any[]) => void} F
 * @param {F} fn
 * @param {number} delayMs
 * @returns {F}
 */
function debounce(fn, delayMs) {
  let timer = null;
  return /** @type {F} */ (
    (...args) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delayMs);
    }
  );
}

/**
 * Build the badge content object the renderer expects from the current form state.
 * @returns {{handle: string, name: string, qrUrl: string, wordmark: string, domain: string}}
 */
function currentBadgeContent() {
  const brand = resolveBrand(prefs.project, {
    wordmark: prefs.customWordmark,
    domain: prefs.customDomain,
    logoUrl: prefs.customLogoDataUrl || null,
  });
  return {
    handle: prefs.handle,
    name: prefs.name,
    qrUrl: prefs.qrUrl,
    wordmark: brand.wordmark,
    domain: brand.domain,
  };
}

/**
 * @returns {string|null}
 */
function currentLogoUrl() {
  const brand = resolveBrand(prefs.project, {
    wordmark: prefs.customWordmark,
    domain: prefs.customDomain,
    logoUrl: prefs.customLogoDataUrl || null,
  });
  return brand.logoUrl;
}

let lastLayout = null;

/**
 * Relabel the rotation control: a quarter turn in landscape, an upright or
 * upside-down choice in portrait.
 *
 * @param {import('../pure/panel-orientation.js').Orientation} orientation
 * @returns {void}
 */
function applyRotationLabels(orientation) {
  const labels = rotationLabels(orientation);
  for (const option of el['field-rotation'].options) {
    if (option.value === 'ccw') option.textContent = labels.ccw;
    if (option.value === 'cw') option.textContent = labels.cw;
  }
}

/**
 * Re-render the badge canvas from the current form state.
 * @returns {Promise<void>}
 */
async function rerender() {
  try {
    const orientation = el['field-orientation'].value;
    const portrait = orientation === 'portrait';
    const render = portrait ? renderBadgePortrait : renderBadge;
    const { width, height } = renderedSize(orientation);
    const markEdge = antennaEdge(orientation, prefs.rotation, width, height);
    const { content, usingExample } = withPreviewExample(currentBadgeContent());
    lastLayout = await render(el['badge-canvas'], {
      content,
      logoUrl: currentLogoUrl(),
      markEdge,
    });
    el['preview-example-note'].hidden = !usingExample;
    el['badge-canvas'].dataset.scale = String(prefs.previewScale);
    // The canvas keeps its own aspect via CSS; tell it which one to use.
    el['badge-canvas'].classList.toggle('portrait', portrait);
    applyRotationLabels(portrait ? 'portrait' : 'landscape');
  } catch (error) {
    setStatus(`Render error: ${error.message}`);
  }
}

const debouncedRerender = debounce(() => {
  rerender();
}, 120);

const debouncedSave = debounce(() => {
  savePrefs(storage, prefs);
}, 300);

/**
 * Handle any form input/change: sync prefs, persist, re-render.
 * @returns {void}
 */
function onFormChanged() {
  readFormIntoPrefs();
  el['custom-fields'].hidden = prefs.project !== 'custom';
  debouncedSave();
  debouncedRerender();
}

el['badge-form'].addEventListener('input', onFormChanged);
el['badge-form'].addEventListener('change', onFormChanged);

el['field-key'].addEventListener('input', () => {
  encryptionKeyHex = el['field-key'].value;
});

el['field-remember-key'].addEventListener('change', () => {
  prefs.rememberKey = el['field-remember-key'].checked;
  if (prefs.rememberKey) {
    saveStoredKey(storage, encryptionKeyHex);
  } else {
    clearStoredKey(storage);
  }
  debouncedSave();
});

/**
 * Read a File as a data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(/** @type {string} */ (reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('failed to read file'));
    reader.readAsDataURL(file);
  });
}

el['field-custom-logo'].addEventListener('change', async () => {
  const input = /** @type {HTMLInputElement} */ (el['field-custom-logo']);
  const file = input.files && input.files[0];
  if (!file) {
    return;
  }
  try {
    // Both PNG and SVG data URLs can be drawn directly through an
    // <img>/drawImage() -- browsers rasterize an SVG image the same way as
    // a raster one when it is used as a canvas drawing source.
    const dataUrl = await readFileAsDataUrl(file);
    prefs.customLogoDataUrl = dataUrl;
    debouncedSave();
    debouncedRerender();
  } catch (error) {
    setStatus(`Could not read logo file: ${error.message}`);
  }
});

/**
 * Put the action buttons into their connected or disconnected state.
 *
 * One place owns this so the UI cannot end up showing Disconnect while the
 * client is gone, or Send enabled with nothing to send to.
 *
 * @param {boolean} connected
 * @returns {void}
 */
function setConnectedUi(connected) {
  el['btn-connect'].hidden = connected;
  el['btn-disconnect'].hidden = !connected;
  el['btn-connect'].disabled = connected || !bluetoothAvailable;
  el['btn-disconnect'].disabled = !connected;
  el['btn-send'].disabled = !connected;
  el['btn-nfc'].disabled = !connected;
}

/**
 * Drop the client and reset the UI. Used by the Disconnect button and by an
 * unexpected drop, so both paths leave exactly the same state behind.
 *
 * @param {string} message
 * @returns {void}
 */
function handleDisconnected(message) {
  bleClient = null;
  setConnectedUi(false);
  setProgress(false);
  setStatus(message);
}

// --- Web Bluetooth availability -------------------------------------------------

const bluetoothAvailable = isWebBluetoothSupported();
if (!bluetoothAvailable) {
  el['bluetooth-unsupported'].hidden = false;
  el['btn-connect'].disabled = true;
  el['btn-send'].disabled = true;
  el['btn-nfc'].disabled = true;
}

// --- Connect / Send / NFC / Download actions -------------------------------------

el['btn-connect'].addEventListener('click', async () => {
  if (!bluetoothAvailable) return;
  if (!encryptionKeyHex) {
    setStatus('Enter the encryption key before connecting.');
    return;
  }
  let keyBytes;
  try {
    keyBytes = parseKeyHex(encryptionKeyHex);
  } catch (error) {
    setStatus(error.message);
    return;
  }
  el['btn-connect'].disabled = true;
  setStatus('Requesting device...');
  try {
    bleClient = createBleClient({
      // Fired when the tag goes away on its own (out of range, sleep, reset).
      onDisconnect: () => handleDisconnected('Device disconnected.'),
    });
    await connectAndAuthenticate(bleClient, prefs.devicePrefix, keyBytes);
    setConnectedUi(true);
    setStatus('Connected and authenticated.');
  } catch (error) {
    handleDisconnected(`Connection failed: ${error.message}`);
  }
});

el['btn-toggle-key'].addEventListener('click', () => {
  // The key is masked by default. aria-pressed drives both the icon swap in
  // CSS and the screen-reader state, so the two cannot disagree.
  const revealed = el['field-key'].type === 'text';
  el['field-key'].type = revealed ? 'password' : 'text';
  el['btn-toggle-key'].setAttribute('aria-pressed', String(!revealed));
  const label = revealed ? 'Show key' : 'Hide key';
  el['btn-toggle-key'].setAttribute('aria-label', label);
  el['btn-toggle-key'].title = label;
});

el['btn-disconnect'].addEventListener('click', async () => {
  el['btn-disconnect'].disabled = true;
  setStatus('Disconnecting...');
  const client = bleClient;
  // Drop the UI to disconnected first: the button must not stay clickable
  // while the teardown is in flight.
  handleDisconnected('Disconnected.');
  await disconnectBleClient(client);
});

el['btn-send'].addEventListener('click', async () => {
  if (!bleClient) {
    setStatus('Connect to a device first.');
    return;
  }
  // The preview fills empty fields with examples. Sending them to a real tag
  // would put "@yourhandle" on someone's badge.
  if (!hasOwnContent(currentBadgeContent())) {
    setStatus('Fill in your details first: the preview is only showing an example.');
    return;
  }
  el['btn-send'].disabled = true;
  setProgress(true, 0);
  setStatus('Rendering badge...');
  try {
    await rerender();
    const panelCanvas = prepareForPanel(
      el['badge-canvas'],
      el['field-orientation'].value,
      prefs.rotation,
    );
    const ctx = panelCanvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, panelCanvas.width, panelCanvas.height);
    const pixelCount = panelCanvas.width * panelCanvas.height;
    const ditherIndices = computeDitherIndices(data, pixelCount);
    const ditherWireMap = wireMapFor(prefs.compensateRedYellow);

    setStatus('Sending to display...');
    await sendBadgeToDisplay(bleClient, panelCanvas, ditherIndices, ditherWireMap, {
      onProgress: (sent, total) => {
        if (typeof sent === 'number' && typeof total === 'number' && total > 0) {
          setProgress(true, (sent / total) * 100);
        }
      },
      onStatusChange: (message) => setStatus(String(message)),
      onComplete: () => {
        setProgress(true, 100);
        setStatus('Sent.');
      },
    });
  } catch (error) {
    setStatus(`Send failed: ${error.message}`);
  } finally {
    // Only re-enable if we are still connected: the device may have dropped
    // mid-send, in which case handleDisconnected has already disabled this.
    el['btn-send'].disabled = bleClient === null;
    setTimeout(() => setProgress(false), 1500);
  }
});

el['btn-nfc'].addEventListener('click', async () => {
  if (!bleClient) {
    setStatus('Connect to a device first.');
    return;
  }
  el['btn-nfc'].disabled = true;
  setStatus('Writing NFC contact card...');
  try {
    const vcard = buildVCard({
      name: prefs.contactName,
      email: prefs.contactEmail,
      url: prefs.qrUrl,
      nickname: prefs.handle.replace(/^@/, ''),
    });
    await writeVCardOverBle(bleClient, vcard, (sent, total) => {
      setStatus(`Writing NFC contact card (${sent}/${total})...`);
    });
    setStatus('NFC contact card written.');
  } catch (error) {
    setStatus(`NFC write failed: ${error.message}`);
  } finally {
    el['btn-nfc'].disabled = bleClient === null;
  }
});

el['btn-download'].addEventListener('click', async () => {
  if (!hasOwnContent(currentBadgeContent())) {
    setStatus('Fill in your details first: the preview is only showing an example.');
    return;
  }
  await rerender();
  const canvas = /** @type {HTMLCanvasElement} */ (el['badge-canvas']);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'badge.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
});

// --- Startup ----------------------------------------------------------------------

/**
 * @returns {Promise<void>}
 */
async function start() {
  populateProjectOptions();
  applyPrefsToForm();
  await ensureFontsLoaded();
  await rerender();
}

start();


// --- Share, export/import, saved designs ---------------------------------------

/**
 * Apply a partial preferences object from a config, then redraw.
 *
 * @param {Record<string, any>} incoming
 * @returns {void}
 */
function applyIncomingPrefs(incoming) {
  prefs = { ...prefs, ...incoming };
  applyPrefsToForm();
  debouncedSave();
  rerender();
}

/** Rebuild the share link from the dialog's current checkboxes. */
function refreshShareUrl() {
  const config = buildConfig(
    prefs,
    {
      includeContact: el['field-share-contact'].checked,
      includeDevice: el['field-share-device'].checked,
      forShare: true,
    },
  );
  const url = buildShareUrl(window.location.href, config);
  el['field-share-url'].value = url;
  const overLimit = url.length > SHARE_URL_SOFT_LIMIT;
  el['share-size'].textContent = overLimit
    ? `${url.length} characters. That is long enough that some apps may cut it short.`
    : `${url.length} characters.`;
}

el['btn-share'].addEventListener('click', () => {
  // Ask every time rather than remembering: what is safe to share depends on
  // who is being sent the link.
  el['field-share-contact'].checked = false;
  el['field-share-device'].checked = false;
  refreshShareUrl();
  el['share-dialog'].showModal();
});

el['field-share-contact'].addEventListener('change', refreshShareUrl);
el['field-share-device'].addEventListener('change', refreshShareUrl);

el['btn-share-copy'].addEventListener('click', async () => {
  const url = el['field-share-url'].value;
  try {
    await navigator.clipboard.writeText(url);
    el['share-size'].textContent = 'Link copied.';
  } catch {
    // Clipboard access can be refused; selecting the text still lets the user copy it.
    el['field-share-url'].select();
    el['share-size'].textContent = 'Could not copy automatically. The link is selected, copy it manually.';
  }
});

el['btn-export'].addEventListener('click', () => {
  // A downloaded file is under the user's control, so it may carry the device
  // settings and key that a shareable link must never include.
  const config = buildConfig(
    prefs,
    { includeContact: true, includeDevice: true, includeKey: true },
    encryptionKeyHex,
  );
  // The saved-device library travels with the file too, which is how a tag
  // set moves to another browser or a phone. Never in a share link.
  const devices = loadDevices(storage);
  if (devices.length > 0) config.devices = devices;

  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'od-badge-config.json';
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus(
    encryptionKeyHex || devices.length > 0
      ? `Downloaded od-badge-config.json. It contains ${devices.length > 0 ? 'your saved device keys' : 'your encryption key'}, keep it private.`
      : 'Downloaded od-badge-config.json.',
  );
});

el['btn-import'].addEventListener('click', () => el['field-import-file'].click());

el['field-import-file'].addEventListener('change', async () => {
  const file = el['field-import-file'].files && el['field-import-file'].files[0];
  if (!file) return;
  try {
    const config = JSON.parse(await file.text());
    const { prefs: incoming, key } = configToPrefs(config);
    applyIncomingPrefs(incoming);
    if (key) {
      encryptionKeyHex = key;
      el['field-key'].value = key;
      if (prefs.rememberKey) saveStoredKey(storage, key);
    }
    const merged = mergeDevices(storage, config.devices);
    renderDeviceList(merged.devices);
    const parts = [];
    if (key) parts.push('the encryption key');
    if (merged.added > 0) parts.push(`${merged.added} saved device${merged.added === 1 ? '' : 's'}`);
    setStatus(`Loaded ${file.name}${parts.length ? ` (including ${parts.join(' and ')})` : ''}.`);
  } catch (error) {
    setStatus(`Could not load that config: ${error.message}`);
  } finally {
    // Clear it so selecting the same file again still fires a change event.
    el['field-import-file'].value = '';
  }
});

/**
 * Repopulate the saved-designs dropdown.
 *
 * @param {import('../pure/designs.js').SavedDesign[]} designs
 * @returns {void}
 */
function renderDesignList(designs) {
  const select = el['field-design-list'];
  const previous = select.value;
  select.innerHTML = '';
  if (designs.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '(none saved yet)';
    select.appendChild(option);
    select.disabled = true;
    el['btn-design-load'].disabled = true;
    el['btn-design-delete'].disabled = true;
    return;
  }
  select.disabled = false;
  el['btn-design-load'].disabled = false;
  el['btn-design-delete'].disabled = false;
  for (const design of designs) {
    const option = document.createElement('option');
    option.value = design.name;
    option.textContent = design.name;
    select.appendChild(option);
  }
  if (designs.some((design) => design.name === previous)) select.value = previous;
}

el['btn-design-save'].addEventListener('click', () => {
  const result = saveDesign(storage, el['field-design-name'].value, prefs);
  renderDesignList(result.designs);
  if (!result.ok) {
    setStatus(result.error);
    return;
  }
  el['field-design-list'].value = el['field-design-name'].value.trim();
  setStatus(`Saved design "${el['field-design-name'].value.trim()}".`);
});

el['btn-design-load'].addEventListener('click', () => {
  const name = el['field-design-list'].value;
  const design = findDesign(storage, name);
  if (!design) {
    setStatus('That design is no longer saved.');
    renderDesignList(loadDesigns(storage));
    return;
  }
  applyIncomingPrefs(design.values);
  el['field-design-name'].value = design.name;
  setStatus(`Loaded design "${design.name}".`);
});

el['btn-design-delete'].addEventListener('click', () => {
  const name = el['field-design-list'].value;
  if (!name) return;
  renderDesignList(deleteDesign(storage, name));
  setStatus(`Deleted design "${name}".`);
});

renderDesignList(loadDesigns(storage));

/**
 * Load a badge design from a share link, then clear the fragment so a later
 * refresh does not silently undo edits made since.
 *
 * @param {string} hash
 * @returns {void}
 */
function applyShareLink(hash) {
  const encoded = shareStringFromHash(hash);
  if (!encoded) return;
  try {
    const { prefs: incoming } = configToPrefs(decodeConfig(encoded));
    applyIncomingPrefs(incoming);
    setStatus('Loaded a badge design from the link.');
  } catch (error) {
    setStatus(error.message);
  }
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

applyShareLink(window.location.hash);

// Pasting a share link into the address bar while the app is already open is
// a same-document navigation: the page does not reload, so without this the
// link would appear to do nothing.
window.addEventListener('hashchange', () => applyShareLink(window.location.hash));


// --- Saved devices ------------------------------------------------------------

/**
 * Repopulate the saved-devices dropdown.
 *
 * @param {import('../pure/devices.js').SavedDevice[]} devices
 * @returns {void}
 */
function renderDeviceList(devices) {
  const select = el['field-device-list'];
  const previous = select.value;
  select.innerHTML = '';
  if (devices.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '(none saved yet)';
    select.appendChild(option);
    select.disabled = true;
    el['btn-device-load'].disabled = true;
    el['btn-device-delete'].disabled = true;
    return;
  }
  select.disabled = false;
  el['btn-device-load'].disabled = false;
  el['btn-device-delete'].disabled = false;
  for (const device of devices) {
    const option = document.createElement('option');
    option.value = device.name;
    option.textContent = device.prefix ? `${device.name} (${device.prefix})` : device.name;
    select.appendChild(option);
  }
  if (devices.some((device) => device.name === previous)) select.value = previous;
}

el['btn-device-save'].addEventListener('click', () => {
  const result = saveDevice(
    storage,
    el['field-device-name'].value,
    el['field-device-prefix'].value,
    encryptionKeyHex,
  );
  renderDeviceList(result.devices);
  if (!result.ok) {
    setStatus(result.error);
    return;
  }
  el['field-device-list'].value = el['field-device-name'].value.trim();
  setStatus(`Saved device "${el['field-device-name'].value.trim()}".`);
});

el['btn-device-load'].addEventListener('click', () => {
  const name = el['field-device-list'].value;
  const device = findDevice(storage, name);
  if (!device) {
    setStatus('That device is no longer saved.');
    renderDeviceList(loadDevices(storage));
    return;
  }
  prefs = { ...prefs, devicePrefix: device.prefix };
  encryptionKeyHex = device.key;
  el['field-device-prefix'].value = device.prefix;
  el['field-key'].value = device.key;
  el['field-device-name'].value = device.name;
  if (prefs.rememberKey) saveStoredKey(storage, device.key);
  debouncedSave();
  // Switching tags mid-session would leave a connection pointing at the old
  // one, so make the user reconnect deliberately.
  if (bleClient) {
    const previous = bleClient;
    handleDisconnected(`Using "${device.name}". Disconnected from the previous tag, connect again.`);
    disconnectBleClient(previous);
    return;
  }
  setStatus(`Using device "${device.name}".`);
});

el['btn-device-delete'].addEventListener('click', () => {
  const name = el['field-device-list'].value;
  if (!name) return;
  renderDeviceList(deleteDevice(storage, name));
  setStatus(`Deleted device "${name}".`);
});

renderDeviceList(loadDevices(storage));
