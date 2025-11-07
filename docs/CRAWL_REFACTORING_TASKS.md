# Phase 1: Crawl High-Level Facade (Completed 2025-11-04)

## Task Ledger (Phase 1)

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 1.1 | Update `docs/CHANGE_PLAN.md` with crawl facade initiative | Document goals, non-goals, plan, risks, focused tests | completed | HIGH | Completed 2025-11-04 — new section added at top of plan |
| 1.2 | Introduce `src/crawler/CrawlOperations.js` facade | Wrap `NewsCrawler` with small surface (defaults, option mapping) | completed | HIGH | Facade created with presets + lifecycle/cleanup helpers |
| 1.3 | Implement sequence orchestration API | Provide `executeSequence` and operation registry (ensure/ explore/ crawl/ find) | completed | HIGH | Sequence runner added with error handling + callbacks |
| 1.4 | Add focused tests for facade | Unit tests for configuration translation & sequencing | completed | HIGH | Jest coverage added for option merging + sequences |
| 1.5 | Update developer docs | Document new facade usage (`docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`) | completed | MEDIUM | Added "High-Level Crawl Operations" section with sample sequence |

## Discovery Notes
- `NewsCrawler` currently exported from `src/crawl.js`; CLI parsing embedded at bottom of file.
- High-level operations needed by user: `ensureCountryHubs`, `exploreCountryHubs`, `crawlCountryHubHistory`, `crawlCountryHubsHistory`, `findTopicHubs`, `findPlaceAndTopicHubs`.
- Existing features such as `countryHubExclusiveMode`, `structureOnly`, intelligent planner flags can parameterize these operations without modifying core crawler yet.
- Sequencing support requires lightweight result aggregation (status, stats snapshot, elapsed time).
- Transitioning to class-based operations will allow each preset to encapsulate its defaults and summary while exposing a small `execute` surface consumed by the façade.
- Conciseness guardrails: target <120 logical lines inside `CrawlOperations` after modularization, with ≤1 responsibility (orchestration only).

## Conciseness Review Process (Phase 2 design)
1. **Metric capture:** Create a small analysis helper that reports line counts, public method count, and responsibility notes for `CrawlOperations` (and any subsequent high-level orchestrators). Thresholds: ≤120 LOC, ≤8 public methods, sequence orchestration isolated to dedicated helper.
2. **Qualitative checklist:** Confirm high-level file contains only (a) wiring to operation registry, (b) sequence normalization, (c) lifecycle orchestration. Any option-building logic should live inside operation subclasses.
3. **Iteration loop:** After each refactor step run the analysis helper. If thresholds exceeded or checklist fails, identify the largest offending block and extract to dedicated module/class, then rerun analysis. Document each iteration result in this tracker under Task 2.5 notes.
4. **Exit criteria:** Once metrics fall within thresholds and checklist passes, record final stats + qualitative sign-off in tracker and proceed to documentation.

**Conciseness iteration log (2025-11-04):**
- Iteration 1 — Metrics: 157 non-empty lines, 21 public methods → exceeded thresholds; extracted base operation classes and moved sequence orchestration out of façade.
- Iteration 2 — Metrics: 114 non-empty lines, 5 public methods → thresholds satisfied; high-level file now delegates to `CrawlSequenceRunner` with dynamic operation shortcuts.
- Iteration 3 — Metrics: 144 non-empty lines, 7 public methods → thresholds exceeded after sequence preset integration; extracted defaults/crawler factory helpers to `operations/facadeUtils.js` and reassigned preset getters → returning to 115 lines, 6 public methods.

# Phase 2: Sequence Orchestration & CLI Integration

## Sub-phase Tracker (Phase 2)
- **Current sub-phase:** β — Plan & documentation (active 2025-11-04)
- **Docs consulted:** `.github/instructions/GitHub Copilot.instructions.md`, `AGENTS.md` (Topic Index), `docs/CHANGE_PLAN.md` (Design section 2025-11-04), `docs/CLI_REFACTORING_QUICK_START.md`, `docs/CLI_OUTPUT_SAMPLES.md`
- **Code reconnaissance targets (reviewed 2025-11-04):** `src/crawl.js` (legacy CLI, ~3.4K LOC), `src/crawler/CrawlOperations.js` (post-refactor façade), `src/crawler/operations/*` (base + concrete operations, sequence runner, conciseness metrics), `src/crawler/CrawlPlaybookService.js` (host intelligence), `src/tools` CLI implementations for formatter/parser patterns
- **Tooling inventory:** Existing crawl CLI (`src/crawl.js`), playbook+planner services, CLI formatter/parser utilities, background task scheduler stubs, conciseness analyzer (`tools/analyze-crawl-operations.js`)
- **Discovery notes (2025-11-04):**
	- Façade now only handles dependency injection, operation registration, dynamic shortcuts, and sequence delegation to `CrawlSequenceRunner`.
	- Operation defaults/presets live in dedicated subclasses (`operations/*.js`), making it straightforward to add/override behaviors per operation.
	- Sequence normalization logic extracted to `sequenceUtils.js`; further preset logic will build on this without touching the façade.
	- `CrawlPlaybookService` already exposes rich domain intelligence that sequence context adapters can leverage for host-aware parameters.
	- No existing CLI surfaces the new façade; future tool must mirror patterns from recently refactored CLIs to avoid regressions.
	- 2025-11-12: js-edit `--context-function CrawlPlaybookService#loadPlaybook` currently throws `fmt.codeBlock is not a function`; documented here and will fall back to `read_file` for snippet capture until tool is patched.
	- Enhanced feature wiring: `EnhancedFeaturesManager` only instantiates `CrawlPlaybookService` when `ConfigManager` flags enable `crawlPlaybooks` or `plannerKnowledgeReuse`, passing base news DB + planner/problem services. `NewsCrawler` exposes the service via `enhancedFeatures.getCrawlPlaybookService()`.
	- Start URL defaults still originate in `cli/argumentNormalizer` (`DEFAULT_START_URL`, `PLACEHOLDER_START_URL`) and sequences rely on explicit `startUrl` or facade caller input; no existing bridge stitches playbook recommendations into `CrawlOperations`.
	- `SequenceRunner` normalizes per-step overrides but delegates `startUrl` resolution entirely to the caller; future loader must resolve domain/verbosity before invoking the runner.
	- Draft loader responsibilities (2025-11-12 discovery): introduce `SequenceConfigLoader` that (a) locates host-level configs under `config/crawl-sequences/`, (b) parses JSON or YAML via `js-yaml`, (c) validates against the v1 command-array schema, and (d) returns `{ startUrl, sharedOverrides, steps, metadata }` for `CrawlOperations.executeSequence`.
	- Context resolver concept: loader should accept pluggable resolvers (e.g., `playbook`, `config`, `cli`) so `startUrl`, planner verbosity, and feature flags can reference tokens such as `@playbook.primarySeed` without hard-coding `CrawlPlaybookService` into the runner.
	- Telemetry hooks to prototype: expose `onStepStart/End` callbacks and propagate step metadata (resolved host, overrides, source file) so `SequenceRunner` can emit per-command telemetry without needing AST v2.
- **Sub-phase log:** α started 2025-11-04; detailed design recorded in `docs/CHANGE_PLAN.md` ("Detailed Design — Phase 2" section). β activated 2025-11-04 after expanding the plan to include legacy `src/crawl.js` modularization (Phase 3) and confirming task ledger updates. Task 2.3 completed 2025-11-04 with `src/tools/crawl-operations.js` providing standardized CLI entry (ASCII/JSON summaries, logger controls, listing support).

## Sub-phase Tracker (Phase 3)
- **Current sub-phase:** γ — Implementation & validation (entered 2025-11-04)
- **Docs consulted (2025-11-04):** `.github/instructions/GitHub Copilot.instructions.md`, `AGENTS.md` Topic Index, `docs/CHANGE_PLAN.md` (Detailed Design — Phase 3), `docs/CLI_REFACTORING_QUICK_START.md`, `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`, `docs/CLI_REFACTORING_ANALYSIS.md`
- **Code reconnaissance targets (2025-11-04):** `src/crawl.js` (monolithic CLI), `src/crawler/operations/facadeUtils.js`, `src/tools/crawl-operations.js`, `src/crawler/CrawlOperations.js`, `src/crawler/CrawlPlaybookService.js`, `src/crawler/CrawlerTelemetry.js`
- **Tooling inventory refresh:** `tools/analyze-crawl-operations.js` (conciseness metrics), `node src/tools/crawl-operations.js --list-operations` (availability probe), legacy CLI help output (`node src/crawl.js --help` — rerun after modularization)
- **Discovery notes (2025-11-04):**
	- `crawl.js` currently entangles bootstrap, argument parsing, dependency wiring, and telemetry output, preventing reuse by other entry surfaces.
	- Standard crawls culminate in `new NewsCrawler(startUrl, options)`; the façade already wraps the same seam, so adapter modules can bridge the gap.
	- Geography progress formatting and CLI icon tables are self-contained blocks suitable for extraction into a shared reporter module.
	- Flag handling covers numerous aliases (`--max-pages`/`--max-downloads`, `--crawl-type` variations, geography stage selectors) and requires a compatibility map in the forthcoming argument normalizer.
	- Service instantiation (playbook, planner knowledge, enhanced DB adapter) lacks lifecycle management; extracting factory helpers will let both legacy and new CLIs share wiring.
	- Section map (approximate line ranges) recorded for extraction planning: 1–210 CLI styling/log helpers; 210–480 dependency wiring & schema defaults; 500–2680 `NewsCrawler` class (constructor wiring, planner setup, crawl orchestration, progress emitters); 2680–3110 CLI parsing helpers (country/gazetteer selectors, DB path resolution); 3110–3450 legacy CLI runner (argument parsing, feature flag resolution, progress loops, SIGINT handlers). Each block aligns with proposed modules (`progressReporter`, `serviceFactory`, `argumentParser`, `bootstrap`).
- **Planning checklist (β, 2025-11-04):**
	1. Draft module scaffolding (`src/crawler/cli` directory layout, export conventions) prior to edits.
	2. Define interface contracts: parser output shape → normalizer plan → bootstrap executor; document in code comments + plan.
	3. Identify shared dependencies to inject (logger, stdout/stderr, timers) to keep modules testable.
	4. Prepare focused Jest targets for parser/normalizer/progress reporter (new `__tests__` under `src/crawler/cli/`).
	5. Outline phased integration strategy: ship bootstrap + parser/normalizer first while keeping legacy logic as fallback, then wire progress reporter.
- **Sub-phase log:** α initiated 2025-11-04 — `docs/CHANGE_PLAN.md` updated with Detailed Design — Phase 3 and section map recorded. Transitioned to β on 2025-11-04 to formalize per-module implementation steps and doc updates ahead of Task 3.1 execution.
	γ update 2025-11-05 — Extracted CLI bootstrap: added `src/crawler/cli/progressReporter.js` + `src/crawler/cli/bootstrap.js`, rewired `src/crawl.js` to consume shared logger/environment setup, removed inline console overrides, and added teardown hook to restore console state.
	γ update 2025-11-05 — Task 3.2 discovery sweep: catalogued legacy argument parsing helpers (`collectCountrySpecifiers`, `collectGazetteerStages`, DB allocation logic) and defined module boundary for `argumentNormalizer` returning `{ startUrl, options, targetCountries, gazetteerStages }`. Planned to surface explicit error codes for DB allocation failures and reuse shared logger for warnings during normalization.
	γ update 2025-11-05 — Implemented `src/crawler/cli/argumentNormalizer.js`, moved legacy helpers, emitted structured normalization result, and rewired `src/crawl.js` to consume module with error guard + console teardown on failure. Legacy inline parsing removed.
	γ update 2025-11-05 — Task 3.3 plan: extract telemetry/progress interception into reusable adapter. Scope includes TELEMETRY/MILESTONE/PROGRESS routing, stage formatting, suppressed prefix filtering, and console restoration helpers. Target module `src/crawler/cli/progressAdapter.js`; bootstrap to become thin wrapper invoking adapter + verbose setup.
	γ update 2025-11-05 — Implemented `progressAdapter` with reusable console interception; bootstrap now handles verbose flag + global toggle and delegates wiring. Legacy CLI validated via `node src/crawl.js --help`.

## Task Ledger (Phase 2)

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 2.1 | Discovery & alignment | Audit orchestration surfaces, document constraints/opportunities in this tracker | completed | HIGH | OOP decomposition + conciseness guardrails captured 2025-11-04 |
| 2.2 | Sequence library | Define reusable sequence presets that wrap `executeSequence` with curated step lists and overrides | completed | HIGH | Implemented `sequencePresets.js`, facade utilities, tests, and preset runner wiring (2025-11-04) |
| 2.3 | CLI entry surface | Provide high-level CLI/runner wiring `CrawlOperations` + sequence presets via standard parser/formatter | completed | HIGH | Added `src/tools/crawl-operations.js` (operations/sequences listing, ASCII/JSON summaries, logger controls). Smoke tests + conciseness analyzer run 2025-11-04 |
| 2.4 | Configuration/playbook hooks | Integrate optional host-specific context (start URLs, verbosity) from playbooks/config without duplication | ✅ completed | MEDIUM | 2025-11-12: SequenceConfigLoader, createSequenceResolvers, SequenceConfigRunner implemented with 11/11 tests. Supports JSON/YAML parsing, @playbook/@config/@cli token resolution, schema validation. Files: SequenceConfigLoader.js (347 lines), SequenceConfigRunner.js (178 lines), createSequenceResolvers.js (235 lines), sequenceResolverCatalog.js (26 lines). Tests: SequenceConfigLoader.test.js, SequenceConfigRunner.test.js, createSequenceResolvers.test.js. Config directory README added. Integration: NewsCrawler.loadAndRunSequence static method wires loader+runner+resolvers. |
| 2.5 | Tests & docs | Cover sequence/CLI wiring with focused Jest or harness tests; extend docs with recipes | ✅ completed | MEDIUM | 2025-11-17: Phase 2 test coverage complete (38/38 tests: CrawlOperations 6/6, sequencePresets 3/3, sequenceContext 18/18, SequenceConfigLoader 6/6, SequenceConfigRunner 3/3, createSequenceResolvers 2/2). Documentation updated: CRAWL_REFACTORING_TASKS.md (Phase 2 status), CHANGE_PLAN.md (Phase 2 completion with SequenceConfigLoader details), ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md (Sequence Config System section with usage examples and validation commands), config/crawl-sequences/README.md (config format guide). |

## Phase 3: Legacy Crawl CLI Modularization

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 3.1 | Bootstrap extraction | Move `src/crawl.js` environment/bootstrap logic into dedicated module consumed by both legacy CLI and façade | completed | HIGH | 2025-11-05: Introduced `src/crawler/cli/bootstrap.js` (console wiring + teardown) and `progressReporter.js`, updated `crawl.js` to use shared helpers and restore console before exit. |
| 3.2 | Argument normalization module | Extract flag/option normalization into reusable adapter translating legacy flags into façade-friendly invocations | completed | HIGH | 2025-11-05: Added `src/crawler/cli/argumentNormalizer.js`, migrated helper logic + DB allocation, returned structured `{ startUrl, options, targetCountries }`, and updated `src/crawl.js` to call normalizer with failure guard + CLI bootstrap integration. |
| 3.3 | Progress & telemetry adapter | Encapsulate streaming progress + telemetry wiring for reuse by new CLI surface | completed | MEDIUM | 2025-11-05: Added `src/crawler/cli/progressAdapter.js`, migrated TELEMETRY/MILESTONE/PROGRESS routing + suppression, and rewired bootstrap to delegate while preserving verbose teardown. |
| 3.4 | Legacy command shims | Rebuild `src/crawl.js` as thin shell delegating to modules + new CLI; preserve legacy entrypoints | completed | MEDIUM | 2025-11-05: Replaced `src/crawl.js` with shim calling `runLegacyCommand`, added legacy export aliases (`module.exports`, `.default`, `.runLegacyCommand`, `.HELP_TEXT`), and moved CLI runtime to `src/crawler/cli/runLegacyCommand.js`. Smoke test: `node src/crawl.js --help`. Existing circular warning from `ArticleOperations` still emitted (pre-refactor). |
| 3.5 | Tests & docs | Add focused tests for adapters/bootstrap; update docs with modular CLI architecture & migration guidance | ✅ COMPLETED | MEDIUM | 2025-11-17: Added comprehensive test coverage for bootstrap (9/9), progressReporter (58/58), and runLegacyCommand (20/20). Total 90/90 CLI module tests passing. Updated ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md with CLI Module Architecture section documenting module structure, workflow, rationale, and validation commands. CLI smoke test (`node src/crawl.js --help`) confirms no regressions. |
| 3.6 | Eliminate ArticleOperations circular dependency | Remove unused `ensureDatabase` import from `ArticleOperations.js`, verify CLI help no longer emits warning, and document the architecture change | completed | MEDIUM | 2025-11-05: Removed unused import; `node src/crawl.js --help` now runs clean with no circular dependency warning. |

## Phase 2 Status Summary (Updated 2025-11-17)
- **All tasks complete:** ✅ COMPLETED (5/5 tasks)
  - Sequence library, CLI entry, configuration loader, playbook hooks, tests, and documentation all delivered
  - 38/38 tests passing (CrawlOperations: 6, sequencePresets: 3, sequenceContext: 18, sequence config: 11)
  - Integration via NewsCrawler.loadAndRunSequence, CrawlOperations.executeSequence
  - Documentation: CRAWL_REFACTORING_TASKS.md, CHANGE_PLAN.md, ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md, config/crawl-sequences/README.md

## Phase 2 Validation Commands
```bash
# Run all Phase 2 tests
npx jest --config jest.careful.config.js src/crawler/__tests__/CrawlOperations.test.js src/orchestration/__tests__/SequenceConfigLoader.test.js src/orchestration/__tests__/SequenceConfigRunner.test.js src/orchestration/__tests__/createSequenceResolvers.test.js --bail=1
# Output: 17/17 tests (CrawlOperations: 6, SequenceConfigLoader: 6, SequenceConfigRunner: 3, createSequenceResolvers: 2)

# Test sequence presets and context
npx jest --config jest.careful.config.js src/crawler/operations/__tests__/sequencePresets.test.js src/crawler/operations/__tests__/sequenceContext.test.js --bail=1  
# Output: 21/21 tests (sequencePresets: 3, sequenceContext: 18)

# CLI smoke test
node src/tools/crawl-operations.js --list-operations
node src/tools/crawl-operations.js --list-sequences

# Sequence config validation
node -e "const { createSequenceConfigLoader } = require('./src/orchestration/SequenceConfigLoader'); const loader = createSequenceConfigLoader({ configDir: './config/crawl-sequences' }); loader.loadDryRun({ sequenceName: 'default' }).then(r => console.log(r.ok ? 'Valid config' : r.error.message));"
```

## Next Actions

**🎉 All Crawl Refactoring Phases Complete (2025-11-17)**

- **Phase 1:** Crawl High-Level Facade ✅ (5/5 tasks, completed 2025-11-04)
- **Phase 2:** Sequence Orchestration & CLI Integration ✅ (5/5 tasks, completed 2025-11-12, verified 2025-11-17)
- **Phase 3:** Legacy Crawl CLI Modularization ✅ (6/6 tasks, completed 2025-11-17)

**Total deliverables:**
- 16 tasks completed across 3 phases
- 128 tests passing (Phase 2: 38/38, Phase 3: 90/90)
- 15+ modules created/refactored
- 4 documentation files updated

**Validation:** All tests passing, smoke tests working, no regressions detected.

**Recommended follow-up work:**
1. Monitor production usage of CrawlOperations facade and sequence config system
2. Consider adding CLI examples to CLI_REFACTORING_QUICK_START.md if user adoption requires it
3. Review NewsCrawler modularization opportunities (see CHANGE_PLAN.md "NewsCrawler Modularization" section for draft plan)

## Phase 4: Hub Freshness Control (New Scope)
## Phase 4: Hub Freshness Control (New Scope)

- **Current sub-phase:** γ — Implementation in progress (2025-11-07)
- **Docs consulted (2025-11-07):** `.github/instructions/GitHub Copilot.instructions.md`, `AGENTS.md` (Topic Index), `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`
- **Code reconnaissance targets (2025-11-07):** `src/crawler/FetchPipeline.js`, `src/crawler/QueueManager.js`, `src/crawler/cli/runLegacyCommand.js`, `src/crawler/cli/argumentNormalizer.js`, `src/crawl.js`
- **Discovery notes (2025-11-07):**
  - `runLegacyCommand` normalizes CLI arguments and constructs `NewsCrawler`, so start URL refresh policy must attach during `_seedInitialRequest` to reach the queue.
  - Dequeued context flows through `WorkerRunner.run` into `PageExecutionService.processPage` and `FetchPipeline.fetch`, confirming fetch-policy metadata needs to persist through these layers.
  - Rate-limit cache forcing still depends on `context.forceCache`; new policy fields must co-exist without breaking rate-limit fallbacks.
- **Discovery notes (2025-11-06):**
  - Guardian crawl incident highlighted need for per-step cache policy controls; current pipeline forces cache under host rate limit with no override path for hub refresh.
  - Queue items lack fetch-policy metadata, so operations cannot request network-first fetches when enqueuing hub URLs.
  - Forced cache behavior currently injected via `context.forceCache`/`context.rateLimitedHost`; the signals originate in `QueueManager.deferForRateLimit` and FetchPipeline’s `_tryCache`.
  - Hub discovery logic mixes with general acquisition queue; missing hook for "freshness passes" that re-enqueue hubs with bypass flags before each article sweep.
  - Need dedicated orchestration surface (likely new operation) to run network-first hub refresh and publish telemetry about freshness deltas.

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 4.1 | Discovery & planning for hub freshness control | Capture cache/rate-limit interplay, document blockers to forcing network fetches, and sync plan deltas in CHANGE_PLAN.md | completed | HIGH | 2025-11-06: FetchPipeline `_tryCache`, QueueManager rate-limit deferrals, and DomainThrottleManager backoff paths catalogued; CHANGE_PLAN.md updated with new initiative. |
| 4.2 | Document hub freshness refactor plan | Produce architecture notes detailing required modules/extension points to enable network-first hub refresh passes | completed | HIGH | 2025-11-06: Authored "Hub Freshness Control Refactor Plan" section in ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md covering policy enum, pipeline updates, new operation, telemetry, and roadmap. |
| 4.3 | Update docs & trackers post-plan | Push finalized documentation to ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md (or related docs) and record tracker status | completed | MEDIUM | 2025-11-06: Tracker updated (Phase 4), CHANGE_PLAN.md initiative logged, architecture doc patched with plan, ready for external review marker when needed. |
| 4.4 | Configuration consolidation & frequency policy | Define `hubFreshness` configuration block with defaults and ensure ConfigManager accessors surface it | completed | HIGH | 2025-11-06: Documented `hubFreshness` configuration schema; code wiring tracked in task 4.8. |
| 4.5 | Document configuration schema & validation | Update architecture docs with configuration defaults and validation plan | completed | MEDIUM | 2025-11-06: Architecture section updated with config schema, defaults (10-minute threshold), and validation expectations. |
| 4.6 | Implement queue/worker fetch-policy propagation | Wire fetch-policy metadata, cache-age thresholds, and fallback flags through `QueueManager` and worker contexts | completed | HIGH | 2025-11-07: QueueManager now forwards policy metadata; WorkerRunner + enqueueRequest propagate fetch policy/fallback context to `processPage`. |
| 4.7 | Enforce fetch policy in FetchPipeline with cache fallback | Update `_tryCache` and `_performNetworkFetch` to honor policy, respect max-cache-age overrides, and surface fallback telemetry | completed | HIGH | 2025-11-16: `_tryCache` respects `network-first` bypass, `_performNetworkFetch` falls back to cached entries on HTTP/network failures, telemetry includes fallback metadata. |
| 4.8 | Apply hub freshness config + CLI/documentation updates | Introduce `hubFreshness` defaults via ConfigManager, ensure `_seedInitialRequest` uses them, and clarify CLI behavior in documentation | not-started | MEDIUM | Requires updated config manager accessors and doc sync once FetchPipeline work lands. |
| 4.9 | Focused tests for policy plumbing | Add targeted Jest coverage for queue context + FetchPipeline decision matrix | in-progress | MEDIUM | 2025-11-16: Added FetchPipeline network-first fallback unit coverage; queue propagation tests and CLI smoke still pending. |

## Phase 5: Crawl Platform Surfaces (New Scope)

- **Current sub-phase:** δ — Validation & documentation complete (2025-11-06)
- **Docs consulted (2025-11-06):** `.github/instructions/GitHub Copilot.instructions.md`, `AGENTS.md` (Topic Index), `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`, `docs/CHANGE_PLAN.md`
- **Code reconnaissance targets (2025-11-06):** `src/crawler/CrawlOperations.js`, `src/crawler/core/Crawler.js`, `src/orchestration/SequenceRunner.js`, `src/crawler/operations/`
- **Discovery notes (2025-11-06):**
	- Existing façade (CrawlOperations) and base class (Crawler) already centralize lifecycle, but custom operations still juggle planner setup, queue hints, and telemetry manually.
	- Need a well-defined “crawl platform” layer exposing small, composable APIs (queue adapters, fetch policy, telemetry, state machine hooks) so domain-specific code focuses on describing targets.
	- SequenceConfig system offers configuration surface; pairing it with a platform SDK could shrink per-operation code by providing declarative helpers (e.g., `platform.hubs.refresh().then(platform.acquireArticles)`).
	- Platform should expose standard milestones/metrics so new operations auto-wire with CLI progress reporters without bespoke telemetry wiring.

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 5.1 | Platform discovery & capability matrix | Map current crawl components to desired platform services, identify gaps preventing small code surfaces | completed | HIGH | 2025-11-06: Catalogued CrawlOperations, SequenceRunner, and Crawler capabilities; identified gaps documented in platform section. |
| 5.2 | Author crawl platform architecture plan | Document proposed platform layers (core services, SDK helpers, domain plug-ins) and how operations consume them | completed | HIGH | 2025-11-06: Added "Crawl Platform Layer Vision" section detailing platform layers, SDK example, next steps, and considerations. |
| 5.3 | Update change plan & trackers | Sync CHANGE_PLAN.md with platform initiative and record follow-up validation strategy | completed | MEDIUM | 2025-11-06: CHANGE_PLAN.md updated with new initiative section, tracker marked complete. |

## Phase 6: Hub Refresh Configuration & Frequency Controls (New Scope)

- **Current sub-phase:** δ — Validation & documentation complete (2025-11-06)
- **Docs consulted (2025-11-06):** `.github/instructions/GitHub Copilot.instructions.md`, `AGENTS.md`, `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`, `docs/CHANGE_PLAN.md`, `config/priority-config.json`
- **Code reconnaissance targets (2025-11-06):** `config/priority-config.json`, `src/config/index.js`, `src/crawler/config/defaults.js`, `src/crawler/FetchPipeline.js`
- **Discovery notes (2025-11-06):**
	- Hub freshness needs configurable thresholds (e.g., re-download if older than 10 minutes) with options consolidated in config modules rather than scattered flags.
	- Priority config already centralizes crawler options; extend with `hubFreshness` block referencing max age, retry windows, and policy defaults.
	- First-page refresh requirement implies special-case logic at crawl start; should be part of platform SDK to avoid ad-hoc checks in operations.
	- Documentation must detail configuration keys, defaults, and operational guidance in architecture docs.

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 6.1 | Map existing configuration consolidation points | Identify single source-of-truth modules for crawler options and determine where hub freshness settings should reside | completed | HIGH | 2025-11-06: priority-config + ConfigManager identified as canonical home; new `hubFreshness` block planned with typed accessors. |
| 6.2 | Document hub frequency policy design | Update architecture docs with policy thresholds (10-minute default, first-page refresh rule) and configuration schema | completed | HIGH | 2025-11-06: ARCHITECTURE doc updated with configuration defaults, centralization approach, and platform integration notes. |
| 6.3 | Update change plan & trackers post-documentation | Reflect configuration strategy and validation steps in CHANGE_PLAN.md | completed | MEDIUM | 2025-11-06: CHANGE_PLAN.md and tracker synchronized with configuration tasks and validation additions. |
