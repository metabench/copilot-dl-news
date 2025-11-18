# WORKING NOTES — 2025-11-17 ui-dashboard-routing

## 2025-11-17
- Session bootstrapped. Objective: move URL table to dedicated page, keep home dashboard lean, improve narrow layouts.
- Pending: run js-scan discovery on `src/ui/client/index.js`, server routes/templates to map dependencies before editing.
- Discovery 10:05 — `node tools/dev/js-scan.js --what-imports src/ui/client/index.js --json --ai-mode` → no direct importers (bundle entry only). Logged to `js-scan-client-index.json`.
- Discovery 10:07 — `node tools/dev/js-scan.js --what-imports src/ui/server/dataExplorerServer.js --json --ai-mode` → nine importer sites (checks, tests, scripts). Saved results as `js-scan-data-explorer-server.json` for routing risk tracking.
- Discovery 10:09 — `node tools/dev/js-scan.js --export-usage UrlListingTableControl --json --ai-mode` → confirms server renderer + client bundle rely on shared control (usage snapshot stored at `js-scan-url-listing-table-usage.json`).

## 2025-11-18
- Implemented responsive renderer updates in `src/ui/render-url-table.js` (dashboard grid, scrollable tables, conditional panel rendering) to prep for dedicated home/URLs split.
- Updated `src/ui/server/dataExplorerServer.js` to add `/` dashboard view with new nav entry, dashboard sections, and moved URL table logic under `/urls` only.
- Command 11:42 — `npm run ui:client-build` (success; bundle rebuilt after UI changes).
