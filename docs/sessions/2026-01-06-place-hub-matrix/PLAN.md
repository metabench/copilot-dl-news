# Plan – Place hub 5-state matrix data flow

## Objective
Trace hub guessing outputs and ensure 5-state matrix has required mappings/evidence

## Done When
- [ ] Data flow for 5-state matrix (place_hub_candidates → place_page_mappings) is traced and documented.
- [ ] Missing persistence for 404/absent outcomes is implemented with safeguards.
- [ ] Matrix UI shows verified-absent state when hub guessing records 404s.
- [ ] Tests/validation runs recorded in `WORKING_NOTES.md`, summary in `SESSION_SUMMARY.md`.

## Change Set (initial sketch)
- `src/orchestration/DomainProcessor.js` (record absent mappings on 404 outcomes)
- `src/orchestration/utils/analysisUtils.js` (include place IDs from analyzers)
- `src/orchestration/ActiveProbeProcessor.js` (carry place IDs into targets)
- `src/db/sqlite/v1/queries/placePageMappings.js` (helper to upsert absent safely)
- `src/tools/__tests__/guess-place-hubs.test.js` (regression test for 404 → mapping)
- `docs/sessions/2026-01-06-place-hub-matrix/*` (notes + summary)

## Risks & Mitigations
- Risk: Overwriting verified-present mappings with absent records; mitigate with guard in query helper.
- Risk: Missing place_id in analyzer output; mitigate by propagating IDs from gazetteer queries.
- Risk: Test flakiness on temp SQLite cleanup; follow existing patterns and close DB handles.

## Tests / Validation
- `npm run test:by-path src/tools/__tests__/guess-place-hubs.test.js`
- (Optional UI sanity) `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js`
