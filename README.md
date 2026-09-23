# od-badge

A conference name badge for the OpenDisplay 2.9" BWRY e-paper tag, as both a
Python CLI and a browser app that talks to the tag over Web Bluetooth.

The badge shows a project brand band, your handle, your name, a QR code and a
contactless "tap here" mark. The tag's NFC chip is written with a vCard
contact card, so tapping it offers to save your details.

Built-in projects: ESPHome, Home Assistant, Music Assistant, Open Home
Foundation, plus a custom option that takes your own wordmark and logo.

## Hardware

| | |
| --- | --- |
| Panel | 168x384, 4 colour BWRY (black / white / red / yellow), IC type `0x001E` |
| Transport | BLE, addressed by MAC |
| NFC | TNB132M, written over the BLE link (command `0x0083`) |

## Webapp

No build step. Serve the directory and open it:

```bash
cd webapp && python3 -m http.server 8000
```

Web Bluetooth needs a secure context, so the device actions work on
`localhost` or over HTTPS, in a browser that supports it (Chrome, Edge, and
Chrome on Android; not Safari or iOS). Designing, previewing and downloading a
badge work anywhere.

## Python CLI

```bash
uv run python -m od_badge render --out badge.png
uv run python -m od_badge push --with-nfc
uv run python -m od_badge nfc --vcard
```

The device MAC and key come from `OPENDISPLAY_DEVICE` and `OPENDISPLAY_KEY`,
or `--device` / `--key`.

## Tests

```bash
uv run pytest --cov=od_badge --cov-report=term-missing   # 97 tests, 100%
cd webapp && node --test                                  # 183 tests
```

## Things worth knowing

**Address the tag by MAC, not by name.** Name discovery does not find this
tag, even though other OpenDisplay tags show up in the same scan.

**Red and yellow are swapped by `py-opendisplay` on this panel.** Its
`_BWRY_CODES_BY_PANEL` lists `0x001E` as needing the two inks swapped on the
wire, which is wrong for this unit: the panel then shows red where the design
says yellow. The Python path compensates by pre-swapping the two inks before
upload (disable with `--no-ink-swap` once upstream fixes its table).
OpenDisplay's own web tooling has already dropped `0x001E` from that set, and
the webapp sidesteps it entirely by passing an explicit `ditherWireMap`.

**Text contrast on BWRY** is restricted to white or yellow on black, and black
or red on white. Nothing else is readable at badge size. This is enforced by a
test in both renderers rather than left as a convention.

**The NFC antenna is at a fixed spot** (the middle of the panel's bottom
edge), so it lands on a different edge of the badge depending on rotation. The
tap mark follows it. The edge is derived from the rotation transform rather
than tabulated, and a test reproduces the mapping.

**The tag's start-up QR code carries its name and key.** The webapp's "Scan
device QR code" button reads it with the camera (or from a photo, or a pasted
`https://opendisplay.org/l/?...` link) and fills in the device name prefix and
encryption key. The link's query is an unpadded base64url 23-byte payload:
tag type (2), device id (3, the `OD######` name), AES key (16), manufacturer
(2). The key is all zeros unless the tag's "show key on screen" flag is set.

**`ble-common.js` is linked, not vendored.** See `webapp/vendor/README.md`.

## Licence

Apache License 2.0, see `LICENSE`.

The third-party libraries under `webapp/vendor/` keep their own licences (pako
is MIT AND Zlib, qrcodejs is MIT, jsQR is Apache 2.0). `ble-common.js` is not
redistributed here at all: it is loaded from opendisplay.org, which declares no
licence. See `webapp/vendor/README.md`.
