# Working Notes – Migrate UI SQL to DB layer + Telemetry Auto Feed

## Key validations (executed)
- `npm run sql:check-ui` → ✅ pass
- `npm run test:by-path tests/ui/server/services/metricsService.test.js` → ✅ pass
- `node crawl-widget/checks/crawlWidget.check.js` → ✅ pass
- `node crawl-widget/checks/telemetrySse.check.js` → ✅ pass

## Notes
- `src/ui/server/geoImportServer.js` now relies on `src/db/sqlite/tools/databaseIntrospection.js` for db stats and uses `createGazetteerDatabase()` for opening DBs.
- `src/ui/server/services/metricsService.js` now uses `src/db/sqlite/v1/queries/ui/uiCachedMetrics.js` (table + select + upsert).
- `src/ui/server/services/themeService.js` now uses `src/db/sqlite/v1/queries/ui/uiThemes.js` (table + CRUD + defaults + seeding).
- Telemetry envelope now includes `schemaVersion`, `topic`, `tags` to support generic UI rendering.

## Widget telemetry UI (auto-representation)
- Added a small renderer registry: `crawl-widget/ui/telemetry/telemetryRenderers.js`
	- Default fallback renders any unknown future events by topic with sensible severity styling.
	- Topic-specific renderer currently implemented for `place-hubs` (shows richer `data` blocks for key events).
- Tools panel now renders telemetry grouped by topic with:
	- Topic filter dropdown
	- Optional “Show progress” toggle
	- Clear buffer
	- Expandable per-topic sections (`<details>`)

## Premium telemetry panels (budgets/goals/workers)
- Added a "premium panels" plugin layer: `crawl-widget/ui/telemetry/telemetryPanels.js`
- Tools panel renders compact cards above the generic feed, each driven by `match(evt)` + `reduce(state, evt)` + `render(state, ctx)`
- Default premium panels added: Budgets (`crawl:budget:*`), Goals (`crawl:goal:*`), Workers (`crawl:worker:*`)
- Also fixed throttling panel to match the schema topic `rate` (from `crawl:rate:limited`)

- 2025-12-21 — Session created via CLI. Add incremental notes here.
