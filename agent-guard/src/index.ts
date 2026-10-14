import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { HiddenTextReport, InitOptions, NullifyEvent, PageRisk, PointVerdict } from "@nullify/core";
import type { BrowserContext, Frame, Locator, Page } from "playwright-core";

export type { HiddenTextReport, NullifyEvent, PageRisk, PointVerdict } from "@nullify/core";

const require = createRequire(import.meta.url);

/** Name of the in-page API; must match AGENT_API in @nullify/core. */
const AGENT_API = "__nullifyAgent";

let coreSource: string | undefined;

/** The browser bundle of @nullify/core, read once and cached. */
function loadCore(): string {
  coreSource ??= readFileSync(require.resolve("@nullify/core/iife"), "utf8");
  return coreSource;
}

export interface GuardOptions extends InitOptions {
  /** Check every `page.mouse` click, double-click and press before it happens (coordinate / vision agents). Default true. */
  protectMouse?: boolean;
  /** Close tabs that open without the engine approving them. Default true. */
  closeRogueTabs?: boolean;
  /** Called for each intervention made on the Node side. */
  onIntervention?: (e: Intervention) => void;
}

export interface Intervention {
  kind: "click-refused" | "rogue-tab-closed";
  reason: string;
  url: string;
  time: number;
  verdict?: PointVerdict;
}

/** One sentence an agent can act on. Built only from visible, non-instruction text (see describe() in core). */
export function explain(v: PointVerdict): string {
  const meant = v.meant ?? "the visible target";
  switch (v.reason) {
    case "invisible-frame":
      return `an invisible embedded frame (${v.hit}) sits on top of ${meant}.`;
    case "invisible-control":
      return `the click would land on an invisible control (${v.hit}) instead of what is shown${v.meant ? ` (${v.meant})` : ""}.`;
    case "invisible-layer-over-control":
      return `an invisible layer (${v.hit}) covers ${meant}.`;
    case "target-covered":
      return `${meant} is covered by ${v.hit ?? "another element"}.`;
    case "target-not-visible":
      return `${meant} is not visible on screen.`;
    default:
      return "the click would not land on what is shown.";
  }
}

export class NullifyBlockedError extends Error {
  readonly verdict: PointVerdict;

  constructor(verdict: PointVerdict) {
    super(`Nullify refused this click: ${explain(verdict)}`);
    this.name = "NullifyBlockedError";
    this.verdict = verdict;
  }
}

type MouseClickOptions = Parameters<Page["mouse"]["click"]>[2];
type MouseDownOptions = Parameters<Page["mouse"]["down"]>[0];
type LocatorClickOptions = Parameters<Locator["click"]>[0];
type LastBlock = (PointVerdict & { time: number }) | null;
/** What the in-page prepare calls return: the verdict and the block-log mark to compare against after clicking. */
interface Prepared {
  verdict: PointVerdict;
  since: number;
}

interface RawMouse {
  click: Page["mouse"]["click"];
  dblclick: Page["mouse"]["dblclick"];
  down: Page["mouse"]["down"];
}

export class NullifyGuard {
  /** Clicks refused and tabs closed on the Node side, oldest first. */
  readonly interventions: Intervention[] = [];
  readonly #token: string;
  readonly #onIntervention: ((e: Intervention) => void) | undefined;
  readonly #rawMouse = new WeakMap<Page, RawMouse>();
  readonly #watched = new WeakSet<Page>();

  constructor(token: string, onIntervention?: (e: Intervention) => void) {
    this.#token = token;
    this.#onIntervention = onIntervention;
  }

  // ---- reading the page --------------------------------------------------

  /** What a click at (x, y) would really hit, without clicking. */
  assess(page: Page, x: number, y: number): Promise<PointVerdict> {
    return call(page, "assess", x, y);
  }

  /** Whether a click on this element would reach it, without clicking. Scrolls it into view if needed. */
  assessElement(locator: Locator): Promise<PointVerdict & { point?: { x: number; y: number } }> {
    return locator.evaluate((el, api) => (globalThis as any)[api].assessElement(el), AGENT_API);
  }

  /** Page text a person can see, without hidden text. Feed this to the model instead of innerText. */
  visibleText(page: Page | Frame): Promise<string> {
    return call(page, "visibleText");
  }

  /** Text that is rendered but invisible to people, flagged when it reads like an instruction. */
  hiddenText(page: Page | Frame): Promise<HiddenTextReport[]> {
    return call(page, "hiddenText");
  }

  pageRisk(page: Page | Frame): Promise<PageRisk> {
    return call(page, "pageRisk");
  }

  /** The in-page event log: everything the engine blocked, removed or reported. */
  events(page: Page | Frame): Promise<NullifyEvent[]> {
    return call(page, "events");
  }

  // ---- clicking ------------------------------------------------------------

  /** Click at (x, y) only if the click would land on what is visible there. Throws NullifyBlockedError otherwise. */
  async click(page: Page, x: number, y: number, options?: MouseClickOptions): Promise<void> {
    await this.#press(page, x, y, () => this.#mouse(page).click(x, y, options));
  }

  /**
   * Click an element (DOM-based agents). Fails immediately with a reason
   * instead of Playwright's "intercepts pointer events" timeout, and the
   * in-page shield re-checks that the element itself receives the click.
   */
  async clickElement(locator: Locator, options?: LocatorClickOptions): Promise<void> {
    const page = locator.page();
    // One round trip: scroll into view, check, and tell the in-page shield which element is meant.
    const { verdict, since } = await locator.evaluate(
      (el, [api, token]) => (globalThis as any)[api].prepareElement(token, el),
      [AGENT_API, this.#token] as const,
    ) as Prepared;
    if (!verdict.ok) this.#refuse(page, verdict);
    await locator.click(options);
    await this.#afterPress(page, since);
  }

  /**
   * Route every `page.mouse` click, double-click and press through the check,
   * so existing agent code is protected without changes.
   */
  protect(page: Page): void {
    if (this.#rawMouse.has(page)) return;
    const mouse = page.mouse;
    const raw: RawMouse = { click: mouse.click.bind(mouse), dblclick: mouse.dblclick.bind(mouse), down: mouse.down.bind(mouse) };
    this.#rawMouse.set(page, raw);

    const move = mouse.move.bind(mouse);
    let at = { x: 0, y: 0 };
    mouse.move = async (x, y, options) => {
      at = { x, y };
      return move(x, y, options);
    };
    mouse.click = async (x, y, options) => {
      at = { x, y };
      await this.#press(page, x, y, () => raw.click(x, y, options));
    };
    mouse.dblclick = async (x, y, options) => {
      at = { x, y };
      await this.#press(page, x, y, () => raw.dblclick(x, y, options));
    };
    mouse.down = async (options?: MouseDownOptions) => {
      await this.#press(page, at.x, at.y, () => raw.down(options));
    };
  }

  /** Close popups from this page that the engine didn't approve. */
  watchPopups(page: Page): void {
    if (this.#watched.has(page)) return;
    this.#watched.add(page);
    page.on("popup", (popup) => void this.#judgePopup(page, popup));
  }

  // ---- internals -------------------------------------------------------------

  #mouse(page: Page): RawMouse {
    return this.#rawMouse.get(page) ?? page.mouse;
  }

  async #press(page: Page, x: number, y: number, press: () => Promise<void>): Promise<void> {
    const { verdict, since } = await call<Prepared>(page, "prepare", x, y);
    if (!verdict.ok) this.#refuse(page, verdict);
    await press();
    await this.#afterPress(page, since);
  }

  /** The page changed between our check and the click, and the in-page shield cancelled it. Surface that as a refusal too. */
  async #afterPress(page: Page, before: number): Promise<void> {
    const last = await call<LastBlock>(page, "lastBlock").catch(() => null); // the click may have navigated away
    if (last && last.time > before) this.#refuse(page, last);
  }

  #refuse(page: Page, verdict: PointVerdict): never {
    this.#record({ kind: "click-refused", reason: verdict.reason ?? "unknown", url: page.url(), time: Date.now(), verdict });
    throw new NullifyBlockedError(verdict);
  }

  async #judgePopup(opener: Page, popup: Page): Promise<void> {
    for (const frame of opener.frames()) {
      try {
        if (await call<boolean>(frame, "popupAllowedWithin", 3000)) return;
      } catch {
        // Frame detached or engine not loaded there.
      }
    }
    this.#record({ kind: "rogue-tab-closed", reason: "opened without an approved click", url: popup.url(), time: Date.now() });
    await popup.close().catch(() => {});
  }

  #record(e: Intervention): void {
    this.interventions.push(e);
    this.#onIntervention?.(e);
  }
}

/** Call the in-page agent API. */
function call<T>(target: Page | Frame, method: string, ...args: unknown[]): Promise<T> {
  return target.evaluate(([api, m, a]) => {
    const fn = (globalThis as any)[api]?.[m];
    if (typeof fn !== "function") throw new Error("Nullify engine is not loaded in this page; guard() must run before navigation");
    return fn(...a);
  }, [AGENT_API, method, args] as const) as Promise<T>;
}

const isContext = (t: Page | BrowserContext): t is BrowserContext => typeof (t as Page).goto !== "function";

/**
 * Protect a Playwright page or context. Call it before navigating: the engine
 * is injected into every page and frame before any page script runs.
 *
 * A context is the better target: popups and new pages get the engine too.
 */
export async function guard(target: Page | BrowserContext, options: GuardOptions = {}): Promise<NullifyGuard> {
  const { protectMouse = true, closeRogueTabs = true, onIntervention, ...init } = options;
  const token = randomUUID();
  const initOptions: InitOptions = { ...init, agentToken: token, policy: { clickShield: true, ...init.policy } };

  // Wrapped in a function scope so the bundle doesn't leave a `Nullify` global the page could call.
  const content = `(() => {\n${loadCore()}\nNullify.init("agent-guard", ${JSON.stringify(initOptions)});\n})();`;
  await target.addInitScript({ content });

  const g = new NullifyGuard(token, onIntervention);
  const adopt = (page: Page) => {
    if (protectMouse) g.protect(page);
    if (closeRogueTabs) g.watchPopups(page);
  };
  if (isContext(target)) {
    target.pages().forEach(adopt);
    target.on("page", adopt);
  } else {
    adopt(target);
  }
  return g;
}
