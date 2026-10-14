import { now } from "./pristine.js";

export type EventKind = "popup" | "redirect" | "overlay" | "hidden-text" | "scam" | "click";
export type EventAction = "blocked" | "removed" | "reported";

export interface NullifyEvent {
  readonly kind: EventKind;
  readonly action: EventAction;
  /** Machine-readable cause, e.g. "click-on-invisible-overlay". */
  readonly reason: string;
  readonly url?: string;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly time: number;
}

const MAX_EVENTS = 500;
const log: NullifyEvent[] = [];
const listeners = new Set<(e: NullifyEvent) => void>();

export function emit(event: Omit<NullifyEvent, "time">): NullifyEvent {
  const full = Object.freeze({ ...event, time: now() });
  log.push(full);
  if (log.length > MAX_EVENTS) log.shift();
  for (const fn of listeners) {
    try {
      fn(full);
    } catch {
      // A broken subscriber must never break detection.
    }
  }
  return full;
}

export const events = (): NullifyEvent[] => log.slice();

export function onEvent(fn: (e: NullifyEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
