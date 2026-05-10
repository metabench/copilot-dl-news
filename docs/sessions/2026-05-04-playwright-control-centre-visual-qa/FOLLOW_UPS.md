# Follow-Ups: Playwright Control Centre Visual QA

1. Add a repeatable mobile-width metric to `scripts/ui/lib/screenshotCapture.js` that flags when `.shell-content` is too narrow relative to the viewport.
2. Make the Downloads panel title and statistic stack denser on mobile; it is usable now, but still large.
3. Consider a card/list alternative for Crawl Status jobs on mobile if operators need to manage active crawls from phones frequently.
4. Expose a Control Center launch action for the existing 5x5 Cloud Crawl command only if operator-triggered remote crawls should be supported from the UI.
5. Investigate why the enabled Playwright MCP tools are not directly routed into this chat runtime despite being listed in the agent file.
