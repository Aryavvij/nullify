/**
 * Hidden-text finder.
 *
 * Looks for text that is *rendered* (so it is in innerText and the
 * accessibility tree an agent reads) but that a person can't see:
 * transparent, same colour as its background, microscopic, off-screen,
 * clipped away, or tucked into aria-label/alt/title. This is the main
 * carrier for prompt injection against browser agents.
 *
 * display:none / visibility:hidden text is skipped on purpose: it's out of
 * innerText and the accessibility tree, and sites hide closed menus and tabs
 * that way all the time.
 */
import { effectiveOpacity, parseColor } from "./overlay.js";
import { css, isRendered, queryAll, rectOf } from "./pristine.js";

export type HiddenTechnique =
  | "transparent" | "same-color" | "tiny-font" | "offscreen" | "clipped" | "zero-size" | "attribute";

export interface HiddenText {
  text: string;
  technique: HiddenTechnique;
  /** Reads like an instruction aimed at an AI agent. */
  instructionLike: boolean;
  element: Element;
}

const INSTRUCTION_PATTERNS = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|any|your)\b.{0,30}\b(instructions?|prompts?|rules?|guidelines?|tasks?)\b/i,
  /\b(you are|act as|you're)\b.{0,30}\b(an? )?(ai|assistant|agent|model|chatbot|llm)\b/i,
  /\b(system prompt|developer message|new instructions?|important instructions?)\b/i,
  /\b(ai|assistant|agent|llm)\b\s*[:,-]\s*(please\s+)?(click|navigate|go to|open|visit|enter|type|fill|submit|send|download|run|execute|transfer)\b/i,
  /\b(do not|don't|never)\s+(tell|inform|mention|alert|notify|show)\s+(the\s+)?user\b/i,
  /\b(enter|type|send|submit|paste|share|provide|reveal)\b.{0,40}\b(password|credentials?|api key|seed phrase|private key|credit card|card number|ssn|one[- ]time code|otp)\b/i,
];

export const looksLikeInstruction = (text: string): boolean => INSTRUCTION_PATTERNS.some((re) => re.test(text));

function luminance([r, g, b]: [number, number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** First mostly-opaque background colour behind `el`; white if none is set. */
function backgroundBehind(el: Element): [number, number, number, number] {
  for (let e: Element | null = el; e; e = e.parentElement) {
    if (css(e, "background-image") !== "none") return [-1, -1, -1, 1]; // unknown: images defeat the check
    const bg = parseColor(css(e, "background-color"));
    if (bg && bg[3] > 0.5) return bg;
  }
  return [255, 255, 255, 1];
}

function isClipped(el: Element): boolean {
  for (let e: Element | null = el, depth = 0; e && depth < 3; e = e.parentElement, depth++) {
    const clip = css(e, "clip");
    const clipPath = css(e, "clip-path");
    if (/rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)/.test(clip)) return true;
    if (/inset\(\s*(50|100)%/.test(clipPath)) return true;
  }
  return false;
}

/** How `el`'s own text is hidden, or null if a person can read it. */
export function techniqueFor(el: Element): HiddenTechnique | null {
  if (!isRendered(el) || css(el, "visibility") !== "visible") return null;
  if (effectiveOpacity(el) < 0.05) return "transparent";

  const color = parseColor(css(el, "color"));
  if (color && color[3] < 0.05) return "transparent";

  if (Number.parseFloat(css(el, "font-size")) < 2) return "tiny-font";
  if (isClipped(el)) return "clipped";

  const r = rectOf(el);
  if ((r.width < 2 || r.height < 2) && css(el, "overflow") !== "visible") return "zero-size";

  const docW = Math.max(document.documentElement.scrollWidth, window.innerWidth);
  const docH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
  if (r.right + window.scrollX <= 0 || r.bottom + window.scrollY <= 0 || r.left + window.scrollX >= docW || r.top + window.scrollY >= docH) {
    return "offscreen";
  }

  if (color) {
    const bg = backgroundBehind(el);
    if (bg[0] >= 0) {
      const [l1, l2] = [luminance(color), luminance(bg)].sort((a, b) => b - a) as [number, number];
      if ((l1 + 0.05) / (l2 + 0.05) < 1.1) return "same-color";
    }
  }
  return null;
}

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "TITLE", "META"]);
const BLOCK_DISPLAYS = new Set(["block", "flex", "grid", "list-item", "table", "table-row", "flow-root"]);

/**
 * The page text a person can actually see: rendered text minus everything
 * findHiddenText would flag. Feed this to the model instead of innerText.
 */
export function visibleText(root: Document = document): string {
  const body = root.body;
  if (!body) return "";
  const hidden = new Map<Element, boolean>();
  const isHidden = (el: Element) => {
    let h = hidden.get(el);
    if (h === undefined) {
      h = !isRendered(el) || css(el, "visibility") !== "visible" || techniqueFor(el) !== null;
      hidden.set(el, h);
    }
    return h;
  };

  const lines: string[] = [];
  let line = "";
  let lastBlock: Element | null = null;
  const walker = root.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || SKIP.has(parent.tagName) || isHidden(parent)) continue;
    const text = (n.nodeValue ?? "").replace(/\s+/g, " ");
    if (!text.trim()) continue;

    let block: Element | null = parent;
    while (block && block !== body && !BLOCK_DISPLAYS.has(css(block, "display"))) block = block.parentElement;
    if (block !== lastBlock && line.trim()) {
      lines.push(line.trim());
      line = "";
    }
    lastBlock = block;
    line += text;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n");
}
const MIN_LENGTH = 3;
const ATTR_MIN_LENGTH = 40;

export function findHiddenText(root: Document = document): HiddenText[] {
  const body = root.body;
  if (!body) return [];
  const found: HiddenText[] = [];

  // Group text by its parent element so each element is styled/measured once.
  const textByElement = new Map<Element, string>();
  const walker = root.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || SKIP.has(parent.tagName)) continue;
    const text = (n.nodeValue ?? "").replace(/\s+/g, " ").trim();
    if (text.length < MIN_LENGTH) continue;
    textByElement.set(parent, ((textByElement.get(parent) ?? "") + " " + text).trim());
  }

  for (const [element, text] of textByElement) {
    const technique = techniqueFor(element);
    if (technique) found.push({ text, technique, instructionLike: looksLikeInstruction(text), element });
  }

  // Attribute text an agent may read through the accessibility tree.
  for (const element of queryAll(body, "[aria-label], [alt], [title], [aria-description]")) {
    if (!isRendered(element)) continue;
    for (const attr of ["aria-label", "alt", "title", "aria-description"]) {
      const value = element.getAttribute(attr)?.trim();
      if (value && value.length >= ATTR_MIN_LENGTH && looksLikeInstruction(value)) {
        found.push({ text: value, technique: "attribute", instructionLike: true, element });
      }
    }
  }
  return found;
}
