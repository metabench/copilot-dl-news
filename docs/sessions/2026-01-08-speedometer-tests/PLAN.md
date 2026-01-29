# Plan – Speedometer dashboard automated checks

## Objective
Add automated UI verification for distributed crawl speedometer

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- labs/distributed-crawl/speedometer-app.js (export/guard for testability)
- labs/distributed-crawl/checks/speedometer-app.check.js (HTML smoke check)
- docs/sessions/2026-01-08-speedometer-tests/WORKING_NOTES.md (evidence)

## Risks & Mitigations
- Electron import may fail when running checks headless — guard the import and short-circuit when not running the app.
- HTML changes could drift without coverage — keep the check focused on required IDs/classes and CSS link presence.

## Tests / Validation
- node labs/distributed-crawl/checks/speedometer-app.check.js
