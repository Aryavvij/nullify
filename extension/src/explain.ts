/** Plain-language descriptions of what Nullify did, shared by the popup and the replay page. */
import { siteOf } from "@nullify/core";
import type { StoredEvent } from "./store.js";

export interface Explained {
  /** Short headline, e.g. "Blocked a pop-up". */
  title: string;
  /** One sentence on what happened. */
  story: string;
  /** Where it tried to send you, as a site name. */
  destination: string | null;
  /** Which script (or thing) did it, in words. */
  culprit: string;
  /** What it tried to do, as a short phrase for the replay chain. */
  attempt: string;
  /** What Nullify did, one or two words. */
  verdict: string;
}

const HOW: Record<string, string> = {
  "window.open": "a pop-up window",
  "element.click": "a hidden link",
  dispatchEvent: "a fake click on a hidden link",
  "form.submit": "a hidden form",
  "form.requestSubmit": "a hidden form",
  navigation: "a redirect of this tab",
  "overlay-link": "an invisible link",
};

const host = (url: string | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

/** "ads.test/pop.js", or "a script inside this page" for inline scripts. */
export function culpritOf(e: StoredEvent, pageUrl: string): string {
  if (!e.source) return "a script on this page";
  const page = e.frameUrl ?? pageUrl;
  if (e.source.split("#")[0] === page.split("#")[0]) return "a script inside this page";
  try {
    const u = new URL(e.source);
    return `${u.host}${u.pathname.length > 32 ? `${u.pathname.slice(0, 29)}…` : u.pathname}`;
  } catch {
    return "a script on this page";
  }
}

export function explain(e: StoredEvent, pageUrl: string): Explained {
  const dest = e.url && e.url !== "about:blank" ? siteOf(e.url) ?? host(e.url) : null;
  const where = dest ?? "another site";
  const how = (e.via && HOW[e.via]) || (e.kind === "redirect" ? "a redirect of this tab" : "a pop-up window");
  const culprit = culpritOf(e, pageUrl);
  const tried = e.kind === "redirect" ? `send this tab to ${where}` : `open ${how} to ${where}`;

  switch (e.kind) {
    case "popup":
    case "redirect": {
      const title = e.kind === "redirect" ? "Stopped a redirect" : "Blocked a pop-up";
      const stories: Record<string, string> = {
        "click-on-invisible-overlay": `An invisible layer was covering the page. Your click landed on it, and it tried to ${tried}.`,
        "click-on-non-control": `You clicked part of the page that isn't a link or button, and a script used that click to ${tried}.`,
        "link-hijack": `You clicked a real link, and a script tried to ${tried} at the same time.`,
        "no-user-gesture": `A script tried to ${tried} without you clicking anything.`,
        "tab-opened-despite-block": `A tab to ${where} opened right after Nullify refused it, so Nullify closed the tab.`,
      };
      const verdict = e.reason === "tab-opened-despite-block" ? "Tab closed" : e.kind === "redirect" ? "Stopped" : "Blocked";
      return { title, story: stories[e.reason] ?? `A script tried to ${tried}.`, destination: dest, culprit, attempt: tried, verdict };
    }
    case "overlay": {
      const stories: Record<string, [string, string]> = {
        "overlay-link": ["Removed an invisible link", "An invisible link to another site was stretched over the page, waiting for a click."],
        "rearmed-trap": ["Removed a trap that came back", "The page put back an invisible layer that Nullify had already removed."],
        "trap-triggered-popup": ["Removed the layer that caught your click", "The invisible layer that just tried to open a pop-up is gone, so your next click works."],
        "trap-triggered-redirect": ["Removed the layer that caught your click", "The invisible layer that just tried to redirect this tab is gone, so your next click works."],
      };
      const [title, story] = stories[e.reason] ?? ["Noticed an invisible layer", "An invisible layer covers part of the page. Nullify is watching it."];
      return {
        title, story, destination: null, culprit: "an invisible layer",
        attempt: "catch your next click", verdict: e.action === "removed" ? "Removed" : "Watching",
      };
    }
    case "scam":
      return {
        title: "This page looks like a scam",
        story: "It shows signs of a tech-support scam: fake virus warnings, a support phone number, or attempts to lock your screen. Don't call any number or enter details here.",
        destination: null, culprit: "this page", attempt: "scare you into calling or paying", verdict: "Warning",
      };
    case "click":
      return {
        title: "Stopped a hidden click", story: "The click would have landed on something invisible, so Nullify cancelled it.",
        destination: null, culprit: "an invisible control", attempt: "take a click meant for something else", verdict: "Cancelled",
      };
    case "hidden-text":
      return {
        title: "Found hidden text", story: "This page contains text you can't see.",
        destination: null, culprit: "this page", attempt: "hide text from you", verdict: "Noted",
      };
  }
}

/** "just now", "12 s ago", "3 min ago". */
export function ago(time: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - time) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}
