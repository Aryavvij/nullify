# @nullifyads/core

The detection engine behind [Nullify](https://github.com/Aryavvij/nullify). It runs inside a web page and stops click hijacks:
- pop-ups and redirects that a click didn't ask for;
- invisible layers that steal clicks;
- invisible controls and frames over visible ones (agent mode);
- hidden text aimed at AI agents.

You probably want one of the packages built on it:
- [`@nullifyads/agent-guard`](https://www.npmjs.com/package/@nullifyads/agent-guard): protect a Playwright-driven AI agent.
- [`@nullifyads/mcp`](https://www.npmjs.com/package/@nullifyads/mcp): an MCP server with a protected browser.
- The Chrome extension in the [repository](https://github.com/Aryavvij/nullify), for people.

The package ships an ES module (`@nullifyads/core`) and a self-contained browser bundle (`@nullifyads/core/iife`) meant to be injected into pages before their own scripts run.

MIT License.
