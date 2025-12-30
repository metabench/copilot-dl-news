# Plan – Geo Import Progress Tree Telemetry

## Objective
Emit `crawl:progress-tree:*` telemetry during real geography ingestion so the widget Nested Progress panel shows real progress.

## Done When
- [x] Progress-tree telemetry is emitted by a real producer (not just lab fixtures).
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/crawler/gazetteer/StagedGazetteerCoordinator.js` (emit progress-tree events for the `wikidata-cities` ingestor)
- `src/crawler/gazetteer/__tests__/StagedGazetteerCoordinator.planner.test.js` (regression test for progress-tree emission)
- `src/db/sqlite/v1/schema.js` (fix `initGazetteerTables` etc when schema-definitions exports statement arrays)

## Risks & Mitigations
- **Risk**: telemetry spam from high-frequency progress updates.
	- **Mitigation**: throttle emission and cap number of child nodes in the progress tree.
- **Risk**: in-memory tests lack required schema tables.
	- **Mitigation**: ensure schema init helpers work with the current auto-generated schema-definitions exports.

## Tests / Validation
- `npm run test:by-path src/crawler/gazetteer/__tests__/StagedGazetteerCoordinator.planner.test.js`
