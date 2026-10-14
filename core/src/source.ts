/**
 * Which page script is responsible for what we just blocked?
 *
 * Read from the call stack at the moment of the block: the first http(s)
 * frame is the page script (our own frames live at chrome-extension:// or
 * in an unnamed init script). An inline script shows up as the page's own
 * URL. Informational only: a page that rewrites Error.prepareStackTrace can
 * blur it, so nothing here is used to make a decision.
 */

const FRAME_URL = /\b(https?:\/\/[^\s()]+?):\d+:\d+/g;

export function callerScript(): string | null {
  const E = Error as ErrorConstructor & { prepareStackTrace?: unknown };
  let saved: unknown;
  let swapped = false;
  try {
    saved = E.prepareStackTrace;
    E.prepareStackTrace = undefined;
    swapped = true;
  } catch {
    // A page made it read-only; take the stack as the page formats it.
  }
  try {
    const stack = new Error().stack ?? "";
    for (const match of stack.matchAll(FRAME_URL)) {
      if (match[1]) return match[1];
    }
    return null;
  } finally {
    if (swapped) E.prepareStackTrace = saved;
  }
}
