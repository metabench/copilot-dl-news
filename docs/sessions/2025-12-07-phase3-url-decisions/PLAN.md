# Plan – Wire UrlDecisionOrchestrator

Mode: 🧠 jsgui3 Research Singularity 🧠

## Objective
Replace legacy decision flow with orchestrator in queue/fetch.

## Done When
- UrlDecisionOrchestrator is instantiated in crawler wiring and used for decisions feeding QueueManager and FetchPipeline.
- Legacy UrlDecisionService duplication is bypassed or bridged without regressions (behavior parity maintained).
- Focused tests cover enqueue + fetch paths using orchestrator-backed decisions.
- Notes and any residual gaps captured in SESSION_SUMMARY + FOLLOW_UPS.

## Change Set (initial sketch)
- src/crawler/CrawlerServiceWiring.js (introduce orchestrator wiring, expose getter)
- src/crawler/UrlEligibilityService.js (consume orchestrator decisions via adapter)
- src/crawler/FetchPipeline.js (accept orchestrator or new getUrlDecision contract if needed)
- src/crawler/QueueManager.js (ensure enqueue path uses orchestrator-backed eligibility)
- tests/crawler/decisions/* or new targeted tests validating orchestrator-driven enqueue/fetch
- docs/sessions/2025-12-07-phase3-url-decisions/WORKING_NOTES.md (notes) and FOLLOW_UPS.md (leftovers)

## Risks & Mitigations
- Behavior drift vs legacy UrlDecisionService: add compatibility adapter and reuse same decision shape; keep UrlPolicy semantics.
- Performance overhead from double decisions: ensure single orchestrator call per enqueue/fetch path.
- Robots/respect config mismatch: align orchestrator config with existing crawler options; add small sanity test.
- Test flakiness in pipeline tests: prefer focused unit tests over e2e; avoid long-running servers per AGENTS.

## Tests / Validation
- npm run test:by-path tests/crawler/decisions/UrlDecisionOrchestrator.test.js (if exists) or add new unit.
- npm run test:by-path tests/crawler/pipeline/runPipeline.test.js tests/crawler/pipeline/pageProcessingPipeline.test.js (ensure pipelines still pass).
- If enqueue behavior changes, add/adjust tests in tests/crawler/__tests__/queueManager.basic.test.js.
