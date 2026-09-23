// Thin wrapper that sends a planned NFC write (see src/pure/nfc-commands.js)
// over an already-connected, already-authenticated BLE client, one command
// frame at a time through bleClient.sendCommand() so every frame inherits
// the client's session encryption automatically.

import { planVCardWrite } from '../pure/nfc-commands.js';

/**
 * Write a vCard to the device's NFC tag as a text/vcard MIME NDEF record.
 *
 * @param {any} bleClient An authenticated OpenDisplayBLE instance.
 * @param {string} vcardText The vCard string (see src/pure/vcard.js buildVCard).
 * @param {(sent: number, total: number) => void} [onProgress]
 * @returns {Promise<void>}
 */
export async function writeVCardOverBle(bleClient, vcardText, onProgress) {
  const plan = planVCardWrite(vcardText);
  for (let i = 0; i < plan.commands.length; i++) {
    await bleClient.sendCommand(plan.commands[i]);
    if (onProgress) {
      onProgress(i + 1, plan.commands.length);
    }
  }
}
