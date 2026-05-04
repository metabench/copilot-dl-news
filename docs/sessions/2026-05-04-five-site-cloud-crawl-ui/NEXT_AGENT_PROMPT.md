# Next Agent Prompt

Continue the `docs/sessions/2026-05-04-five-site-cloud-crawl-ui/` session. Read `PLAN.md`, `WORKING_NOTES.md`, `SESSION_SUMMARY.md`, `VALIDATION_MATRIX.md`, and `DECISIONS.md` first.

Objective: improve the compact `/?app=cloud-crawl` panel by adding an operator-selectable time scope and mobile screenshot validation without replacing existing crawl layouts.

Constraints:
- Use jsgui3 controls; preserve `/crawl-status` and existing unified-shell layouts.
- Windows + PowerShell + Node.js only; no Python.
- Use local DB evidence from `/api/cloud-crawl/status` as the UI proof source.
- Keep changes narrow and update the session notes with exact validation output.

Files likely involved:
- `src/ui/controls/CloudCrawlPanelControl.js`
- `src/ui/server/unifiedApp/activators.js`
- `src/ui/server/unifiedApp/server.js`
- `scripts/ui/capture-unified-crawl-display.js`
- `src/ui/controls/checks/CloudCrawlPanelControl.check.js`
- `docs/sessions/2026-05-04-five-site-cloud-crawl-ui/WORKING_NOTES.md`
- `docs/sessions/2026-05-04-five-site-cloud-crawl-ui/VALIDATION_MATRIX.md`

Done criteria:
- The panel can switch between at least `today`, `last hour`, and `all time` status scopes.
- Screenshot capture includes desktop and mobile evidence for `cloud-crawl` with no horizontal overflow.
- `CloudCrawlPanelControl.check.js`, `shell.check.js`, `unified.server.check.js`, and the screenshot script pass.
- `WORKING_NOTES.md` and `VALIDATION_MATRIX.md` include exact commands and results.

Start by checking the current screenshot analysis at `docs/sessions/2026-05-04-five-site-cloud-crawl-ui/screenshots/analysis.json`, then implement the smallest UI slice and validate immediately.