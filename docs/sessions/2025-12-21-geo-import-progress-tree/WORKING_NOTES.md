# Working Notes – Geo Import Progress Tree Telemetry

- 2025-12-21 — Session created via CLI.

## Producer wiring

- Chosen first “real producer”: `wikidata-cities` ingestion (countries → cities), because it already emits structured progress with `phase: discovery|processing|complete`.
- Producer location: `StagedGazetteerCoordinator` (central orchestration hook) rather than wiring each ingestor.
- Emission: coordinator builds a canonical progress tree and emits `crawl:progress-tree:updated|completed` via `telemetry.events.emitEvent(createProgressTreeEvent(...))`.
- Guardrails:
	- Throttles processing updates (fast loops can coalesce to just `updated` + `completed`).
	- Caps child nodes to avoid huge DOM payloads.

## Schema init fix (tests)

- `initGazetteerTables()` was a no-op under the current schema-definitions export format (`TABLE_STATEMENTS`), leaving `:memory:` DBs without `gazetteer_crawl_state`.
- Updated `src/db/sqlite/v1/schema.js` so init helpers apply a filtered subset of statement-mode schema definitions.

## Validation

- `npm run test:by-path src/crawler/gazetteer/__tests__/StagedGazetteerCoordinator.planner.test.js` (PASS)
