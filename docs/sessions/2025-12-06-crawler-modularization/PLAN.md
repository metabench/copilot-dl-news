# Plan – NewsCrawler & DomainProcessor slicing

## Objective
Break down large crawler/orchestration files into smaller pipeline modules

## Done When
- [x] Core pipeline infrastructure created (runPipeline, createStep, composePipelines)
- [x] Step builder factory implemented (buildSteps with conditional step inclusion)
- [x] Step definitions created for all crawler phases (validate, policy, cache, fetch, parse, detect, enqueue)
- [x] Focused tests pass (34 tests: 16 for runPipeline, 18 for buildSteps)
- [x] Config extraction — CrawlerConfigNormalizer with schema, normalization, mode detection (34 tests)
- [x] Mode Strategy Pattern — Base CrawlModeStrategy + Basic/Gazetteer/Intelligent modes (50 tests)
- [x] Pipeline Integration — pageProcessingPipeline with 10 step builders (29 tests)
- [ ] NewsCrawler integrated with new pipeline pattern (optional follow-up)
- [ ] DomainProcessor split into steps/pipelines with shared utilities extracted
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`

## Change Set (implemented)
### Phase 1 - Pipeline Infrastructure
- src/crawler/pipeline/runPipeline.js — Core pipeline executor with timeout, metrics, optional step support, context accumulation
- src/crawler/pipeline/buildSteps.js — Step builder factory with 15+ step types
- src/crawler/pipeline/index.js — Module exports

### Phase 2 - Config Module
- src/crawler/config/CrawlerConfigNormalizer.js — Centralized config normalization, schema, mode detection
- src/crawler/config/index.js — Module exports

### Phase 3 - Mode Strategy Pattern
- src/crawler/modes/CrawlModeStrategy.js — Abstract base with factory method
- src/crawler/modes/BasicCrawlMode.js — Standard web crawling mode
- src/crawler/modes/GazetteerCrawlMode.js — Geography-based crawling mode
- src/crawler/modes/IntelligentCrawlMode.js — AI-planned crawling mode
- src/crawler/modes/index.js — Module exports with createModeStrategy factory

### Phase 4 - Page Processing Pipeline
- src/crawler/pipeline/pageProcessingPipeline.js — 10 step builders + processPagePipeline function

### Tests
- tests/crawler/pipeline/runPipeline.test.js — 16 passing tests
- tests/crawler/pipeline/buildSteps.test.js — 18 passing tests
- tests/crawler/pipeline/pageProcessingPipeline.test.js — 29 passing tests
- tests/crawler/config/CrawlerConfigNormalizer.test.js — 34 passing tests
- tests/crawler/modes/CrawlModeStrategy.test.js — 50 passing tests

**Total: 147 tests passing**

## Change Set (pending)
- src/crawler/NewsCrawler.js — Integration with new pipeline pattern (optional)
- src/orchestration/DomainProcessor.js — Pipeline-over-flags migration
- Shared utilities under src/utils/ (logging/retry/rate-limit/metrics)

## Risks & Mitigations
- Behavior drift when splitting pipelines → keep integration harness or snapshot tests per pipeline.
- Hidden side effects in current monoliths → introduce adapter interfaces and pass dependencies explicitly.
- Test runtime cost → run scoped jest paths and targeted scripts only.

## Tests / Validation
- [x] runPipeline.test.js — 16 tests covering step execution, timing, timeout, error handling
- [x] buildSteps.test.js — 18 tests covering step generation, conditional inclusion, handler integration
- [x] pageProcessingPipeline.test.js — 29 tests covering all 10 steps + full pipeline execution
- [x] CrawlerConfigNormalizer.test.js — 34 tests covering schema, normalization, mode detection
- [x] CrawlModeStrategy.test.js — 50 tests covering base class, 3 modes, factory method
