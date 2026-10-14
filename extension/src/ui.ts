/** Small DOM helpers for the extension pages. Page-derived strings only ever go in as text, never as HTML. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** host + path, shortened, for showing a page URL. */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const full = u.host + path;
    return full.length > 60 ? `${full.slice(0, 57)}…` : full;
  } catch {
    return url.slice(0, 60);
  }
}
