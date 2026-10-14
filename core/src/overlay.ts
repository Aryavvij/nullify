/**
 * Invisible-overlay detection.
 *
 * An overlay is a positioned element that catches clicks, is effectively
 * invisible, and covers most of the viewport or most of a media element
 * (video, iframe, canvas...). Real sites use these too (video click layers,
 * menu backdrops), so an overlay is only *removed* when it is proven to be a
 * trap: it links off-site, a click on it just tried to open another site, or
 * it matches a trap we already removed (re-arming).
 */
import { onBody, onDocumentRoot } from "./dom.js";
import { emit } from "./events.js";
import { blocking, policy } from "./policy.js";
import {
  closest, contains, css, elementAt, every, isElement, later, observe, queryAll, queryOne, rectOf,
} from "./pristine.js";
import { isExternal } from "./site.js";

export type OverlayReason = "transparent-fullscreen" | "transparent-over-media";

export interface OverlayInfo {
  reason: OverlayReason;
  /** Fraction (0–1) of the viewport or media element covered. */
  coverage: number;
}

export interface OverlayFinding extends OverlayInfo {
  element: Element;
  confidence: "suspicious" | "hijack";
  /** Off-site link the overlay points to, when there is one. */
  link?: string;
}

const MEDIA = "video, iframe, embed, object, canvas";
const VISIBLE_CONTENT = "img, svg, video, canvas, iframe, picture, input, button, select, textarea";
const GRID = [0.1, 0.3, 0.5, 0.7, 0.9];
const MIN_MEDIA_AREA = 100 * 100;

export function parseColor(value: string): [number, number, number, number] | null {
  if (value === "transparent") return [0, 0, 0, 0];
  const m = /rgba?\(([^)]+)\)/.exec(value);
  if (!m?.[1]) return null;
  const [r = 0, g = 0, b = 0, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number.parseFloat);
  return [r, g, b, a];
}

export function effectiveOpacity(el: Element): number {
  let opacity = 1;
  for (let e: Element | null = el; e; e = e.parentElement) {
    const v = Number.parseFloat(css(e, "opacity"));
    if (!Number.isNaN(v)) opacity *= v;
  }
  return opacity;
}

function hasVisibleContent(el: Element): boolean {
  return (el.textContent ?? "").trim() !== "" || queryAll(el, VISIBLE_CONTENT).length > 0;
}

/** Paints nothing a user could see: near-zero opacity, or no fill and no content. */
export function isTransparent(el: Element): boolean {
  if (effectiveOpacity(el) < 0.1) return true;
  if (css(el, "backdrop-filter") !== "none") return false;
  const bg = parseColor(css(el, "background-color"));
  if (bg && bg[3] >= 0.05) return false;
  if (css(el, "background-image") !== "none") return false;
  return !hasVisibleContent(el);
}

function overlapArea(r: DOMRect, left: number, top: number, right: number, bottom: number): number {
  const w = Math.min(r.right, right) - Math.max(r.left, left);
  const h = Math.min(r.bottom, bottom) - Math.max(r.top, top);
  return w > 0 && h > 0 ? w * h : 0;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Non-null when `el` is an invisible, click-catching layer over the page or a media element. */
export function overlayInfo(el: Element): OverlayInfo | null {
  const position = css(el, "position");
  if (position !== "fixed" && position !== "absolute") return null;
  if (css(el, "pointer-events") === "none") return null;
  if (!isTransparent(el)) return null;

  const r = rectOf(el);
  if (r.width < 50 || r.height < 50) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const viewportCoverage = overlapArea(r, 0, 0, vw, vh) / (vw * vh);
  if (viewportCoverage >= 0.5) return { reason: "transparent-fullscreen", coverage: round(viewportCoverage) };

  for (const media of queryAll(document, MEDIA)) {
    if (media === el || contains(el, media)) continue;
    const mr = rectOf(media);
    const area = mr.width * mr.height;
    if (area < MIN_MEDIA_AREA) continue;
    const coverage = overlapArea(r, mr.left, mr.top, mr.right, mr.bottom) / area;
    if (coverage >= 0.5) return { reason: "transparent-over-media", coverage: round(coverage) };
  }
  return null;
}

/** The off-site href an overlay is, sits inside, or wraps. */
function externalLink(el: Element): string | null {
  const a = (el.tagName === "A" ? el : (closest(el, "a[href]") ?? queryOne(el, "a[href]"))) as HTMLAnchorElement | null;
  if (!a?.href) return null;
  return isExternal(a.href, location.href) ? a.href : null;
}

// ---------------------------------------------------------------------------
// Learned traps: once an overlay is proven malicious we remember its shape so
// re-inserted copies are removed the moment they appear.

const learned = new Set<string>();

const signature = (el: Element): string =>
  [el.tagName, el.id, [...el.classList].sort().join("."), css(el, "position"), css(el, "z-index")].join("|");

export const isLearnedTrap = (el: Element): boolean => learned.size > 0 && learned.has(signature(el));

const rearmCounts = new Map<string, number>();

/** Remove a proven trap and remember it. No-op in report mode beyond logging. */
export function neutralize(el: Element, reason: string): void {
  const sig = signature(el);
  learned.add(sig);

  if (reason === "rearmed-trap") {
    // Traps can re-arm every few hundred ms; log the first one, count the rest.
    const n = (rearmCounts.get(sig) ?? 0) + 1;
    rearmCounts.set(sig, n);
    if (n > 1) {
      if (blocking()) el.remove();
      return;
    }
  }

  emit({ kind: "overlay", action: blocking() ? "removed" : "reported", reason, detail: { tag: el.tagName.toLowerCase() } });
  if (blocking()) el.remove();
}

/** One pass over the viewport: sample a grid of points plus the centre of every media element. */
export function scanOverlays(): OverlayFinding[] {
  if (!document.body) return [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const seen = new Set<Element>();
  const findings: OverlayFinding[] = [];

  const consider = (start: Element | null) => {
    let el = start;
    for (let depth = 0; el && depth < 4; depth++, el = el.parentElement) {
      if (el === document.body || el === document.documentElement || seen.has(el)) return;
      seen.add(el);
      const info = overlayInfo(el);
      if (!info) continue;
      const link = externalLink(el);
      findings.push({
        element: el,
        ...info,
        confidence: link || isLearnedTrap(el) ? "hijack" : "suspicious",
        ...(link ? { link } : {}),
      });
      return;
    }
  };

  for (const fx of GRID) for (const fy of GRID) consider(elementAt(vw * fx, vh * fy));
  for (const media of queryAll(document, MEDIA)) {
    const r = rectOf(media);
    if (r.width * r.height >= MIN_MEDIA_AREA) consider(elementAt(r.left + r.width / 2, r.top + r.height / 2));
  }
  return findings;
}

const reported = new WeakSet<Element>();

function sweep(): void {
  for (const f of scanOverlays()) {
    if (f.confidence === "hijack") {
      neutralize(f.element, f.link ? "overlay-link" : "rearmed-trap");
    } else if (!reported.has(f.element)) {
      reported.add(f.element);
      emit({ kind: "overlay", action: "reported", reason: f.reason, detail: { coverage: f.coverage } });
    }
  }
}

/** Scan on load, on DOM changes (debounced) and on a timer, because traps re-arm. */
export function installOverlayWatcher(): void {
  let pending = false;
  const scheduleSweep = () => {
    if (pending) return;
    pending = true;
    later(() => {
      pending = false;
      sweep();
    }, 100);
  };

  onDocumentRoot((root) => {
    observe(root, { childList: true, subtree: true }, (records) => {
      let changed = false;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!isElement(node)) continue;
          changed = true;
          if (isLearnedTrap(node) && overlayInfo(node)) neutralize(node, "rearmed-trap");
        }
      }
      if (changed) scheduleSweep();
    });
  });

  onBody(() => scheduleSweep());
  every(() => {
    if (document.visibilityState === "visible") sweep();
  }, policy.scanIntervalMs);
}
