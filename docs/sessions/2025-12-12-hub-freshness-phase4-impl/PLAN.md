# Plan – Phase 4 Hub Freshness Control (Fetch Policy)

## Objective
Confirm Phase 4 implementation is complete, then finish/close Task 4.9 (“focused tests + CLI smoke”) with clear, reproducible evidence.

## Done When
- [ ] Policy propagation path is documented (enqueue → queue → worker → fetch).
- [ ] Focused tests for policy plumbing are green and listed in WORKING_NOTES.
- [ ] One CLI smoke command is recorded (no network fetch required).
- [ ] Session summary states what’s done vs what’s intentionally deferred.

## Change Set (initial sketch)
- Session docs:
	- `docs/sessions/2025-12-12-hub-freshness-phase4-impl/PLAN.md`
	- `docs/sessions/2025-12-12-hub-freshness-phase4-impl/WORKING_NOTES.md`
	- `docs/sessions/2025-12-12-hub-freshness-phase4-impl/SESSION_SUMMARY.md`
- If tracker needs sync:
	- `docs/CRAWL_REFACTORING_TASKS.md` (update Task 4.9 status/notes)
- Only if gaps are found:
	- Targeted Jest tests under `src/crawler/__tests__/` and/or `tests/crawler/unit/`

## Risks & Mitigations
- **Risk:** confusing “policy” responsibilities across layers (enqueue meta vs runtime context).
	- **Mitigation:** document the contract for each layer (what reads/writes which fields) and point to the exact functions.
- **Risk:** CLI smoke commands accidentally hit the network.
	- **Mitigation:** use `crawl.js availability` only (purely enumerative).
- **Risk:** background file watchers (ConfigManager) causing test flakiness.
	- **Mitigation:** rely on existing Jest-safe paths (the production code already guards watchers with `process.env.JEST_WORKER_ID`).

## Tests / Validation
- Focused tests (Jest):
	- `src/crawler/__tests__/FetchPipeline.test.js`
	- `src/crawler/__tests__/queueManager.basic.test.js`
	- `src/crawler/__tests__/queue.behaviour.test.js`
	- `tests/crawler/unit/services/HubFreshnessController.test.js`
- CLI smoke (no network):
	- `node crawl.js availability --output-verbosity terse`
