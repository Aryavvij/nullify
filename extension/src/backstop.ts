/**
 * Tab backstop: the page-level engine stops popups before they open, but if a
 * tab still opens to a site the engine *just* refused for that same tab, some
 * route around the engine was used, and the tab is closed.
 *
 * Deliberately narrow, because closing a tab the user wanted is worse than
 * missing an ad: it never acts if the engine approved a popup in the opener
 * shortly before (a real click on a real link), and only matches a site that
 * was blocked moments ago.
 */
import { siteOf } from "@nullify/core";

export interface BackstopSignals {
  /** Sites the engine refused to open from this tab, with when. */
  blocked: Array<{ site: string; time: number }>;
  /** Last time the engine approved a popup in this tab. */
  lastAllowedPopup: number;
}

export const BLOCK_MEMORY_MS = 5000;
export const ALLOW_GRACE_MS = 3000;

export function shouldCloseNewTab(signals: BackstopSignals, url: string, now: number): boolean {
  if (now - signals.lastAllowedPopup <= ALLOW_GRACE_MS) return false;
  const site = siteOf(url);
  if (!site) return false; // about:blank and friends: nothing to match against
  return signals.blocked.some((b) => b.site === site && now - b.time <= BLOCK_MEMORY_MS);
}
