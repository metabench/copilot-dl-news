# Plan – Phase 2 SequenceRunner unification

## Objective
Integrate unified sequence runner and finalize crawler abstraction integration

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
 - `src/crawler/sequence/SequenceRunner.js` (new unified runner)
 - `src/orchestration/SequenceRunner.js` (re-export)
 - `src/crawler/operations/SequenceRunner.js` (point to unified)
 - `docs/CRAWLER_ABSTRACTION_REFACTORING_PLAN.md` (status update)

## Risks & Mitigations
 - Jest/Babel config could fail ESM deps → already fixed via transformIgnorePatterns
 - Pipeline tests might break → run crawler pipeline suites to validate

## Tests / Validation
 - `npm run test:by-path tests/crawler/pipeline/runPipeline.test.js tests/crawler/pipeline/pageProcessingPipeline.test.js tests/crawler/pipeline/buildSteps.test.js`
