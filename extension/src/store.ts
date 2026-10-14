/**
 * Extension state. Per-tab history lives in chrome.storage.session (in memory,
 * survives service-worker restarts, readable only by extension pages); the
 * per-site switch lives in chrome.storage.local.
 */
import type { NullifyEvent } from "@nullify/core";

export interface StoredEvent {
  kind: NullifyEvent["kind"];
  action: NullifyEvent["action"];
  reason: string;
  url?: string;
  via?: string;
  /** Page script that tried it, if known. */
  source?: string;
  /** Frame the event came from (differs from the page URL for embedded frames). */
  frameUrl?: string;
  time: number;
}

export interface PageRecord {
  url: string;
  startedAt: number;
  /** Chrome's id for the top-frame document, so events can't be filed under the wrong page. */
  documentId?: string;
  events: StoredEvent[];
}

export interface TabRecord {
  pages: PageRecord[];
  /** Last time the engine approved a popup in this tab (for the tab backstop). */
  lastAllowedPopup: number;
}

export const MAX_PAGES = 5;
export const MAX_EVENTS = 100;

const tabKey = (tabId: number) => `tab:${tabId}`;

export async function readTab(tabId: number): Promise<TabRecord> {
  const key = tabKey(tabId);
  const stored = (await chrome.storage.session.get(key))[key] as TabRecord | undefined;
  return stored ?? { pages: [], lastAllowedPopup: 0 };
}

export async function writeTab(tabId: number, record: TabRecord): Promise<void> {
  await chrome.storage.session.set({ [tabKey(tabId)]: record });
}

export async function dropTab(tabId: number): Promise<void> {
  await chrome.storage.session.remove(tabKey(tabId));
}

/** Events that count as Nullify doing something (as opposed to just noticing). */
export const isIntervention = (e: StoredEvent) => e.action === "blocked" || e.action === "removed";

export const currentPage = (record: TabRecord): PageRecord | undefined => record.pages.at(-1);

// ---- per-site switch -----------------------------------------------------------

const DISABLED_KEY = "disabledSites";

export async function disabledSites(): Promise<string[]> {
  const stored = (await chrome.storage.local.get(DISABLED_KEY))[DISABLED_KEY] as string[] | undefined;
  return stored ?? [];
}

export async function setDisabledSites(sites: string[]): Promise<void> {
  await chrome.storage.local.set({ [DISABLED_KEY]: [...new Set(sites)].sort() });
}
