/**
 * Native DOM functions captured at boot, before any page script runs.
 * Detectors call these instead of the live globals so a page can't fool them
 * by overriding getComputedStyle, getBoundingClientRect, elementFromPoint, etc.
 */

const apply = Reflect.apply;

export const hasDOM = typeof window !== "undefined" && typeof document !== "undefined";

function capture() {
  return {
    getComputedStyle: window.getComputedStyle,
    getPropertyValue: CSSStyleDeclaration.prototype.getPropertyValue,
    getBoundingClientRect: Element.prototype.getBoundingClientRect,
    getClientRects: Element.prototype.getClientRects,
    elementFromPoint: Document.prototype.elementFromPoint,
    elementsFromPoint: Document.prototype.elementsFromPoint,
    docQueryAll: Document.prototype.querySelectorAll,
    elQueryAll: Element.prototype.querySelectorAll,
    elQuery: Element.prototype.querySelector,
    closest: Element.prototype.closest,
    matches: Element.prototype.matches,
    contains: Node.prototype.contains,
    composedPath: Event.prototype.composedPath,
    addEventListener: EventTarget.prototype.addEventListener,
    innerText: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText")?.get,
    style: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style")?.get,
    setProperty: CSSStyleDeclaration.prototype.setProperty,
    scrollIntoView: Element.prototype.scrollIntoView,
    setTimeout: window.setTimeout,
    setInterval: window.setInterval,
    MutationObserver: window.MutationObserver,
    now: Date.now,
    info: console.info,
  };
}

// Only touched when hasDOM is true; every export below is DOM-only.
const N = hasDOM ? capture() : (undefined as unknown as ReturnType<typeof capture>);

export const now = (): number => apply(N ? N.now : Date.now, Date, []);

export function css(el: Element, prop: string): string {
  const style = apply(N.getComputedStyle, window, [el]) as CSSStyleDeclaration;
  return apply(N.getPropertyValue, style, [prop]) as string;
}

export const rectOf = (el: Element): DOMRect => apply(N.getBoundingClientRect, el, []);

/** Has a layout box. False inside a display:none ancestor, where the element's own computed display can still be "inline". */
export const isRendered = (el: Element): boolean => (apply(N.getClientRects, el, []) as DOMRectList).length > 0;

export const elementAt = (x: number, y: number): Element | null => apply(N.elementFromPoint, document, [x, y]);
export const elementsAt = (x: number, y: number): Element[] => apply(N.elementsFromPoint, document, [x, y]);

export function queryAll(root: Document | Element, selector: string): Element[] {
  const fn = root.nodeType === Node.DOCUMENT_NODE ? N.docQueryAll : N.elQueryAll;
  return Array.from(apply(fn, root, [selector]) as NodeListOf<Element>);
}

/** Rendered text of an element, via the native getter so a page can't make it report something else. */
export const textOf = (el: Element): string =>
  (N.innerText && el instanceof HTMLElement ? apply(N.innerText, el, []) : el.textContent) ?? "";

export const scrollIntoView = (el: Element): void =>
  void apply(N.scrollIntoView, el, [{ block: "center", inline: "center", behavior: "instant" }]);

/** Set an inline style with the native setters, so a page can't no-op the change. */
export function setInlineStyle(el: Element, prop: string, value: string, priority = ""): void {
  if (!N.style) return;
  const style = apply(N.style, el, []) as CSSStyleDeclaration | undefined;
  if (style) apply(N.setProperty, style, [prop, value, priority]);
}

export const queryOne = (root: Element, selector: string): Element | null => apply(N.elQuery, root, [selector]);
export const closest = (el: Element, selector: string): Element | null => apply(N.closest, el, [selector]);
export const matches = (el: Element, selector: string): boolean => apply(N.matches, el, [selector]);
export const contains = (a: Node, b: Node): boolean => apply(N.contains, a, [b]);
export const pathOf = (e: Event): EventTarget[] => apply(N.composedPath, e, []);

export function listen(
  target: EventTarget,
  type: string,
  fn: (e: Event) => void,
  options?: AddEventListenerOptions,
): void {
  apply(N.addEventListener, target, [type, fn, options]);
}

export const later = (fn: () => void, ms: number): number => apply(N.setTimeout, window, [fn, ms]);
export const every = (fn: () => void, ms: number): number => apply(N.setInterval, window, [fn, ms]);

export function observe(target: Node, options: MutationObserverInit, fn: MutationCallback): MutationObserver {
  const mo = new N.MutationObserver(fn);
  mo.observe(target, options);
  return mo;
}

export const log = (...args: unknown[]): void => void apply(N ? N.info : console.info, console, args);

export const isElement = (t: unknown): t is Element =>
  typeof t === "object" && t !== null && (t as Node).nodeType === 1;
