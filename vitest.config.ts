import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["core/test/**/*.test.ts", "agent-guard/test/**/*.test.ts", "mcp/test/**/*.test.ts", "extension/test/**/*.test.ts"],
    // The MCP test drives a real browser through a spawned server.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
