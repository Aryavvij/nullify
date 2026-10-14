/**
 * Scam-page signals (tech-support scams, "click Allow" lures, fake errors).
 *
 * Low priority by design: Chrome's on-device model already covers tech-support
 * scams. This is a cheap, explainable score that works in any browser and for
 * agents. Phase 1 only reports; the warning screen comes with the extension UI.
 */
import { onBody } from "./dom.js";
import { emit } from "./events.js";
import { recentGesture } from "./intent.js";
import { policy } from "./policy.js";
import { later, now } from "./pristine.js";

const TEXT_SIGNALS: Array<[RegExp, number, string]> = [
  [/\b(virus(es)?|trojans?|spyware|malware|ransomware)\b.{0,60}\b(detected|found|infected)\b|\binfected\b.{0,40}\b(virus|malware|trojan)/i, 3, "infection-claim"],
  [/\byour (computer|pc|device|iphone|mac|browser|system|windows)\b.{0,40}\b(locked|blocked|infected|compromised|at risk|disabled|suspended)\b/i, 3, "device-locked-claim"],
  [/\b(call|contact|dial)\b.{0,40}\b(support|technician|helpline|help desk|microsoft|apple)\b/i, 2, "call-support"],
  [/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/, 1, "phone-number"],
  [/\btoll[- ]?free\b/i, 1, "toll-free"],
  [/\bdo not (close|restart|shut ?down|turn off|ignore|leave)\b/i, 2, "do-not-close"],
  [/\b(press|click|tap)\s+["“']?allow["”']?\b/i, 3, "click-allow-lure"],
  [/\b(error|code)[\s#:]*0x[0-9a-f]{4,}/i, 2, "fake-error-code"],
  [/\b(microsoft|windows|apple|google)\b.{0,30}\b(security|defender|support|alert|warning)\b/i, 1, "brand-security"],
];

const BEHAVIOR_WEIGHTS = {
  "keyboard-lock": 3,
  "notification-prompt-without-click": 2,
  "back-button-trap": 2,
  "dialog-loop": 2,
  "fullscreen-without-click": 1,
} as const;

type Behavior = keyof typeof BEHAVIOR_WEIGHTS;

const behaviors = new Set<Behavior>();

export interface ScamReport {
  score: number;
  signals: string[];
  likelyScam: boolean;
}

export function scamReport(): ScamReport {
  const signals: string[] = [];
  let score = 0;
  const text = (document.body?.innerText ?? "").slice(0, 20_000);
  for (const [re, weight, name] of TEXT_SIGNALS) {
    if (re.test(text)) {
      score += weight;
      signals.push(name);
    }
  }
  for (const b of behaviors) {
    score += BEHAVIOR_WEIGHTS[b];
    signals.push(b);
  }
  return { score, signals, likelyScam: score >= policy.scamThreshold };
}

let reported = false;
function check(): void {
  if (reported || !document.body) return;
  const report = scamReport();
  if (!report.likelyScam) return;
  reported = true;
  emit({ kind: "scam", action: "reported", reason: "scam-signals", url: location.href, detail: { score: report.score, signals: report.signals } });
}

function flag(b: Behavior): void {
  behaviors.add(b);
  check();
}

const clickedRecently = () => recentGesture(policy.activationMs) !== null;

/** Watch (never block) the browser APIs scam pages abuse to trap people. */
export function installScamSignals(win: Window & typeof globalThis): void {
  const apply = Reflect.apply;

  const keyboard = (win as unknown as { Keyboard?: { prototype: { lock?: (...a: unknown[]) => unknown } } }).Keyboard;
  const lock = keyboard?.prototype.lock;
  if (keyboard && lock) {
    keyboard.prototype.lock = function (this: unknown, ...args: unknown[]) {
      flag("keyboard-lock");
      return apply(lock, this, args);
    };
  }

  const N = win.Notification as (typeof Notification) | undefined;
  if (N?.requestPermission) {
    const request = N.requestPermission;
    N.requestPermission = function (this: unknown, ...args: unknown[]) {
      if (!clickedRecently()) flag("notification-prompt-without-click");
      return apply(request, this, args);
    } as typeof Notification.requestPermission;
  }

  const fs = win.Element.prototype.requestFullscreen;
  win.Element.prototype.requestFullscreen = function (this: Element, ...args: unknown[]) {
    if (!clickedRecently()) flag("fullscreen-without-click");
    return apply(fs, this, args);
  };

  // Many history entries in a burst = trying to make the back button useless.
  const push = win.History.prototype.pushState;
  let pushes: number[] = [];
  win.History.prototype.pushState = function (this: History, ...args: unknown[]) {
    const t = now();
    pushes = pushes.filter((p) => t - p < 2000);
    pushes.push(t);
    if (pushes.length > 10) flag("back-button-trap");
    return apply(push, this, args);
  };

  // alert()/confirm() in a loop to stop the user leaving.
  let dialogs: number[] = [];
  for (const name of ["alert", "confirm"] as const) {
    const native = win[name];
    win[name] = function (this: unknown, ...args: unknown[]) {
      const t = now();
      dialogs = dialogs.filter((d) => t - d < 10_000);
      dialogs.push(t);
      if (dialogs.length > 2) flag("dialog-loop");
      return apply(native, win, args);
    } as never;
  }

  onBody(() => {
    check();
    later(check, 1500); // scam text is often injected after load
  });
}
