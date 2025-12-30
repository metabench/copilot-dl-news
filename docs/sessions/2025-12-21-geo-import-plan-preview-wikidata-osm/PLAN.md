# Plan – Geo Import Plan Preview: Wikidata + OSM

## Objective
Extend geo import dry-run plan preview to cover Wikidata and OSM with request estimates and endpoints.

## Done When
- [x] Plan preview supports `geonames`, `wikidata`, and `osm` sources.
- [x] UI lets user pick source + detail and renders non-GeoNames plans cleanly.
- [x] Tests and validations are captured in `WORKING_NOTES.md`.
- [x] Key deliverables are documented in `SESSION_SUMMARY.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/services/GeoImportStateManager.js
- src/ui/client/geoImport/index.js
- src/ui/server/geoImport/styles.css
- tests/unit/services/GeoImportPlanPreview.test.js

## Risks & Mitigations
- Request-count estimates can’t be exact without running SPARQL discovery.
	- Mitigation: show formulas + lower bounds and use DB-derived counts when available.
- OSM batching depends on grouping/fallback behavior.
	- Mitigation: show expected batch estimate + worst-case upper bound.

## Tests / Validation
- `npm run test:by-path tests/unit/services/GeoImportPlanPreview.test.js`
- `npm run ui:geo-import:build`
- `npm run ui:client-build`
