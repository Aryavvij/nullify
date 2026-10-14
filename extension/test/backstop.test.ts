import { describe, expect, it } from "vitest";
import { ALLOW_GRACE_MS, BLOCK_MEMORY_MS, shouldCloseNewTab } from "../src/backstop.js";

const NOW = 1_000_000;

describe("tab backstop", () => {
  it("closes a tab to a site the engine just refused", () => {
    const signals = { blocked: [{ site: "ads.example", time: NOW - 1000 }], lastAllowedPopup: 0 };
    expect(shouldCloseNewTab(signals, "https://cdn.ads.example/landing", NOW)).toBe(true);
  });

  it("leaves tabs to other sites alone", () => {
    const signals = { blocked: [{ site: "ads.example", time: NOW - 1000 }], lastAllowedPopup: 0 };
    expect(shouldCloseNewTab(signals, "https://docs.example.org/", NOW)).toBe(false);
  });

  it("forgets a block after a few seconds", () => {
    const signals = { blocked: [{ site: "ads.example", time: NOW - BLOCK_MEMORY_MS - 1 }], lastAllowedPopup: 0 };
    expect(shouldCloseNewTab(signals, "https://ads.example/", NOW)).toBe(false);
  });

  it("never closes anything right after the engine approved a popup (a real click on a real link)", () => {
    const signals = { blocked: [{ site: "ads.example", time: NOW - 500 }], lastAllowedPopup: NOW - ALLOW_GRACE_MS + 1 };
    expect(shouldCloseNewTab(signals, "https://ads.example/", NOW)).toBe(false);
  });

  it("can't judge blank tabs, so leaves them", () => {
    const signals = { blocked: [{ site: "ads.example", time: NOW - 500 }], lastAllowedPopup: 0 };
    expect(shouldCloseNewTab(signals, "about:blank", NOW)).toBe(false);
  });
});
