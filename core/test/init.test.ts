import { describe, expect, it } from "vitest";
import { VERSION, getState, init } from "../src/index.js";

describe("core init", () => {
  it("boots once and ignores later hosts", () => {
    expect(getState()).toBeUndefined();

    const first = init("test");
    expect(first).toMatchObject({ version: VERSION, host: "test" });

    const second = init("extension");
    expect(second).toBe(first);
    expect(getState()?.host).toBe("test");
  });

  it("state cannot be overwritten by page scripts", () => {
    const g = globalThis as Record<string, unknown>;
    expect(() => {
      g.__nullify = { host: "evil" };
    }).toThrow();
    expect(getState()?.host).toBe("test");
  });
});
