# Plan – Triage Next System Hotspots

## Objective
Identify next riskiest subsystems and add small deterministic checks + targeted Jest regressions as proof.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/api/routes/background-tasks.js
- checks/background-tasks.rate-limit.check.js
- src/ui/server/testStudio/TestResultService.js (no changes; validated via tests)
- checks/test-studio.refresh-from-disk.check.js
- tests/ui/testStudio/TestResultService.test.js

## Risks & Mitigations
- Risk: 429 RateLimitError payload drifts across endpoints.
	- Mitigation: centralize payload creation + add a deterministic check proving contract.
- Risk: Test Studio disk ingestion becomes flaky (invalid JSON, missing fields, repeated scans).
	- Mitigation: add refreshFromDisk test coverage + a deterministic check using a temp results dir.

## Tests / Validation
- `node checks/background-tasks.rate-limit.check.js`
- `node checks/test-studio.refresh-from-disk.check.js`
- `npm run test:by-path tests/server/api/background-tasks.test.js`
- `npm run test:by-path tests/ui/testStudio/TestResultService.test.js`
