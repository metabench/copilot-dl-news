# Working Notes – Crawl Widget Telemetry UI Neatness

- 2025-12-21 — Session created via CLI. Add incremental notes here.

- 2025-12-21 03:37 — ## Changes
- Added a new LIVE TELEMETRY premium panel: "Fetch / Cache" (counts + recent lines).
- Improved telemetry feed rendering for fetch/cache events with a compact headline (OK/RETRY/ERROR/CACHE + status/ms + host/path).
- Fixed telemetry feed layout by making message+tags a single grid column and disambiguating `.cw-tel__topic` container vs `.cw-tel__topic-label`.

## Files touched
- crawl-widget/ui/telemetry/telemetryPanels.js
- crawl-widget/ui/telemetry/telemetryRenderers.js
- crawl-widget/styles.css

## Validation
- node --check crawl-widget/ui/telemetry/telemetryRenderers.js
- node --check crawl-widget/ui/telemetry/telemetryPanels.js
- node checks/crawl-telemetry-stdout-format.check.js
- npm run sql:check-ui
