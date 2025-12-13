# Plan – Crawler reliability improvements

## Objective
Improve crawler resilience and observability with focused, tested changes

## Done When
- [ ] `RetryCoordinator` correctly reads `Retry-After` across common header shapes (plain object + `Headers.get()` style).
- [ ] `RetryCoordinator` supports `options.network.retryableStatuses` (and top-level `retryableStatuses` remains supported).
- [ ] Focused Jest coverage exists for the above behaviors.
- [ ] All validations executed are recorded in `WORKING_NOTES.md`.
- [ ] Outcomes + any follow-ups are captured in `SESSION_SUMMARY.md` / `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/crawler/retry/RetryCoordinator.js`
- `src/__tests__/retry-coordinator.test.js` (new)
- `docs/sessions/2025-12-12-crawler-reliability/*` (plan/notes/results)

## Risks & Mitigations
- **Risk**: Existing callers pass non-standard `response.headers` shapes.
	- **Mitigation**: Add a small header accessor helper that supports both `Headers.get()` and plain objects; cover with tests.
- **Risk**: Behavior changes could increase retry volume.
	- **Mitigation**: Keep default retry set unchanged; only add configurability + correctness.

## Tests / Validation
- `npm run test:by-path src/__tests__/retry-coordinator.test.js`
- Optional regression spot-check: `npm run test:by-path src/__tests__/crawl.process.test.js`
