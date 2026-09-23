// DOM-dependent: read QR codes from the camera or from a photo.
//
// Uses the browser's native BarcodeDetector where it supports QR (Chrome on
// Android, ChromeOS and macOS), and otherwise falls back to the vendored jsQR
// (webapp/vendor/js/jsQR.js). jsQR is loaded on first use rather than up
// front, since most visits never scan anything.

const JSQR_SRC = new URL('../../vendor/js/jsQR.js', import.meta.url).href;

/** How often to try a camera frame. Decoding every animation frame burns CPU for no gain. */
const SCAN_INTERVAL_MS = 150;

/** jsQR is slow on big frames; a QR filling part of the view survives this downscale fine. */
const MAX_DECODE_EDGE = 800;

/** @type {Promise<(image: ImageBitmapSource) => Promise<string|null>>|null} */
let decoderPromise = null;

/**
 * @returns {Promise<any>}
 */
function loadJsQr() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = JSQR_SRC;
    script.onload = () => (window.jsQR ? resolve(window.jsQR) : reject(new Error('QR decoder failed to load.')));
    script.onerror = () => reject(new Error('QR decoder failed to load.'));
    document.head.appendChild(script);
  });
}

/**
 * @returns {Promise<(image: HTMLVideoElement|ImageBitmap) => Promise<string|null>>}
 */
async function createDecoder() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (image) => {
          const codes = await detector.detect(image);
          return codes.length ? codes[0].rawValue : null;
        };
      }
    } catch {
      // Fall through to jsQR: some builds expose the API without a backend.
    }
  }

  const jsQR = await loadJsQr();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (image) => {
    const width = image.videoWidth || image.width;
    const height = image.videoHeight || image.height;
    if (!width || !height) return null;
    const scale = Math.min(1, MAX_DECODE_EDGE / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    // The boot screen is dark-on-light, but a photo of a lit screen can invert.
    const code = jsQR(data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
    return code ? code.data : null;
  };
}

/**
 * @returns {Promise<(image: HTMLVideoElement|ImageBitmap) => Promise<string|null>>}
 */
function getDecoder() {
  if (!decoderPromise) {
    decoderPromise = createDecoder().catch((error) => {
      decoderPromise = null;
      throw error;
    });
  }
  return decoderPromise;
}

/**
 * Whether this browser can open a camera at all. getUserMedia also needs a
 * secure context (HTTPS or localhost), same as Web Bluetooth.
 *
 * @returns {boolean}
 */
export function isCameraScanSupported() {
  return Boolean(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Decode a QR code from an image file.
 *
 * @param {Blob} file
 * @returns {Promise<string|null>} The QR text, or null if none was found.
 */
export async function scanQrFromImage(file) {
  const decode = await getDecoder();
  const bitmap = await createImageBitmap(file);
  try {
    return await decode(bitmap);
  } finally {
    bitmap.close();
  }
}

/**
 * Stream the rear camera into `video` and decode frames until `accept`
 * returns true for one, or `signal` aborts. The camera is always released
 * before this settles.
 *
 * `accept` sees every QR code found, so the caller can keep scanning past
 * unrelated codes (a conference badge has plenty) instead of stopping on the
 * first one.
 *
 * @param {HTMLVideoElement} video
 * @param {(text: string) => boolean} accept
 * @param {AbortSignal} signal
 * @returns {Promise<string|null>} The accepted text, or null if aborted.
 */
export async function scanQrFromCamera(video, accept, signal) {
  const decode = await getDecoder();
  if (signal.aborted) return null;
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  });
  const stop = () => {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };
  if (signal.aborted) {
    stop();
    return null;
  }

  try {
    video.srcObject = stream;
    await video.play();
    return await new Promise((resolve, reject) => {
      let timer = 0;
      const onAbort = () => {
        clearTimeout(timer);
        resolve(null);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      const tick = async () => {
        if (signal.aborted) return;
        try {
          const text = video.readyState >= 2 ? await decode(video) : null;
          if (signal.aborted) return;
          if (text !== null && accept(text)) {
            signal.removeEventListener('abort', onAbort);
            resolve(text);
            return;
          }
        } catch (error) {
          signal.removeEventListener('abort', onAbort);
          reject(error);
          return;
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      tick();
    });
  } finally {
    stop();
  }
}
