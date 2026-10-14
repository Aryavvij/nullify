import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium, type Browser } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PORT = 4174; // the Playwright suite uses 4173
const BASE = `http://news.test:${PORT}`;
const HOST_RULES = "--host-resolver-rules=MAP *.test 127.0.0.1";
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

interface Result {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

let fixtures: ChildProcess;
let client: Client;
let layout: Browser;

const call = (name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }) as Promise<Result>;
const textOf = (r: Result) => r.content.map((c) => c.text ?? "").join("\n");

/** Where an element sits in the MCP browser's 1280x720 viewport, measured in a separate browser with the same viewport. */
async function centerOf(path: string, selector: string): Promise<{ x: number; y: number }> {
  const page = await layout.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(BASE + path);
  const box = await page.locator(selector).boundingBox();
  await page.close();
  if (!box) throw new Error(`no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

beforeAll(async () => {
  fixtures = spawn("node", ["bench/server.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  for (let i = 0; i < 50; i++) {
    if (await fetch(`http://127.0.0.1:${PORT}/hello.html`).then((r) => r.ok, () => false)) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  client = new Client({ name: "nullify-test", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [`${ROOT}mcp/dist/index.js`],
      env: { ...(process.env as Record<string, string>), NULLIFY_CHROMIUM_ARGS: HOST_RULES },
    }),
  );
  layout = await chromium.launch({ args: [HOST_RULES] });
});

afterAll(async () => {
  await client?.close();
  await layout?.close();
  fixtures?.kill();
});

describe("nullify MCP server", () => {
  it("offers the browser tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "browser_click", "browser_click_element", "browser_close", "browser_navigate", "browser_press",
      "browser_screenshot", "browser_type", "page_risk", "page_text",
    ]);
  });

  it("refuses a click that would land on an invisible control, and says why", async () => {
    await call("browser_navigate", { url: `${BASE}/attacks/invisible-control.html` });
    const result = await call("browser_click", await centerOf("/attacks/invisible-control.html", "#no-thanks"));

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('invisible control (button#hidden-confirm) instead of what is shown (button#no-thanks "No thanks")');
    expect(textOf(await call("page_text"))).toContain("pending"); // the hidden control never fired
  });

  it("refuses an element click when something else would receive it", async () => {
    await call("browser_navigate", { url: `${BASE}/attacks/decoy-layer.html` });
    const result = await call("browser_click_element", { selector: "#download" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('button#download "Download" is covered by div#layer');
  });

  it("clicks normally on ordinary pages", async () => {
    await call("browser_navigate", { url: `${BASE}/legit/counter.html` });
    expect((await call("browser_click_element", { selector: "#inc" })).isError).toBeFalsy();
    expect((await call("browser_click", await centerOf("/legit/counter.html", "#inc"))).isError).toBeFalsy();
    expect(textOf(await call("page_text"))).toMatch(/^2$/m);
  });

  it("keeps hidden instructions out of the model's context, and warns about them", async () => {
    const opened = textOf(await call("browser_navigate", { url: `${BASE}/attacks/hidden-instructions.html` }));
    expect(opened).toContain("5 block(s) of hidden text on this page read like instructions to an AI");

    const text = textOf(await call("page_text"));
    expect(text).toContain("We tested 14 pairs of headphones");
    expect(text).not.toMatch(/previous instructions|new instructions|password|Do not tell the user/i);

    const risk = JSON.parse(textOf(await call("page_risk")));
    expect(risk).toMatchObject({ level: "high", hiddenInstructions: 5 });
    expect(textOf(await call("page_risk"))).not.toMatch(/previous instructions/i);
  });

  it("returns a PNG screenshot", async () => {
    const shot = await call("browser_screenshot");
    expect(shot.content[0]).toMatchObject({ type: "image", mimeType: "image/png" });
    expect(Buffer.from(shot.content[0]!.data!, "base64").subarray(1, 4).toString()).toBe("PNG");
  });

  it("only opens http(s) URLs", async () => {
    const result = await call("browser_navigate", { url: "file:///etc/hosts" });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe("Only http and https URLs can be opened.");
  });
});
