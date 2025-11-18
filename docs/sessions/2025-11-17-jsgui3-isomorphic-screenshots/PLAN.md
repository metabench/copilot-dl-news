# Plan: ui-screenshot-expansion
Objective: add reliable screenshot coverage for the primary jsgui3 server-rendered surfaces so design/state can be reviewed without booting the full stack.

Done when:
- a reusable screenshot runner exists for the Data Explorer server (URLs, Domains, Crawls, Errors, plus a detail view) with configurable output paths
- at least one additional helper targets another backend-rendered surface (e.g., URL detail or host detail) so future work can extend it
- scripts are exercised to emit fresh PNG/HTML artifacts under `screenshots/`
- docs/session notes capture how to run the new tooling

Change set:
- `scripts/ui/capture-data-explorer-screenshots.js`
- `scripts/ui/capture-domain-detail-screenshot.js` (or equivalent helper under `scripts/ui/`)
- `docs/sessions/2025-11-17-jsgui3-isomorphic-screenshots/WORKING_NOTES.md` + gallery pointers in existing screenshot directories if needed

Risks/assumptions:
- puppeteer is already available via repo deps; headless runs may fail if Chromium is missing
- Data Explorer routes require a real SQLite snapshot; assume `data/news.db` is present and compatible
- Server start/stop around Puppeteer must be robust to avoid orphaned listeners

Tests:
- run each new script locally (e.g., `node scripts/ui/capture-data-explorer-screenshots.js --routes urls,domains`)
- visually inspect generated PNG paths logged by the scripts

Docs to update:
- session notes under `docs/sessions/2025-11-17-jsgui3-isomorphic-screenshots/`
- add a usage snippet to `docs/ui/README.md` if space permits (optional follow-up)
