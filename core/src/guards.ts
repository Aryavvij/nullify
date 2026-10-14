/**
 * Popup and redirect guards.
 *
 * Every way a page can open a new window (window.open, programmatic or
 * synthetic clicks on target=_blank links, target=_blank form submits, and
 * window.open taken from a fresh iframe) and every script-driven top-level
 * navigation goes through one question: did the user's click express intent
 * to go to another site? See intent.ts.
 */
import { emit, type EventKind } from "./events.js";
import { installGestureTracking, isLinkHijack, recentGesture, type Gesture } from "./intent.js";
import { neutralize } from "./overlay.js";
import { blocking, policy } from "./policy.js";
import { closest, isElement, listen, now, observe, pathOf, queryAll } from "./pristine.js";
import { isExternal, resolveUrl } from "./site.js";
import { callerScript } from "./source.js";

type Win = Window & typeof globalThis;

const apply = Reflect.apply;
const guarded = new WeakSet<Window>();

/** The top page we protect; about:blank child frames inherit it. */
const pageUrl = (): string => location.href;

/** Why this off-site destination should be stopped, or null if the click explains it. */
function hijackReason(g: Gesture | null, dest: string): string | null {
  if (!g) return "no-user-gesture";
  if (g.overlay) return "click-on-invisible-overlay";
  if (!g.interactive) return "click-on-non-control";
  if (isLinkHijack(g.interactive, dest, pageUrl())) return "link-hijack";
  return null;
}

let lastAllowedPopup = -Infinity;

/** Did the engine approve a new window recently? Agent Guard closes any tab that opened without one. */
export const popupAllowedWithin = (ms: number): boolean => now() - lastAllowedPopup <= ms;

const popupAllowedListeners = new Set<() => void>();

/** Called every time the engine approves a new window (the extension's tab backstop needs to know). */
export function onPopupAllowed(fn: () => void): () => void {
  popupAllowedListeners.add(fn);
  return () => popupAllowedListeners.delete(fn);
}

function allow(kind: EventKind): true {
  if (kind === "popup") {
    lastAllowedPopup = now();
    for (const fn of popupAllowedListeners) {
      try {
        fn();
      } catch {
        // A broken listener must never stop an approved popup.
      }
    }
  }
  return true;
}

/** Returns true if the action may proceed. Logs, and removes the trap overlay, when it may not. */
function judge(kind: EventKind, rawDest: string | undefined, via: string): boolean {
  const page = pageUrl();
  if (!isExternal(rawDest, page)) return allow(kind);
  const dest = resolveUrl(rawDest, page);
  const g = recentGesture(policy.activationMs);
  const reason = hijackReason(g, dest);
  if (!reason) return allow(kind);

  emit({ kind, action: blocking() ? "blocked" : "reported", reason, url: dest, detail: { via, source: callerScript() } });
  if (g?.overlay?.isConnected) neutralize(g.overlay, "trap-triggered-" + kind);
  return !blocking();
}

// ---------------------------------------------------------------------------
// New-window vectors

const anchorOf = (el: Element): HTMLAnchorElement | null =>
  closest(el, "a[href], area[href]") as HTMLAnchorElement | null;

/** A link or form whose target opens a new browsing context. */
function opensNewWindow(target: string): boolean {
  const t = target.trim().toLowerCase();
  return t !== "" && t !== "_self" && t !== "_parent" && t !== "_top";
}

function newWindowLink(el: Element): HTMLAnchorElement | null {
  const a = anchorOf(el);
  return a && !a.hasAttribute("download") && opensNewWindow(a.target) ? a : null;
}

function installNewWindowGuards(win: Win): void {
  const nativeOpen = win.open;
  Object.defineProperty(win, "open", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function open(...args: [string | URL | undefined, string | undefined, string | undefined]) {
      const url = args[0] === undefined ? undefined : String(args[0]);
      return judge("popup", url, "window.open") ? apply(nativeOpen, win, args) : null;
    },
  });

  const el = win.HTMLElement.prototype;
  const nativeClick = el.click;
  el.click = function click(this: HTMLElement) {
    const a = newWindowLink(this);
    if (a && !judge("popup", a.href, "element.click")) return;
    return apply(nativeClick, this, []);
  };

  const et = win.EventTarget.prototype;
  const nativeDispatch = et.dispatchEvent;
  et.dispatchEvent = function dispatchEvent(this: EventTarget, event: Event) {
    if (event?.type === "click" && isElement(this)) {
      const a = newWindowLink(this);
      if (a && !judge("popup", a.href, "dispatchEvent")) return false;
    }
    return apply(nativeDispatch, this, [event]);
  };

  const form = win.HTMLFormElement.prototype;
  for (const name of ["submit", "requestSubmit"] as const) {
    const native = form[name];
    form[name] = function (this: HTMLFormElement, ...args: unknown[]) {
      if (opensNewWindow(this.target) && !judge("popup", this.action, `form.${name}`)) return;
      return apply(native, this, args);
    } as never;
  }
}

// ---------------------------------------------------------------------------
// Fresh-iframe escape: `document.body.appendChild(iframe); iframe.contentWindow.open(ad)`
// gets an unpatched window.open from a new same-origin realm. Patch each new
// frame the moment the page can reach it.

function guardFrame(frame: Element): void {
  if (frame.tagName !== "IFRAME" && frame.tagName !== "FRAME") return;
  try {
    const child = nativeContentWindow?.call(frame as HTMLIFrameElement) as Win | null;
    if (child) installWindowGuards(child);
  } catch {
    // Cross-origin frame: it gets its own copy of Nullify from the extension / init script.
  }
}

function guardFramesIn(node: unknown): void {
  if (!isElement(node)) return;
  guardFrame(node);
  if (node.firstElementChild) for (const f of queryAll(node, "iframe, frame")) guardFrame(f);
}

let nativeContentWindow: ((this: HTMLIFrameElement) => Window | null) | undefined;

function installFrameHooks(win: Win): void {
  const proto = win.HTMLIFrameElement.prototype;
  const cw = Object.getOwnPropertyDescriptor(proto, "contentWindow");
  const cd = Object.getOwnPropertyDescriptor(proto, "contentDocument");
  if (!cw?.get || !cd?.get) return;
  nativeContentWindow ??= cw.get as (this: HTMLIFrameElement) => Window | null;
  const cwGet = cw.get;
  const cdGet = cd.get;

  Object.defineProperty(proto, "contentWindow", {
    ...cw,
    get(this: HTMLIFrameElement) {
      const w = apply(cwGet, this, []) as Win | null;
      if (w) try { installWindowGuards(w); } catch { /* cross-origin */ }
      return w;
    },
  });
  Object.defineProperty(proto, "contentDocument", {
    ...cd,
    get(this: HTMLIFrameElement) {
      const d = apply(cdGet, this, []) as Document | null;
      if (d?.defaultView) installWindowGuards(d.defaultView as Win);
      return d;
    },
  });

  // `window.frames[n]` / `window[n]` skip the getters above, so also patch at insertion time.
  const node = win.Node.prototype;
  for (const name of ["appendChild", "insertBefore", "replaceChild"] as const) {
    const native = node[name];
    node[name] = function (this: Node, ...args: unknown[]) {
      const result = apply(native, this, args);
      guardFramesIn(args[0]);
      return result;
    } as never;
  }
  const element = win.Element.prototype;
  for (const name of ["append", "prepend", "after", "before", "replaceWith"] as const) {
    const native = element[name];
    element[name] = function (this: Element, ...args: unknown[]) {
      const result = apply(native, this, args);
      for (const a of args) guardFramesIn(a);
      return result;
    } as never;
  }
}

// ---------------------------------------------------------------------------
// Same-tab redirects, via the Navigation API. location.href / location.replace
// can't be patched (Location is unforgeable), but every script-initiated
// navigation fires a cancelable `navigate` event first.

interface NavigateEventLike extends Event {
  userInitiated: boolean;
  hashChange: boolean;
  downloadRequest: string | null;
  navigationType: "push" | "replace" | "reload" | "traverse";
  destination: { url: string };
}

function installRedirectGuard(win: Win): void {
  const navigation = (win as unknown as { navigation?: EventTarget }).navigation;
  if (!navigation) return;
  listen(navigation, "navigate", (event) => {
    const e = event as NavigateEventLike;
    if (e.userInitiated || !e.cancelable || e.hashChange || e.downloadRequest !== null) return;
    if (e.navigationType === "reload" || e.navigationType === "traverse") return;

    const dest = e.destination.url;
    if (!isExternal(dest, pageUrl())) return;
    if (!recentGesture(policy.activationMs)) {
      // Timed / on-load redirects are also how SSO logins work, so they are logged, not blocked.
      emit({ kind: "redirect", action: "reported", reason: "redirect-without-gesture", url: dest });
      return;
    }
    if (!judge("redirect", dest, "navigation")) e.preventDefault();
  });
}

// ---------------------------------------------------------------------------

/** A real click on an invisible overlay that *is* an off-site link: stop the default navigation. */
function onTrustedClick(e: Event, g: Gesture): void {
  if (!g.overlay) {
    // A real click on a visible target=_blank link opens a tab without going through window.open.
    if (g.interactive && newWindowLink(g.interactive)) allow("popup");
    return;
  }
  const a = pathOf(e).find((t) => isElement(t) && (t.tagName === "A" || t.tagName === "AREA")) as HTMLAnchorElement | undefined;
  if (!a?.href || !isExternal(a.href, pageUrl())) return;

  const kind: EventKind = opensNewWindow(a.target) ? "popup" : "redirect";
  emit({ kind, action: blocking() ? "blocked" : "reported", reason: "click-on-invisible-overlay", url: a.href, detail: { via: "overlay-link" } });
  if (!blocking()) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  neutralize(g.overlay, "trap-triggered-" + kind);
}

/** Patch a window (the top page or a same-origin child frame) exactly once. */
export function installWindowGuards(win: Win): void {
  // A private WeakSet, not a flag on the window, so a page can't pre-mark a frame as guarded.
  if (guarded.has(win)) return;
  guarded.add(win);
  installNewWindowGuards(win);
  installFrameHooks(win);
}

export function installGuards(win: Win): void {
  installGestureTracking(win, onTrustedClick);
  installWindowGuards(win);
  installRedirectGuard(win);
  // Frames inserted via innerHTML etc. don't pass through the insertion hooks.
  observe(document, { childList: true, subtree: true }, (records) => {
    for (const r of records) for (const n of r.addedNodes) guardFramesIn(n);
  });
}
