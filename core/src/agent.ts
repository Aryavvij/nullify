/**
 * Click verification for browser agents.
 *
 * Agents that click by coordinates (screenshot-based "computer use" agents,
 * raw CDP input) press whatever is on top at that point, including elements a
 * person can't see. Two layers handle that:
 *
 *  1. assessPoint(): before clicking, the agent's side asks what a click at
 *     (x, y) would really hit, and gets a readable refusal if it's invisible.
 *  2. The click shield runs the same check inside the real pointerdown event,
 *     so nothing can change between check and click, and clicks that never
 *     went through our Node code (raw CDP) are covered too.
 *
 * Large invisible layers over media (video click layers) are let through with
 * a warning: if one turns out to be a trap, the popup and redirect guards stop
 * whatever it tries to open.
 */
import { emit, events, type NullifyEvent } from "./events.js";
import { popupAllowedWithin } from "./guards.js";
import { findHiddenText, looksLikeInstruction, techniqueFor, visibleText, type HiddenTechnique } from "./hidden-text.js";
import { INTERACTIVE } from "./intent.js";
import { effectiveOpacity, isTransparent, overlayInfo, scanOverlays } from "./overlay.js";
import { blocking, policy } from "./policy.js";
import { onBody, onDocumentRoot } from "./dom.js";
import {
  closest, contains, css, elementsAt, every, isRendered, listen, matches, now, observe, queryAll, rectOf, scrollIntoView,
  setInlineStyle, textOf,
} from "./pristine.js";
import { scamReport, type ScamReport } from "./scam.js";

export type BlockReason =
  | "invisible-frame"
  | "invisible-control"
  | "invisible-layer-over-control"
  | "target-covered"
  | "target-not-visible";

export interface PointVerdict {
  ok: boolean;
  reason?: BlockReason;
  /** What the click would really land on. */
  hit: string | null;
  /** The visible element the agent most likely meant to click. */
  meant?: string | null;
  warnings: string[];
}

const FRAMES = new Set(["IFRAME", "FRAME", "EMBED", "OBJECT"]);

/** Native inputs sites routinely make invisible under a styled label: custom checkboxes, file pickers, selects. */
const STYLED_NATIVE = [
  "input[type=checkbox]", "input[type=radio]", "input[type=file]", "input[type=range]", "input[type=color]", "select",
].join(", ");

const INVISIBLE = 0.1;

const isVisible = (el: Element): boolean => isRendered(el) && effectiveOpacity(el) >= INVISIBLE;
const isVisibleControl = (el: Element): boolean => matches(el, INTERACTIVE) && isVisible(el);

/**
 * A short label for an element that is safe to show an agent. Refusals go
 * straight into the model's context, so only visible text is included, and
 * never text that reads like an instruction.
 */
export function describe(el: Element | null): string | null {
  if (!el) return null;
  let label = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "");
  if (isVisible(el) && techniqueFor(el) === null) {
    const text = textOf(el).replace(/\s+/g, " ").trim().slice(0, 40);
    if (text && !looksLikeInstruction(text)) label += ` "${text}"`;
  }
  return label;
}

/** The nearest positioned, invisible layer at or just above `el`. */
function transparentLayer(el: Element): Element | null {
  for (let e: Element | null = el, depth = 0; e && depth < 4; e = e.parentElement, depth++) {
    if (e === document.body || e === document.documentElement) return null;
    const position = css(e, "position");
    if ((position === "absolute" || position === "fixed") && css(e, "pointer-events") !== "none" && isTransparent(e)) {
      return e;
    }
  }
  return null;
}

/**
 * What would a click at (x, y) really hit? With `intended` (DOM-based agents
 * that name an element), that element must be what receives the click.
 */
export function assessPoint(x: number, y: number, intended: Element | null = null): PointVerdict {
  const stack = elementsAt(x, y);
  const top = stack[0] ?? null;
  const warnings: string[] = [];
  if (!top) return { ok: true, hit: null, warnings };

  const block = (reason: BlockReason, meant: Element | null): PointVerdict =>
    ({ ok: false, reason, hit: describe(top), meant: describe(meant), warnings });
  const controlBelow = (cover: Element): Element | null =>
    stack.find((el) => !contains(cover, el) && !contains(el, cover) && isVisibleControl(el)) ?? null;

  if (intended) {
    if (top !== intended && !contains(intended, top)) return block("target-covered", intended);
    if (!isVisible(intended) && !matches(intended, STYLED_NATIVE)) return block("invisible-control", controlBelow(intended));
    return { ok: true, hit: describe(top), warnings };
  }

  if (FRAMES.has(top.tagName) && effectiveOpacity(top) < INVISIBLE) return block("invisible-frame", controlBelow(top));

  const control = closest(top, INTERACTIVE);
  if (control && !isVisible(control) && !matches(control, STYLED_NATIVE)) {
    return block("invisible-control", controlBelow(control));
  }

  const layer = transparentLayer(top);
  if (layer) {
    const covered = controlBelow(layer);
    if (covered) return block("invisible-layer-over-control", covered);
    if (overlayInfo(layer)) warnings.push("click lands on an invisible layer; anything it tries to open will be blocked");
  }
  return { ok: true, hit: describe(top), warnings };
}

/** Bring an element fully into view if it isn't, the way Playwright does before clicking. */
function scrollIntoViewIfNeeded(el: Element): void {
  const r = rectOf(el);
  const inView = r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth;
  if (!inView) scrollIntoView(el);
}

/** Centre of the element's on-screen box, or null if no part of it is in the viewport. */
export function clickPoint(el: Element): { x: number; y: number } | null {
  const r = rectOf(el);
  const left = Math.max(r.left, 0);
  const right = Math.min(r.right, window.innerWidth);
  const top = Math.max(r.top, 0);
  const bottom = Math.min(r.bottom, window.innerHeight);
  if (right - left < 1 || bottom - top < 1) return null;
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

// ---------------------------------------------------------------------------
// Click shield

let armed: { intended: Element | null; time: number } | null = null;
let suppressUntil = 0;
let lastBlock: (PointVerdict & { time: number }) | null = null;

/** Events that make up the rest of a click gesture once its pointerdown was cancelled. */
const FOLLOW_UPS = ["mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick", "contextmenu"];

/**
 * Must be installed before the other guards so its window-level capture
 * listener runs first and can stop the whole gesture.
 */
export function installClickShield(win: Window): void {
  watchFrames();
  listen(win, "pointerdown", (event) => {
    if (!policy.clickShield || !event.isTrusted) return;
    suppressUntil = 0;
    const intent = armed && now() - armed.time <= 2000 ? armed : null;
    armed = null;

    const e = event as PointerEvent;
    const verdict = assessPoint(e.clientX, e.clientY, intent?.intended ?? null);
    if (verdict.ok || !verdict.reason) return;

    lastBlock = { ...verdict, time: now() };
    emit({ kind: "click", action: blocking() ? "blocked" : "reported", reason: verdict.reason, detail: { hit: verdict.hit, meant: verdict.meant } });
    if (!blocking()) return;
    suppressUntil = now() + 1000;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, { capture: true });

  for (const type of FOLLOW_UPS) {
    listen(win, type, (e) => {
      if (!e.isTrusted || now() > suppressUntil) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, { capture: true });
  }
}

// ---------------------------------------------------------------------------
// Invisible frames
//
// A click on a cross-site frame is delivered inside that frame, where the
// page above it can't be seen, so the shield in the frame can't tell the
// frame was made invisible. The parent page can. In agent mode, a sized frame
// that is effectively invisible but still takes clicks is made click-through,
// so the click falls to the visible element the agent was aiming at.

const disabledFrames = new WeakSet<Element>();

function disableInvisibleFrames(): void {
  if (!policy.clickShield || !document.body) return;
  for (const frame of queryAll(document, "iframe, frame, embed, object")) {
    if (!isRendered(frame) || effectiveOpacity(frame) >= INVISIBLE) continue;
    if (css(frame, "pointer-events") === "none") continue;
    const r = rectOf(frame);
    if (r.width < 10 || r.height < 10) continue; // tracking pixels and other 0-1px frames can't be clicked anyway

    const first = !disabledFrames.has(frame);
    disabledFrames.add(frame);
    if (first) {
      emit({ kind: "click", action: blocking() ? "blocked" : "reported", reason: "invisible-frame-disabled", detail: { frame: describe(frame) } });
    }
    if (blocking()) setInlineStyle(frame, "pointer-events", "none", "important");
  }
}

/**
 * Re-check frames synchronously whenever the DOM or a style/class attribute
 * changes and whenever a frame finishes loading, plus on a timer for
 * stylesheet edits. Not debounced: a debounce leaves a window in which a
 * click can reach a frame that has just loaded.
 */
function watchFrames(): void {
  onDocumentRoot((root) => {
    observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden"] }, disableInvisibleFrames);
  });
  listen(window, "load", disableInvisibleFrames, { capture: true }); // frame load events don't bubble, but capture sees them
  onBody(disableInvisibleFrames);
  every(disableInvisibleFrames, 500);
}

// ---------------------------------------------------------------------------
// Page risk summary

export interface PageRisk {
  level: "low" | "medium" | "high";
  overlays: Array<{ element: string | null; reason: string; confidence: string }>;
  hiddenInstructions: number;
  hiddenText: number;
  scam: ScamReport;
  /** Popups, redirects, clicks and overlays the engine blocked or removed on this page. */
  interventions: number;
}

export function pageRisk(): PageRisk {
  const overlays = scanOverlays().map((f) => ({ element: describe(f.element), reason: f.reason, confidence: f.confidence }));
  const hidden = findHiddenText();
  const hiddenInstructions = hidden.filter((h) => h.instructionLike).length;
  const scam = scamReport();
  const interventions = events().filter((e) => e.action !== "reported").length;

  const high = scam.likelyScam || hiddenInstructions > 0 || interventions > 0 || overlays.some((o) => o.confidence === "hijack");
  const level = high ? "high" : overlays.length > 0 ? "medium" : "low";
  return { level, overlays, hiddenInstructions, hiddenText: hidden.length, scam, interventions };
}

// ---------------------------------------------------------------------------
// API for @nullify/agent-guard

export const AGENT_API = "__nullifyAgent";

export interface HiddenTextReport {
  text: string;
  technique: HiddenTechnique;
  instructionLike: boolean;
  element: string | null;
}

/**
 * Expose a frozen, non-replaceable API for the agent's side. Read-only calls
 * are harmless if the page uses them too; the one call that changes state
 * (`arm`) needs the per-session token, so a page can't pre-approve its own
 * element as the agent's target.
 */
export function exposeAgentApi(token: string): void {
  const assessElement = (el: Element): PointVerdict & { point?: { x: number; y: number } } => {
    scrollIntoViewIfNeeded(el);
    const point = clickPoint(el);
    if (!point) return { ok: false, reason: "target-not-visible", hit: null, meant: describe(el), warnings: [] };
    return { ...assessPoint(point.x, point.y, el), point };
  };
  /** Time of the last shield block, so the caller can tell afterwards whether its click was cancelled. */
  const since = () => lastBlock?.time ?? 0;

  const api = Object.freeze({
    assess: (x: number, y: number): PointVerdict => assessPoint(x, y),
    assessElement,
    /** One round trip before a coordinate click: the verdict plus the block-log mark. */
    prepare: (x: number, y: number) => ({ verdict: assessPoint(x, y), since: since() }),
    /** One round trip before an element click: scroll, check, and (if allowed) tell the shield which element is meant. */
    prepareElement: (key: string, el: Element) => {
      const verdict = assessElement(el);
      if (verdict.ok && key === token) armed = { intended: el, time: now() };
      return { verdict, since: since() };
    },
    arm: (key: string, intended: Element | null = null): boolean => {
      if (key !== token) return false;
      armed = { intended, time: now() };
      return true;
    },
    lastBlock: () => lastBlock,
    visibleText: (): string => visibleText(),
    hiddenText: (): HiddenTextReport[] =>
      findHiddenText().map((h) => ({ text: h.text, technique: h.technique, instructionLike: h.instructionLike, element: describe(h.element) })),
    pageRisk,
    events: (): NullifyEvent[] => events(),
    popupAllowedWithin,
  });
  Object.defineProperty(globalThis, AGENT_API, { value: api, configurable: false, enumerable: false, writable: false });
}
