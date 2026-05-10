# Working Notes: Playwright Control Centre Visual QA

## 2026-05-04 Kickoff

- Objective: use the newly enabled Playwright visual tooling to inspect the unified control centre and crawl-related apps.
- Constraints: only simple, low-risk fixes; crawl testing limited to 5 sites x 5 pages.
- Guidance read: UI Screenshot Feedback instructions, `ui-screenshot-feedback` skill, `docs/workflows/ui-inspection-workflow.md`, `docs/workflows/ui-screenshot-feedback-loop.md`, and `tools/crawl/AGENT.md`.
- Pending screenshot comments: none found via `**/SCREENSHOT_COMMENTS.md` or `.agent/pending_comments.md`.

## 2026-05-04 Visual QA Pass

- Started unified app on `http://localhost:3097` after `--check` passed.
- Initial route screenshots covered Home, Cloud Crawl, Downloads, Crawl Status, Screenshot Review, and Search Explorer on desktop plus Cloud Crawl, Downloads, and Screenshot Review on mobile.
- Direct `view_image` review found the important issue missed by numeric overflow checks: the fixed 260px sidebar made 390px mobile pages unusably narrow.
- Direct `view_image` review also found Home dashboard rendered the literal `${activityRows}` placeholder.
- Applied low-risk fixes:
	- mobile sidebar collapses to a 72px icon rail at `max-width: 700px`.
	- Home dashboard uses the real `activityRows` value and a responsive `.home-crawl-overview-grid` class.
- Validation:
	- `node src/ui/server/unifiedApp/checks/shell.check.js` passed, 48/48.
	- `node src/ui/server/unifiedApp/checks/unified.server.check.js` passed.
- Ran a bounded 5-site x 5-page remote crawl command. The tool wrapper timed out after observing partial progress, but subsequent UI status and standard capture showed `25 / 25` downloaded and `0` errors.
- Standard capture command:
	- `C:\nvm4w\nodejs\node.exe scripts/ui/capture-unified-crawl-display.js --base-url http://localhost:3097 --output docs/sessions/2026-05-04-playwright-control-centre-visual-qa/screenshots/standard-after-5x5 --save-screenshots --save-dom-snapshots`
	- Result: `analysis.json` has `ok=true`; eight screenshots and eight DOM snapshots were written.
- Playwright MCP note: tool names were discoverable, but direct callable MCP namespaces were not exposed in this chat runtime. Browser automation continued via Puppeteer plus direct `view_image` review.
- Wider visual pass found the embedded Crawl Status route was still awkward on mobile because the iframe content had desktop header/actions/table assumptions.
- Applied a CSS-only Crawl Status fix: mobile header stacks, links become a two-column grid, form rows collapse to one column, actions are two-up, and the jobs table scrolls horizontally inside its own box.
- Validation after Crawl Status fix:
	- `node src/ui/server/crawlStatus/checks/crawlStatusPage.remoteObservable.check.js` passed.
	- `node src/ui/server/unifiedApp/checks/shell.check.js` passed.
	- `node src/ui/server/unifiedApp/checks/unified.server.check.js` passed.
	- Targeted screenshots written to `screenshots/crawl-status-mobile-fix/` and direct `view_image` review confirmed improved mobile presentation.

