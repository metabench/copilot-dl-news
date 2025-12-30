# Working Notes – Electron UI: Place hubs + hub detection progress

- 2025-12-21 — Session created via CLI. Add incremental notes here.

## 2025-12-21 — SQL boundary guard sanity

- Re-ran `npm run sql:check-ui` after fixing Windows path normalization in `tools/dev/sql-boundary-check.js`.
- Result: violations reduced to **49**, and **no longer includes** `crawl-widget/node_modules/**` false positives.
- Remaining violations are the known legacy UI SQL hotspots (e.g. `src/ui/server/geoImportServer.js`, `src/ui/server/services/themeService.js`, `src/ui/server/services/metricsService.js`).
