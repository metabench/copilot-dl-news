# Plan – Migrate UI SQL to DB layer + Telemetry Auto Feed

## Objective
Move all non-deprecated UI SQL into src/db, make sql:check-ui pass, and improve telemetry envelope + widget auto-display.

## Done When
- [x] `npm run sql:check-ui` passes (0 violations).
- [x] UI services (`metricsService`, `themeService`) contain no direct sqlite driver usage.
- [x] `geoImportServer.js` uses DB-layer introspection helpers (no inline SQL).
- [x] Widget can display a generic live telemetry feed (auto-representation).
- [x] Focused tests/checks are green and captured in `WORKING_NOTES.md`.

## Change Set (initial sketch)
- src/db/sqlite/tools/databaseIntrospection.js (pre-existing in this workstream)
- src/db/sqlite/v1/queries/ui/uiCachedMetrics.js (pre-existing in this workstream)
- src/db/sqlite/v1/queries/ui/uiThemes.js (pre-existing in this workstream)
- src/ui/server/geoImportServer.js
- src/ui/server/services/metricsService.js
- src/ui/server/services/themeService.js
- src/crawler/telemetry/CrawlTelemetrySchema.js
- crawl-widget/ui/controls/ToolsPanelControl.js
- tests/ui/server/services/metricsService.test.js

## Risks & Mitigations
- Risk: subtle behavior drift when moving SQL into DB-layer helpers.
	- Mitigation: keep service APIs stable; add focused roundtrip test for cached metrics.
- Risk: widget spam if it renders every telemetry event.
	- Mitigation: skip the noisiest type (`crawl:progress`) in the generic feed.

## Tests / Validation
- `npm run sql:check-ui`
- `npm run test:by-path tests/ui/server/services/metricsService.test.js`
- `node crawl-widget/checks/crawlWidget.check.js`
- `node crawl-widget/checks/telemetrySse.check.js`
