# Plan – UrlDecision orchestrator wiring

## Objective
Finish orchestrator integration and run focused queue/fetch tests

## Done When
- [ ] QueueManager + FetchPipeline call a single UrlDecisionOrchestrator path (no double decisions).
- [ ] UrlEligibilityService and NewsCrawler bridge legacy decisions into orchestrator without divergence.
- [ ] Focused crawler decision/queue tests run and results captured in `WORKING_NOTES.md`.
- [ ] Follow-ups (if any) captured in `FOLLOW_UPS.md`; `SESSION_SUMMARY.md` updated.

## Change Set (initial sketch)
- src/crawler/QueueManager.js
- src/crawler/FetchPipeline.js
- src/crawler/UrlEligibilityService.js
- src/crawler/decisions/UrlDecisionOrchestrator.js
- src/crawler/NewsCrawler.js and crawler wiring (if needed)

## Risks & Mitigations
- Double decision computation or conflicting eligibility paths → centralize through orchestrator and add unit coverage.
- Regression in queue/fetch flow → run targeted crawler pipeline/queue tests.
- Legacy callers bypass orchestrator → add compatibility shims in UrlEligibilityService/NewsCrawler.

## Tests / Validation
- npm run test:by-path tests/unit/crawler/NewsCrawler.wiring.integration.test.js
- npm run test:by-path tests/unit/crawler/CrawlerServiceWiring.test.js
- npm run test:by-path tests/crawler/pipeline/runPipeline.test.js (or smaller queue/fetch-focused test if available)
- Add/adjust targeted unit for UrlDecisionOrchestrator path if gaps are found
