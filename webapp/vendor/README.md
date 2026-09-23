# Vendored files

Only third-party libraries with a clear licence are vendored here. They are
copied verbatim and unmodified.

| Vendored path     | Library                       | Licence        |
| ----------------- | ----------------------------- | -------------- |
| `js/pako.js`      | pako 2.1.0                    | MIT AND Zlib   |
| `l/qrcode.js`     | qrcodejs (davidshimjs)        | MIT            |

Both are vendored rather than linked so the badge preview and the PNG
download keep working with no network.

## Not vendored: ble-common.js

`ble-common.js` is OpenDisplay's own BLE protocol implementation (Web
Bluetooth, AES-CMAC/CCM, the authentication handshake, and the image upload
transports). It is loaded straight from their site in `index.html`:

    https://opendisplay.org/js/ble-common.js

It is linked rather than copied because the upstream `opendisplay.org`
repository declares no `LICENSE`, so its redistribution terms are unknown.
Linking is ordinary web usage and avoids redistributing it.

The trade-offs of linking, accepted deliberately:

- The device actions (connect, send, NFC) need network access and a reachable
  `opendisplay.org`. Designing, previewing and downloading a badge do not.
- Upstream can change the file at any time. It has already drifted once: the
  live copy fixed the BWRY red/yellow table for panel `0x001E`, while the
  version in their git repository still had the bug. This app does not depend
  on that table, because it passes an explicit `ditherWireMap` to the upload.

## Not used: dither.js

`dither.js` and `vendor/epaper-dithering.js` were vendored at one point but
never referenced at runtime: the badge is drawn in flat BWRY colours, so it
needs palette snapping rather than dithering. They have been removed.

They are worth revisiting if the badge ever needs to show a photo, since
`dither.js` publishes `window.OpenDisplayDither` with ten dither algorithms
and returns exactly the `{indices, wireMap}` pair the upload path consumes.
Note it is an ES module, so it cannot be linked cross-origin until
`opendisplay.org` sends an `Access-Control-Allow-Origin` header.
