/**
 * "Site" = scheme-less registrable domain (eTLD+1), the unit we use to decide
 * whether a popup or navigation goes somewhere unrelated to the current page.
 *
 * Uses a short list of common multi-label public suffixes instead of the full
 * Public Suffix List (~200 KB). Good enough for detection; swap in the PSL if
 * false "same site" matches on exotic suffixes ever matter.
 */

const MULTI_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.za", "co.jp", "co.kr", "co.in",
  "com.br", "com.cn", "com.mx", "com.tr", "com.sg", "com.hk", "com.tw",
  "github.io", "gitlab.io", "vercel.app", "netlify.app", "pages.dev", "workers.dev",
  "herokuapp.com", "appspot.com", "web.app", "firebaseapp.com", "blogspot.com",
  "azurewebsites.net", "cloudfront.net", "s3.amazonaws.com",
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Registrable domain of an http(s) URL, or null for anything else (about:, data:, blob:, javascript:, invalid). */
export function siteOf(input: string | URL, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (IPV4.test(host) || host.startsWith("[")) return host;

  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join(".");
  return MULTI_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/**
 * True when `dest` leaves the page's site. Blank / non-http destinations count
 * as external: `window.open()` returns an about:blank window a script can point
 * anywhere, which is a standard hijack trick.
 */
export function isExternal(dest: string | URL | undefined, page: string): boolean {
  if (dest === undefined || String(dest) === "") return true;
  const destSite = siteOf(dest, page);
  const pageSite = siteOf(page);
  if (destSite === null || pageSite === null) return true;
  return destSite !== pageSite;
}

export function resolveUrl(dest: string | URL | undefined, page: string): string {
  if (dest === undefined || String(dest) === "") return "about:blank";
  try {
    return new URL(dest, page).href;
  } catch {
    return String(dest);
  }
}
