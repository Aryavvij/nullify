// Runs in the page's own JS realm at document_start, before page scripts.
import { init, onEvent, onPopupAllowed } from "@nullifyads/core";
import { ISOLATED_HELLO, MAIN_HELLO, MIN_SECRET_LENGTH, type ChannelMessage } from "./channel.js";

// Captured before the engine patches dispatchEvent and before any page script runs,
// so a page can't watch or intercept what we send.
const apply = Reflect.apply;
const dispatch = EventTarget.prototype.dispatchEvent;
const addListener = EventTarget.prototype.addEventListener;
const removeListener = EventTarget.prototype.removeEventListener;
const NativeCustomEvent = CustomEvent;
const stringify = JSON.stringify;
const doc = document;

let channel: string | null = null;
const pending: string[] = [];

function post(data: string): void {
  apply(dispatch, doc, [new NativeCustomEvent(channel!, { detail: data })]);
}

function send(message: ChannelMessage): void {
  const data = stringify(message);
  if (channel) post(data);
  else if (pending.length < 200) pending.push(data); // the isolated script hasn't said hello yet
}

function onHello(e: Event): void {
  const secret = (e as CustomEvent).detail;
  if (channel || typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) return;
  channel = secret;
  apply(removeListener, doc, [ISOLATED_HELLO, onHello, true]); // accept exactly one hello
  send({ type: "ack" });
  for (const data of pending.splice(0)) post(data);
}

apply(addListener, doc, [ISOLATED_HELLO, onHello, true]);

init("extension");
onEvent((event) => send({ type: "event", event }));
onPopupAllowed(() => send({ type: "popup-allowed" }));

// If the isolated script already ran, this prompts it to say hello now.
apply(dispatch, doc, [new NativeCustomEvent(MAIN_HELLO)]);
