// Replay page: every blocked attempt in a tab, drawn as a chain
// (this page -> who did it -> what it tried -> what Nullify did).
import { siteOf } from "@nullifyads/core";
import { ago, explain } from "./explain.js";
import { isIntervention, readTab, type PageRecord, type StoredEvent } from "./store.js";
import { byId, el, shortUrl } from "./ui.js";

const tabId = Number(new URLSearchParams(location.search).get("tab"));

function step(label: string, value: string, index: number, extra = ""): HTMLElement {
  const s = el("div", `step ${extra}`.trim());
  s.style.setProperty("--i", String(index));
  s.append(el("span", "label", label), el("span", "value", value));
  return s;
}

function arrow(index: number): HTMLElement {
  const a = el("span", "arrow", "→");
  a.style.setProperty("--i", String(index));
  a.setAttribute("aria-hidden", "true");
  return a;
}

function card(e: StoredEvent, page: PageRecord, cardIndex: number): HTMLElement {
  const x = explain(e, page.url);
  const article = el("article", "card");
  article.style.setProperty("--card", String(cardIndex));

  const chain = el("div", "chain");
  const where = e.frameUrl ?? page.url;
  chain.append(
    // The site only: the full page URL is already the section heading.
    step(e.frameUrl ? "Embedded page" : "This page", siteOf(where) ?? shortUrl(where), 0),
    arrow(1),
    step(e.kind === "overlay" ? "What" : "Who", x.culprit, 2),
    arrow(3),
    step("Tried to", x.attempt, 4),
    arrow(5),
    step("Nullify", x.verdict, 6, "verdict"),
  );

  const head = el("div", "card-head");
  head.append(el("h3", undefined, x.title));
  article.append(head, chain, el("p", "story", x.story));
  return article;
}

function pageSection(page: PageRecord, firstCard: number): { section: HTMLElement; cards: number } {
  const section = el("section", "page");
  const head = el("div", "page-head");
  head.append(el("h2", undefined, shortUrl(page.url)), el("span", "muted", ago(page.startedAt)));
  section.append(head);

  if (page.events.some((e) => e.kind === "scam")) {
    const warning = el("div", "scam");
    warning.append(el("strong", undefined, "This page looks like a scam"), explain(page.events.find((e) => e.kind === "scam")!, page.url).story);
    section.append(warning);
  }

  const shown = page.events.filter(isIntervention);
  shown.forEach((e, i) => section.append(card(e, page, firstCard + i)));
  return { section, cards: shown.length };
}

async function render(): Promise<void> {
  const record = await readTab(tabId);
  const pages = record.pages.filter((p) => p.events.some((e) => isIntervention(e) || e.kind === "scam"));
  const latest = record.pages.at(-1);
  byId("subtitle").textContent = latest ? `In the tab showing ${shortUrl(latest.url)}` : "This tab";

  const container = byId("pages");
  let cardIndex = 0;
  const sections = pages.slice().reverse().map((page) => {
    const { section, cards } = pageSection(page, cardIndex);
    cardIndex += cards;
    return section;
  });
  container.replaceChildren(...sections);
  byId("empty").hidden = sections.length > 0;
  play();
}

/** Restart the step-by-step animation. */
function play(): void {
  const container = byId("pages");
  container.classList.remove("animate");
  void container.offsetWidth; // reflow so the animation restarts
  container.classList.add("animate");
}

byId("replay").addEventListener("click", play);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && `tab:${tabId}` in changes) void render();
});
void render();
