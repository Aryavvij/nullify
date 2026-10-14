/**
 * Click intent: what did the user actually click?
 *
 * Hijacks fire on *real* clicks (event.isTrusted is true), so "was there a
 * user gesture" can't tell a trap from a login button. What separates them is
 * the target: a visible control (link, button, input, something styled as
 * clickable) expresses intent to go somewhere; a click on an invisible overlay,
 * plain text or a video does not.
 */
import { overlayInfo } from "./overlay.js";
import { css, isElement, listen, matches, now, pathOf } from "./pristine.js";
import { siteOf } from "./site.js";

export interface Gesture {
  time: number;
  /** Innermost element under the pointer. */
  target: Element | null;
  /** Nearest visible control on the click path, if any. */
  interactive: Element | null;
  /** Invisible overlay on the click path, if any. Takes precedence over `interactive`. */
  overlay: Element | null;
}

export const INTERACTIVE = [
  "a[href]", "area[href]", "button", "input:not([type=hidden])", "select", "textarea", "label", "summary",
  "[role=button]", "[role=link]", "[role=menuitem]", "[role=tab]", "[role=checkbox]", "[role=switch]",
  "[onclick]", "[contenteditable]:not([contenteditable=false])",
].join(", ");

/** Set `cursor: pointer` itself rather than inheriting it (so `body { cursor: pointer }` can't make everything a control). */
function ownPointerCursor(el: Element): boolean {
  if (css(el, "cursor") !== "pointer") return false;
  const parent = el.parentElement;
  return !parent || css(parent, "cursor") !== "pointer";
}

export function classifyPath(path: EventTarget[]): Omit<Gesture, "time"> {
  const elements = path.filter(isElement);
  const inPage = (el: Element) => el !== document.body && el !== document.documentElement;

  let overlay: Element | null = null;
  for (const el of elements) {
    if (!inPage(el)) break;
    if (overlayInfo(el)) {
      overlay = el;
      break;
    }
  }

  let interactive: Element | null = null;
  if (!overlay) {
    for (const el of elements) {
      if (!inPage(el)) break;
      if (matches(el, INTERACTIVE) || ownPointerCursor(el)) {
        interactive = el;
        break;
      }
    }
  }

  return { target: elements[0] ?? null, interactive, overlay };
}

let last: Gesture | null = null;

export const recentGesture = (withinMs: number): Gesture | null =>
  last && now() - last.time <= withinMs ? last : null;

/**
 * Record every trusted pointerdown/click in the capture phase. Installed at
 * document_start, so our window-level capture listener runs before any page
 * listener and can't be removed by the page.
 */
export function installGestureTracking(win: Window, onClick?: (e: Event, g: Gesture) => void): void {
  const record = (e: Event): Gesture | null => {
    if (!e.isTrusted) return null;
    last = { time: now(), ...classifyPath(pathOf(e)) };
    return last;
  };
  listen(win, "pointerdown", record, { capture: true });
  listen(win, "click", (e) => {
    const g = record(e);
    if (g && onClick) onClick(e, g);
  }, { capture: true });
}

/**
 * The user clicked a real link, but the script sends them to a third site
 * that is neither the link's destination nor the current page.
 */
export function isLinkHijack(control: Element, dest: string, page: string): boolean {
  if (control.tagName !== "A" && control.tagName !== "AREA") return false;
  const href = (control as HTMLAnchorElement).href;
  const linkSite = siteOf(href);
  if (linkSite === null) return false;
  const destSite = siteOf(dest, page);
  return destSite !== linkSite && destSite !== siteOf(page);
}
