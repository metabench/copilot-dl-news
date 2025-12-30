# Working Notes – Geo Import Plan Preview: Wikidata + OSM

- 2025-12-21 — Session created via CLI.

## Goal
Extend the existing GeoNames “Plan preview” dry-run endpoint/UI to also cover Wikidata and OSM, including endpoints + request-count estimates.

## Key implementation notes
- `GeoImportStateManager.getPlan()` now supports `geonames`, `wikidata`, and `osm`.
- Wikidata plan:
	- Endpoints: `https://query.wikidata.org/sparql` + `https://www.wikidata.org/w/api.php?action=wbgetentities`
	- Request estimate:
		- Minimum: 1 (SPARQL discovery)
		- Plus entity batches: `ceil(entitiesToFetch / 50)` (Wikidata API limit)
		- When DB is available, uses existing `places` + `place_external_ids(source='wikidata')` counts and a 7-day freshness window to estimate `entitiesToFetch`.
- OSM plan:
	- Endpoint: `https://overpass-api.de/api/interpreter`
	- Uses DB-only counts for candidates needing boundaries (places with OSM identifiers but missing bbox/osm_tags).
	- Request estimate:
		- Expected: `ceil(candidatesToFetch / 5)` (default batch size)
		- Worst-case: one request per candidate if batch fallback triggers

## Commands run (evidence)
- `npm run test:by-path tests/unit/services/GeoImportPlanPreview.test.js`
- `npm run ui:geo-import:build`
- `npm run ui:client-build`
