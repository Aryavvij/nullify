import { listen, observe } from "./pristine.js";

/**
 * Run `cb` once <html> exists. Init scripts (Playwright addInitScript) can run
 * before the parser has created it, so it may not exist yet when we boot.
 */
export function onDocumentRoot(cb: (root: HTMLElement) => void): void {
  if (document.documentElement) return cb(document.documentElement);
  const mo = observe(document, { childList: true }, () => {
    if (!document.documentElement) return;
    mo.disconnect();
    cb(document.documentElement);
  });
}

/** Run `cb` once <body> is parsed. */
export function onBody(cb: (body: HTMLElement) => void): void {
  if (document.body) return cb(document.body);
  listen(document, "DOMContentLoaded", () => document.body && cb(document.body), { once: true });
}
