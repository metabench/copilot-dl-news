# UI Data Explorer (Active)

The UI stack under `src/ui` now powers the crawler "Data Explorer" views (URLs, domains, crawls, and errors). The current implementation replaces the deprecated UI with a lean server-rendered surface plus a small hydration bundle for interactive controls.

## Key Components

- `src/ui/server/dataExplorerServer.js`  Express server that serves `/urls`, `/domains`, `/crawls`, `/errors`, and `/api/urls` with diagnostics headers (`x-copilot-request-id`, `x-copilot-duration-ms`). Start it via `npm run ui:data-explorer`.
- `src/ui/render-url-table.js`  Shared renderer used by the server and standalone CLI (`node src/ui/render-url-table.js --output urls.html`). Responsible for the header, home cards, table shell, and pagination controls.
- `src/ui/controls/`  jsgui3 controls for tables, pagers, toggles, and workspace panels. Each control now has a corresponding lightweight check script under `src/ui/controls/checks/`.
- `src/ui/client/index.js`  Browser bundle entry. Registers UrlListingTable, UrlFilterToggle, and PagerButton with `jsgui3-client`, installs the binding plugin, and falls back to manual activation if hydration misses.
- `public/assets/ui-client.js`  Built artifact created by `npm run ui:client-build` (esbuild). Always rebuild after touching anything under `src/ui/client`.

## Running & Testing

```bash
# Serve the data explorer (defaults to data/news.db)
npm run ui:data-explorer

# Build the browser bundle after client/control updates
npm run ui:client-build

# Focused Jest / Puppeteer coverage for the filter toggle
npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js
```

### UI E2E Testing Workflow

1. **Prep the bundle + fixtures**
	- Run `npm run ui:client-build` whenever the client, controls, or binding plugin changes.
	- The Puppeteer suite seeds an in-memory SQLite DB; refresh `tests/ui/e2e/helpers` if the schema shifts (URLs, fetches, diagnostics tables must stay in sync with `src/ui/db`).
2. **Run the suite**
	- Fastest entry point: `npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js`.
	- To batch additional scenarios later, wire them into `node tests/run-tests.js e2e-quick` so CI can smoke everything in one go.
3. **Wait on diagnostics events, not arbitrary timeouts**
	- The toggle emits `copilot:urlFilterToggle` via `emitUrlFilterDebug`. In Puppeteer you can `await page.waitForEvent('copilot:urlFilterToggle', { predicate: ev => ev.detail.status === 'success' })` to guarantee the request finished before asserting DOM state.
	- Capture the event payload (meta row counts, pagination) rather than scraping the DOM when possible—this keeps tests fast and deterministic.
4. **Troubleshoot common failures**
	- `TimeoutError` usually means the client bundle didn’t hydrate; ensure `npm run ui:client-build` ran and that the Puppeteer test sets `headless: 'new'`.
	- If Chromium is missing, run any Puppeteer script once (the dependency downloads automatically) or set `PUPPETEER_SKIP_DOWNLOAD=0` before `npm install`.
5. **Log everything in session docs**
	- UI Singularity mode requires a dedicated `docs/sessions/<date>-ui-*/` folder. Record the exact commands + exit codes so future agents can replay the run.

Upcoming scenarios live in `docs/sessions/2025-11-20-ui-e2e-testing/FOLLOW_UPS.md` (pager state, home cards, shared fixtures). Tackle them once the toggle test stabilizes under the event-driven wait.

Additional server-side diagnostics live in `tests/ui/server/dataExplorerServer.test.js` and `tests/ui/server/dataExplorerServer.production.test.js`.

## Control Checks

Use the new check scripts before/after styling changes to preview rendered markup without running the full server:

- `node src/ui/controls/checks/UrlListingTable.check.js`
- `node src/ui/controls/checks/DomainSummaryTable.check.js`
- `node src/ui/controls/checks/CrawlJobsTable.check.js`
- `node src/ui/controls/checks/PagerButton.check.js`

Each script emits HTML and basic assertions so regressions are obvious in diff tooling.

## Diagnostics & Telemetry

- `/api/urls` responses include `diagnostics` payloads that the `UrlFilterToggleControl` logs via the `copilot:urlFilterToggle` CustomEvent. See `src/ui/controls/urlFilterDiagnostics.js`.
- HTML responses set `x-copilot-request-id`/`x-copilot-api` headers for observability; thread the IDs through client logs when possible.
- Home cards on `/urls` surface cached metric freshness, top host hints, crawl status, and last error context via the new hint list rendering.

## Session Protocol

All UI work is documented under `docs/sessions/` (see `docs/sessions/SESSIONS_HUB.md`). Before editing controls or templates:

1. Create a dated `docs/sessions/<date>-ui-<slug>/` folder with PLAN/WORKING_NOTES.
2. Run `node tools/dev/js-scan.js --what-imports <file> --json --ai-mode` to record dependencies.
3. Log commands/tests in `WORKING_NOTES.md` and summarize outcomes in `SESSION_SUMMARY.md`.

This workflow keeps the UI surface debuggable and repeatable as new controls arrive.
