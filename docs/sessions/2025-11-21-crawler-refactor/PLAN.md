# Plan: crawler-refactor

**Objective**: Implement the crawler refactor plan (Phases 1–3) so `crawl.js` consumes a centralized configuration service and `NewsCrawler` becomes orchestrator-only via a factory.

**Done when**:
- `ConfigurationService` owns config loading/validation and `crawl.js` delegates to it.
- `CrawlerFactory` builds the crawler with injected services, and `NewsCrawler` accepts them.
- Existing entry points (`crawl.js`, `src/server/crawl-api.js`) create crawlers through the factory.
- Key behaviors have parity verified by targeted tests/checks.

**Change set**:
- `src/config/ConfigurationService.js`, `src/config/defaults.js`, and related utils.
- `crawl.js`, `src/server/crawl-api.js`, possibly other entry points referencing `NewsCrawler`.
- `src/crawler/NewsCrawler.js`, new `src/crawler/CrawlerFactory.js`.
- Session docs + plan.

**Risks / Assumptions**:
- Behavior regression if CLI flags diverge from previous parsing; need parity tests.
- Tight coupling inside `NewsCrawler` might block clean extraction; may require interim shims.
- Need to ensure telemetry/logging initialization order preserved.

**Tests / Checks**:
- `npm run test:by-path tests/server/diagram-atlas.e2e.test.js` (crawler creation path cover) if feasible.
- `npm run test:by-path tests/server/crawl-api.test.js` (if exists) or targeted unit tests once available.
- Manual `node crawl.js --help` smoke and `node crawl.js run-sequence ...` dry-run if fast.

**Docs to update**:
- `docs/CRAWLER_REFACTOR_PLAN.md` status.
- `docs/sessions/SESSIONS_HUB.md` entry for this session.
- Any workflow notes discovered.

## Refactoring Tasks
- [x] **Task 1: Discovery + Alignment** (Status: Completed)
  - [x] Review AGENTS.md topic pointers + relevant quick references.
  - [x] Inventory entry points referencing `NewsCrawler` (using `js-scan`).
  - [x] Capture current CLI/config behavior notes in `WORKING_NOTES.md`.
- [x] **Task 2: ConfigurationService Integration** (Status: Completed)
  - [x] Finalize schema/default extraction into `src/config/defaults.js`.
  - [x] Implement CLI parsing + precedence merge inside `ConfigurationService`.
  - [x] Refactor `crawl.js` to use the service; ensure runner commands still work.
- [ ] **Task 3: CrawlerFactory + DI** (Status: In progress)
  - [ ] Move service wiring from `NewsCrawler` into `CrawlerFactory`.
  - [ ] Update `NewsCrawler` constructor to accept injected services / skip wiring.
  - [ ] Update `src/server/crawl-api.js` and remaining call sites to use the factory.
  - [x] Convert example/tooling scripts such as `tools/examples/news-crawler-example.js` to instantiate crawlers through `CrawlerFactory`.
  - [x] Route legacy CLI (`src/crawler/cli/runLegacyCommand.js`) through `CrawlerFactory` and refresh Jest coverage.
- [ ] **Task 4: Validation + Docs** (Status: In progress)
  - [ ] Run targeted tests / checks. *(Partial: smoke `node crawl.js --help` + `availability --all` completed; need crawler path test)*
  - [ ] Update plan/docs + summarize outcomes.

## Tooling & Manual Test Migration Plan

Goal: eliminate direct `new NewsCrawler()` usage from tooling + manual verification scripts so every path exercises `CrawlerFactory` prior to slimming `NewsCrawler`.

### 1. Inventory & Categorize
- ✅ `js-scan --dir tools --search "new NewsCrawler"` shows two remaining scripts: `tools/crawl-place-hubs.js` and `tools/intelligent-crawl.js`. Keep this command in the plan to rerun for regression detection after edits.
- ⏳ Confirm no hidden instantiations under `tools/manual-tests/` or ad-hoc scripts by running `js-scan --dir tools/manual-tests --search "CrawlerFactory"` post-migration to ensure parity.

### 2. `tools/crawl-place-hubs.js`
1. Replace `const NewsCrawler = require('../src/crawl.js')` (or equivalent) with `const { CrawlerFactory } = require('../src/crawler/CrawlerFactory');`.
2. In `createCrawler(placeHubs, options)`:
   - Build a factory config object from existing options (`crawlType: 'place-hubs'`, concurrency overrides, derived `dataDir`, etc.) and supply `startUrl: VIRTUAL_START_URL`.
   - Call `CrawlerFactory.create(config)` and preserve the returned crawler reference.
   - Ensure manual wiring (place hub queue seeding, telemetry hooks) still runs against the crawler instance.
3. Update any downstream helpers that previously reached into `crawler.options` to read from `crawler.config` if necessary; document deviations in WORKING_NOTES.
4. Verification: run `node tools/crawl-place-hubs.js --help` (if supported) and one dry-run scenario against a small fixture. Capture results in session notes.

### 3. `tools/intelligent-crawl.js`
1. Identify every `new NewsCrawler()` (currently surfaced inside `runVerification`). Some helper routines may sneakily instantiate within closures—use `js-edit --locate name:/NewsCrawler` per function to guard replacements.
2. Import `CrawlerFactory` once near the top-level and centralize the configuration builder (shared between quick/full verification paths) so each call feeds into `CrawlerFactory.create`.
3. Preserve bespoke instrumentation (priority planner stats, verification logging) by ensuring the factory config still sets `intelligentPlanner`, `enableDb`, and other flags passed today.
4. Because this script is used for manual regression sweeps, add a sanity check invocation (`node tools/intelligent-crawl.js --quick --dry-run` or comparable) to the validation checklist.

### 4. Manual Test Hooks
- After the two primary tooling scripts are migrated, rerun `js-scan --dir tools --search "new NewsCrawler" --json`. The result set should be empty; if not, capture remaining matches and extend the plan.
- If `tools/manual-tests/` or ad-hoc scripts load `NewsCrawler` indirectly (e.g., via `require('../src/crawl.js')`), mirror the steps above: swap to `CrawlerFactory`, thread the start URL + options into the factory call, and document any deviations.

### 5. Documentation & Testing
- Record each conversion in `WORKING_NOTES` with timestamps + js-edit commands for traceability.
- Update this PLAN checklist as scripts are completed (per-file checkbox under Task 3).
- Minimal validation matrix:
  - `node tools/crawl-place-hubs.js --help`
  - `node tools/intelligent-crawl.js --quick --dry-run` (or smallest supported scenario)
  - `js-scan --dir tools --search "new NewsCrawler" --json` (post-migration proof)
- If any script manipulates the filesystem (e.g., writes to `data/`), point it at `tmp/` destinations during testing to avoid polluting real crawl artifacts.
