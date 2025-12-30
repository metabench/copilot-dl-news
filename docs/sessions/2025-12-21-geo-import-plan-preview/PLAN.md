# Plan – Geo import plan preview UI

## Objective
Expose a dry-run plan view for geo ingestion (sources, URLs, algorithms, expected request counts) without running the import.

## Done When
- [x] Geo import exposes a dry-run plan endpoint (no import started).
- [x] Geo import UI renders plan preview with compact summary + drill-down.
- [x] Tests and validations are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/services/GeoImportStateManager.js
- src/ui/server/geoImportServer.js
- src/ui/controls/GeoImportDashboard.js
- src/ui/client/geoImport/index.js
- src/ui/server/geoImport/styles.css
- tests/unit/services/GeoImportPlanPreview.test.js
- docs/sessions/2025-12-21-geo-import-plan-preview/*

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- `npm run test:by-path tests/unit/services/GeoImportPlanPreview.test.js`
- `node scripts/build-ui-css.js`
- `npm run ui:geo-import:build`
