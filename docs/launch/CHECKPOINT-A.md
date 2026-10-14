# Checkpoint A: does anyone want this?

The gate before Phase 5 (crawler and observatory). Two weeks after release, decide from evidence, not hope.

## Who to reach
The people who'd install `@nullifyads/agent-guard` are developers running browser agents in production or close to it:
- the **browser-use**, **Stagehand** and **Playwright MCP** communities (GitHub Discussions and Discords);
- **r/LocalLLaMA** and **r/AI_Agents** (agent builders), and **r/webdev** for the extension angle;
- **Hacker News** (Show HN), with the benchmark as the headline;
- people building QA or automation agents at companies: ask your network for 5–10 intros.

Post drafts are in [posts.md](posts.md). Post the benchmark and the demo, not adjectives.

## What to measure (write the numbers down each week)
| Signal | Where |
|---|---|
| GitHub stars, issues, PRs | repository insights |
| npm weekly downloads (`@nullifyads/agent-guard`, `@nullifyads/mcp`) | npm package pages |
| PyPI downloads (`nullify-guard`) | pypistats.org |
| Extension installs and ratings | Chrome Web Store dashboard |
| Replies that say "I hit this" or "can it support X" | posts, DMs |
| Conversations held, of 5–10 | your notes |

## Interview guide (20 minutes, with someone who runs agents)
1. What do your agents do in a browser, and how do they click: coordinates, selectors, or raw CDP?
2. Has an agent ever clicked something it shouldn't have, or ended up on a page it shouldn't be on? What happened?
3. How do you deal with pop-ups, overlays and redirects today?
4. How do you keep untrusted page text from steering the model?
5. *(Show the demo.)* Would you add this to your agent? What would stop you?
6. What would it need to support first (framework, language, browser)?
7. Would your company pay for this as part of a security review or compliance check? Who decides?

Listen for specific stories. "Sounds cool" is not a signal; "last month our agent bought the wrong thing because of a pop-up" is.

## Decision rule
- **Go to Phase 5** if, by the end of week 2, **at least three** of these are true: 3+ people say they'd use it or already do; 50+ GitHub stars; 100+ weekly npm downloads; an unprompted feature request or issue from an agent team; a company asks about using it.
- **Keep it a research project** otherwise. Write the paper from NullBench, keep the extension maintained, and stop there. That's a good outcome too.

Phase 5 itself (the crawler) only ever runs in a throwaway container or VM, never on a personal machine (see PLAN.md).
