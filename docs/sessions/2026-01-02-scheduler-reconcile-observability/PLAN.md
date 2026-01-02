# Plan – Scheduler Reconciliation + Observability

## Objective
Add persistent crawl schedules with reconciliation (catch-up/postpone) and a minimal Unified UI view + deterministic checks.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/crawler/scheduler/CrawlScheduler.js` (add reconciliation API)
- `checks/scheduler-reconcile-overdue.check.js` (deterministic behavior proof)
- `tests/crawler/scheduler/CrawlScheduler.test.js` (focused Jest regression)
- (Optional) `src/ui/server/unifiedApp/...` (surface reconciliation status)

## Risks & Mitigations
- Risk: creating a “second scheduler” by accident → mitigation: build on `crawl_schedules` + `CrawlScheduler` only.
- Risk: noisy telemetry/events → mitigation: summary + only emit per-domain events when schedules are mutated.
- Risk: reconciliation changes scheduling semantics unexpectedly → mitigation: deterministic check + targeted Jest assertions.

## Tests / Validation
- `node checks/scheduler-reconcile-overdue.check.js`
- `npm run test:by-path tests/crawler/scheduler/CrawlScheduler.test.js`
