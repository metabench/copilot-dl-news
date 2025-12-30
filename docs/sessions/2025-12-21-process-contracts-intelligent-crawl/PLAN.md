# Plan – Process Contracts for Intelligent Crawl

## Objective
Make intelligent crawl + place hub prioritisation predictable via contracts + checks

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/crawler/__tests__/IntelligentPlanRunner.placeHubVerification.contract.test.js
- src/crawler/__tests__/QueueManager.priorityOverride.contract.test.js

## Risks & Mitigations
- Risk: “priority” semantics are easy to misread (QueueManager uses negative priority for higher urgency).
	- Mitigation: contract test asserts observed dequeue ordering in QueueManager.
- Risk: orchestration order drifts without changing behavior (silent regressions).
	- Mitigation: contract asserts enqueue ordering across planning stages.

## Tests / Validation
- npm run test:by-path src/crawler/__tests__/IntelligentPlanRunner.placeHubVerification.contract.test.js
- npm run test:by-path src/crawler/__tests__/QueueManager.priorityOverride.contract.test.js
