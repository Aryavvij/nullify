// Toolbar popup: what Nullify did on the current page, and the per-site switch.
import { siteOf } from "@nullify/core";
import type { RuntimeMessage } from "./channel.js";
import { ago, explain } from "./explain.js";
import { currentPage, disabledSites, isIntervention, readTab } from "./store.js";
import { byId, el } from "./ui.js";

const MAX_LISTED = 5;

/** The tab this popup is about: ?tab= (used by tests and the replay link), else the active tab. */
async function targetTab(): Promise<chrome.tabs.Tab | undefined> {
  const fromQuery = Number(new URLSearchParams(location.search).get("tab"));
  if (fromQuery) return chrome.tabs.get(fromQuery).catch(() => undefined);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function render(tab: chrome.tabs.Tab): Promise<void> {
  const url = tab.url ?? "";
  const site = siteOf(url);
  const toggle = byId<HTMLInputElement>("enabled");
  byId("site").textContent = site ?? "This page";
  toggle.disabled = !site;
  if (site) toggle.checked = !(await disabledSites()).includes(site);
  else showNote("Nullify doesn't run on browser pages.");

  const record = await readTab(tab.id!);
  const events = currentPage(record)?.events ?? [];
  const done = events.filter(isIntervention);
  const pageUrl = currentPage(record)?.url ?? url;

  const scam = events.some((e) => e.kind === "scam");
  byId("scam").hidden = !scam;
  byId("count").textContent = String(done.length);
  byId("count-label").textContent = done.length === 1 ? "thing blocked on this page" : "things blocked on this page";
  byId("empty").hidden = done.length > 0 || scam; // "nothing tried anything" would contradict the scam warning

  const list = byId("events");
  list.replaceChildren(
    ...done.slice(-MAX_LISTED).reverse().map((e) => {
      const x = explain(e, pageUrl);
      const li = el("li");
      li.append(el("div", "title", x.title));
      const meta = el("div", "meta");
      if (x.destination) meta.append("to ", el("span", "dest", x.destination), " · ");
      meta.append(ago(e.time));
      li.append(meta);
      return li;
    }),
  );
}

function showNote(text: string, withReload?: () => void): void {
  const note = byId("note");
  note.replaceChildren(text);
  if (withReload) {
    const button = el("button", "ghost", "Reload");
    button.type = "button";
    button.addEventListener("click", withReload);
    note.append(button);
  }
  note.hidden = false;
}

async function main(): Promise<void> {
  const tab = await targetTab();
  if (!tab?.id) return;
  const tabId = tab.id;
  await render(tab);

  byId<HTMLInputElement>("enabled").addEventListener("change", async (e) => {
    const site = siteOf(tab.url ?? "");
    if (!site) return;
    const enabled = (e.target as HTMLInputElement).checked;
    const message: RuntimeMessage = { type: "set-site-enabled", site, enabled };
    await chrome.runtime.sendMessage(message);
    showNote(enabled ? "Protection is back on. It applies after a reload." : "Protection is off for this site. It applies after a reload.", () => {
      void chrome.tabs.reload(tabId);
      window.close();
    });
  });

  byId("replay").addEventListener("click", () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL(`replay.html?tab=${tabId}`) });
  });

  // Keep the numbers live while the popup is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && `tab:${tabId}` in changes) void chrome.tabs.get(tabId).then(render, () => {});
  });
}

void main();
