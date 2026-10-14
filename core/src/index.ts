/**
 * @nullify/core — the shared detection engine.
 *
 * This file must stay page-agnostic: the same bundle is injected by the
 * browser extension (MAIN world), by Agent Guard (Playwright addInitScript)
 * and later by the crawler. No chrome.* or Node APIs in here.
 */
import { assessPoint, exposeAgentApi, installClickShield, pageRisk } from "./agent.js";
import { onDocumentRoot } from "./dom.js";
import { events, onEvent } from "./events.js";
import { installGuards } from "./guards.js";
import { findHiddenText } from "./hidden-text.js";
import { installOverlayWatcher, scanOverlays } from "./overlay.js";
import { setPolicy, type Policy } from "./policy.js";
import { hasDOM, log } from "./pristine.js";
import { installScamSignals, scamReport } from "./scam.js";

export const VERSION = "0.1.0";

export type Host = "extension" | "agent-guard" | "crawler" | "test";

export interface NullifyState {
  readonly version: string;
  readonly host: Host;
  readonly loadedAt: number;
}

export interface InitOptions {
  policy?: Partial<Policy>;
  /** Expose `window.__nullifyDebug` (event log and detectors) for tests. Pages can see it, so never in production. */
  debug?: boolean;
  /** Enables the agent API used by @nullify/agent-guard. The one state-changing call requires this token. */
  agentToken?: string;
}

const STATE_KEY = "__nullify";

/** Boot the engine once per realm. Repeat calls return the first state. */
export function init(host: Host, options: InitOptions = {}): NullifyState {
  const g = globalThis as typeof globalThis & { [STATE_KEY]?: NullifyState };
  const existing = g[STATE_KEY];
  if (existing) return existing;

  const state: NullifyState = Object.freeze({ version: VERSION, host, loadedAt: Date.now() });
  Object.defineProperty(g, STATE_KEY, { value: state, configurable: false, enumerable: false });

  if (hasDOM) {
    setPolicy(options.policy);
    const win = window as Window & typeof globalThis;
    installClickShield(win); // first, so it can cancel a whole click before anything else sees it
    installGuards(win);
    installOverlayWatcher();
    installScamSignals(win);

    onEvent((e) => {
      if (e.action !== "reported") log(`[nullify] ${e.action} ${e.kind}: ${e.reason}`, e.url ?? "");
    });
    if (options.agentToken) exposeAgentApi(options.agentToken);
    if (options.debug) {
      Object.defineProperty(g, "__nullifyDebug", {
        value: Object.freeze({ events, scanOverlays, findHiddenText, scamReport, assessPoint, pageRisk }),
      });
    }
    onDocumentRoot((root) => root.setAttribute("data-nullify", host));
  }

  // Only in debug mode: every website's console would otherwise show this line.
  if (options.debug) log(`[nullify] core v${VERSION} loaded via ${host}`);
  return state;
}

export function getState(): NullifyState | undefined {
  return (globalThis as typeof globalThis & { [STATE_KEY]?: NullifyState })[STATE_KEY];
}

export {
  AGENT_API, assessPoint, pageRisk, type BlockReason, type HiddenTextReport, type PageRisk, type PointVerdict,
} from "./agent.js";
export { events, onEvent, type NullifyEvent } from "./events.js";
export { onPopupAllowed } from "./guards.js";
export { findHiddenText, looksLikeInstruction, visibleText, type HiddenText } from "./hidden-text.js";
export { overlayInfo, scanOverlays, type OverlayFinding } from "./overlay.js";
export { policy, type Policy } from "./policy.js";
export { scamReport, type ScamReport } from "./scam.js";
export { isExternal, siteOf } from "./site.js";
