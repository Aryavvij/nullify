// Runs in the extension's isolated world: shares the DOM with the page but not
// its JS globals, so the page can't patch anything used here.
import { ISOLATED_HELLO, MAIN_HELLO, type ChannelMessage, type RuntimeMessage } from "./channel.js";

// getRandomValues, not randomUUID: randomUUID only exists on HTTPS pages.
const secret = `nullify-${Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
let connected = false;

function forward(message: RuntimeMessage): void {
  chrome.runtime.sendMessage(message).catch(() => {
    // Extension reloaded or service worker unavailable; nothing to do.
  });
}

document.addEventListener(secret, (e) => {
  let message: ChannelMessage;
  try {
    message = JSON.parse(String((e as CustomEvent).detail));
  } catch {
    return;
  }
  if (message.type === "ack") {
    connected = true;
    document.removeEventListener(MAIN_HELLO, onMainHello, true); // never hand out the secret again
    return;
  }
  if (!connected) return;
  if (message.type === "event" || message.type === "popup-allowed") forward(message);
}, true);

function hello(): void {
  document.dispatchEvent(new CustomEvent(ISOLATED_HELLO, { detail: secret }));
}

function onMainHello(): void {
  if (!connected) hello();
}

// If the engine runs after us, its hello brings us back here (once).
document.addEventListener(MAIN_HELLO, onMainHello, { capture: true, once: true });
// If the engine already ran, it is listening and acknowledges synchronously.
hello();
