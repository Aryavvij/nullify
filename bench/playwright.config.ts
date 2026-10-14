import { defineConfig } from "@playwright/test";
import { BASE, HOST_RULES, PORT } from "./tests/env.js";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: BASE,
    launchOptions: { args: [HOST_RULES] },
  },
  webServer: {
    command: "node server.mjs",
    url: `http://127.0.0.1:${PORT}/hello.html`,
    reuseExistingServer: true,
    env: { PORT: String(PORT) },
  },
});
