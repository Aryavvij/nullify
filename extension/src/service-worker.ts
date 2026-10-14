// Registers the engine (honouring the per-site switch), keeps a per-tab history
// of what it did, shows it on the toolbar badge, and runs the tab backstop.
import { siteOf, type NullifyEvent } from "@nullifyads/core";
import { shouldCloseNewTab } from "./backstop.js";
import type { RuntimeMessage } from "./channel.js";
import {
  MAX_EVENTS, MAX_PAGES, currentPage, disabledSites, dropTab, isIntervention, readTab, setDisabledSites, writeTab,
  type PageRecord, type StoredEvent, type TabRecord,
} from "./store.js";

// ---- content scripts ------------------------------------------------------------

const MAIN_ID = "nullify-main";
const ISOLATED_ID = "nullify-isolated";

/** Match patterns for a site and its subdomains. */
function sitePatterns(site: string): string[] {
  const hostOnly = /^[\d.]+$/.test(site) || site.startsWith("[") || !site.includes(".");
  return hostOnly ? [`*://${site}/*`] : [`*://*.${site}/*`];
}

let registration: Promise<void> = Promise.resolve();

/** (Re)register both engine scripts, skipping sites the user switched off. Serialized. */
function registerScripts(): Promise<void> {
  registration = registration.then(async () => {
    const exclude = (await disabledSites()).flatMap(sitePatterns);
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [MAIN_ID, ISOLATED_ID] });
    if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });

    const common = {
      matches: ["<all_urls>"],
      ...(exclude.length > 0 ? { excludeMatches: exclude } : {}),
      runAt: "document_start" as const,
      allFrames: true,
      matchOriginAsFallback: true,
      persistAcrossSessions: true,
    };
    await chrome.scripting.registerContentScripts([
      { id: MAIN_ID, js: ["main-world.js"], world: "MAIN", ...common },
      { id: ISOLATED_ID, js: ["isolated.js"], ...common },
    ]);
  }).catch((error: unknown) => console.error("[nullify] registering content scripts failed", error));
  return registration;
}

async function setSiteEnabled(site: string, enabled: boolean): Promise<void> {
  const sites = await disabledSites();
  await setDisabledSites(enabled ? sites.filter((s) => s !== site) : [...sites, site]);
  await registerScripts();
}

chrome.runtime.onInstalled.addListener(() => {
  void registerScripts();
  void chrome.action.setBadgeBackgroundColor({ color: "#E11D48" });
});
chrome.runtime.onStartup.addListener(() => void registerScripts());

// ---- per-tab history --------------------------------------------------------------

const queues = new Map<number, Promise<void>>();

/** Read-modify-write one tab's record, one update at a time per tab. */
function update(tabId: number, change: (record: TabRecord) => void): Promise<void> {
  const next = (queues.get(tabId) ?? Promise.resolve())
    .then(async () => {
      const record = await readTab(tabId);
      change(record);
      await writeTab(tabId, record);
      await refreshBadge(tabId, record);
    })
    .catch(() => {
      // Tab closed mid-update.
    });
  queues.set(tabId, next);
  return next;
}

/**
 * The page record for a top-frame document, created if needed and moved to
 * the end (it is the page now showing). Keyed by document id because a
 * page's first events can reach us before the navigation event does.
 */
function pageFor(record: TabRecord, url: string, documentId?: string): PageRecord {
  const index = documentId ? record.pages.findIndex((p) => p.documentId === documentId) : -1;
  if (index >= 0) {
    const [page] = record.pages.splice(index, 1);
    record.pages.push(page!); // e.g. back/forward restored it
    return page!;
  }
  const page: PageRecord = { url, startedAt: Date.now(), events: [], ...(documentId ? { documentId } : {}) };
  record.pages.push(page);
  if (record.pages.length > MAX_PAGES) record.pages.splice(0, record.pages.length - MAX_PAGES);
  return page;
}

function addEvent(page: PageRecord, event: StoredEvent): void {
  page.events.push(event);
  if (page.events.length > MAX_EVENTS) page.events.splice(0, page.events.length - MAX_EVENTS);
}

async function refreshBadge(tabId: number, record: TabRecord): Promise<void> {
  const events = currentPage(record)?.events ?? [];
  const scam = events.some((e) => e.kind === "scam");
  const count = events.filter(isIntervention).length;
  const text = scam ? "!" : count > 99 ? "99+" : count > 0 ? String(count) : "";
  await chrome.action.setBadgeText({ tabId, text }).catch(() => {});
}

const KINDS = new Set<string>(["popup", "redirect", "overlay", "hidden-text", "scam", "click"]);
const ACTIONS = new Set<string>(["blocked", "removed", "reported"]);
const str = (v: unknown, max: number) => (typeof v === "string" && v.length <= max ? v : undefined);

/** Events come from a page's realm: keep only well-formed, size-capped fields, and use our own clock. */
function toStored(e: NullifyEvent, frameUrl: string | undefined): StoredEvent | null {
  if (!e || !KINDS.has(e.kind) || !ACTIONS.has(e.action)) return null;
  const reason = str(e.reason, 64);
  if (!reason) return null;
  const detail = (e.detail ?? {}) as Record<string, unknown>;
  const stored: StoredEvent = { kind: e.kind, action: e.action, reason, time: Date.now() };
  const url = str(e.url, 2048);
  const via = str(detail.via, 40);
  const source = str(detail.source, 2048);
  if (url) stored.url = url;
  if (via) stored.via = via;
  if (source) stored.source = source;
  if (frameUrl) stored.frameUrl = frameUrl;
  return stored;
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  // From our content scripts.
  if (message?.type === "event" || message?.type === "popup-allowed") {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    if (message.type === "popup-allowed") {
      void update(tabId, (r) => void (r.lastAllowedPopup = Date.now()));
      return;
    }
    const top = sender.frameId === 0;
    const stored = toStored(message.event, top ? undefined : sender.url);
    if (!stored) return;
    void update(tabId, (r) => {
      // Top-frame events go to their own document's page; events from embedded frames go to the page showing now.
      const page = top
        ? pageFor(r, sender.url ?? "", sender.documentId)
        : (currentPage(r) ?? pageFor(r, sender.tab?.url ?? ""));
      addEvent(page, stored);
    });
    return;
  }

  // From our own pages (the popup, or the replay page), never from a content script: those report a web page URL.
  if (message?.type === "set-site-enabled" && sender.url?.startsWith(chrome.runtime.getURL(""))) {
    if (typeof message.site !== "string" || !siteOf(`http://${message.site}/`)) return;
    void setSiteEnabled(message.site, message.enabled === true).then(() => sendResponse({ ok: true }));
    return true; // respond asynchronously
  }
  return;
});

// A new document in the top frame starts a new page in the history.
chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0) return;
  void update(d.tabId, (r) => void pageFor(r, d.url, d.documentId));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  queues.delete(tabId);
  void dropTab(tabId);
});

// ---- tab backstop -----------------------------------------------------------------

chrome.webNavigation.onCreatedNavigationTarget.addListener((d) => {
  // Give the opener's in-flight "blocked" / "approved" messages a moment to land.
  setTimeout(() => void judgeNewTab(d.sourceTabId, d.tabId, d.url), 250);
});

async function judgeNewTab(sourceTabId: number, tabId: number, url: string): Promise<void> {
  await queues.get(sourceTabId);
  const record = await readTab(sourceTabId);
  const now = Date.now();
  const blocked = (currentPage(record)?.events ?? [])
    .filter((e) => (e.kind === "popup" || e.kind === "redirect") && e.action === "blocked" && e.url)
    .map((e) => ({ site: siteOf(e.url!) ?? "", time: e.time }));

  if (!shouldCloseNewTab({ blocked, lastAllowedPopup: record.lastAllowedPopup }, url, now)) return;
  await chrome.tabs.remove(tabId).catch(() => {});
  const event: StoredEvent = { kind: "popup", action: "blocked", reason: "tab-opened-despite-block", url, time: now };
  void update(sourceTabId, (r) => addEvent(currentPage(r) ?? pageFor(r, ""), event));
}
