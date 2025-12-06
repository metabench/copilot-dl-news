# Working Notes – NewsCrawler & DomainProcessor slicing

- 2025-12-06 — Session created via CLI. Add incremental notes here.
- 2025-12-06 — User asked for pipeline-over-flags wiring guidance and a green landscape SVG illustrating the pipeline steps.
- 2025-12-06 — Created pipeline-landscape.svg (green landscape with cloud notes + sun badge) and validated with `node tools/dev/svg-collisions.js docs/sessions/2025-12-06-crawler-modularization/pipeline-landscape.svg --strict` (no collisions after mountain split).
- 2025-12-06 — **Pipeline Pattern Implementation Complete:**
  - Created `src/crawler/pipeline/runPipeline.js` (~290 lines) with core execution engine
  - Created `src/crawler/pipeline/buildSteps.js` (~320 lines) with 15+ step builders
  - Created `src/crawler/pipeline/index.js` module entry point
  - Created `tests/crawler/pipeline/runPipeline.test.js` (16 tests, all passing)
  - Created `tests/crawler/pipeline/buildSteps.test.js` (18 tests, all passing)
  - Pattern: configure → buildSteps → runPipeline → observe → commit

## Key Implementation Details

### runPipeline(steps, ctx, deps, options)
- Sequential step execution with timeout support
- Per-step timing and result tracking
- Optional steps continue on failure
- shouldRun predicate for conditional execution
- Returns `{ ok, ctx, stepResults, durationMs, abortedAt?, err? }`

### buildSteps(config, handlers)
- Config flags control which steps are included (e.g., `preferCache`, `validateRobots`, `structureOnly`)
- Handler functions injected for each step type (fetcher, cacheGetter, linkExtractor, etc.)
- Phases: Validation → Policy → Cache → Network → Processing → Telemetry

### Step Types Available
- **Validation**: validateUrl, normalizeUrl
- **Policy**: checkRobots, checkVisited, checkPolicy
- **Cache**: tryCache (optional)
- **Network**: acquireRateToken, acquireDomainToken, fetch
- **Processing**: parseHtml, extractLinks, detectArticle, saveArticle, enqueueLinks
- **Telemetry**: recordMetrics (optional)
