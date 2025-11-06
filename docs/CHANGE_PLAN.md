# CHANGE_PLAN.md — Future Refactoring Analysis Guide

> **For historical initiatives, see `docs/archives/CHANGE_PLAN_HISTORY.md`.**

> **Multi-model review commitment:** Each active initiative in this plan is expected to receive input from multiple AI models. When a different model proposes updates, annotate the relevant section with their contributions, summarize any new assumptions or risks, and flag outstanding questions for follow-up.

**📌 TEMPLATE FOR FUTURE REFACTORING INITIATIVES**

**Previous Initiative:** CLI Tool Refactoring & Hub Guessing Workflow Modernization (completed October 2025 — see `docs/refactored/cli-refactoring-stages.md` for complete case study).

---

### Modularisation Snapshot — November 6, 2025

- **Crawl High-Level Facade:** ✅ **Phase 2 COMPLETE** — Sequence library implemented with 5 presets, CLI surface working (--list-operations, --list-sequences, --sequence execution), playbook integration via SequenceContextAdapter with --db-path flag. All tests passing (sequencePresets: 3/3, sequenceContext: 18/18). See `docs/PHASE_2_CRAWL_FACADE_IMPLEMENTATION_PLAN.md` for complete implementation details.
- **NewsCrawler Modularization:** ✅ **Phase 10 complete** (Tasks 10.1-10.5). Base class `src/crawler/core/Crawler.js` introduced with shared lifecycle infrastructure. `NewsCrawler` refactored to extend base class, removing duplicate code. Documentation updated, validation tests passing. Ready for future modularization phases.
- **Schema Blueprint Alignment:** Task 8.5 (resolve schema-dependent Jest worker exit warning) is still in progress and blocks closing the blueprint alignment initiative.
- **js-edit CLI Modularization:** ✅ **COMPLETE** — All tasks finished (7.1-7.6, 7.7-7.14, 9.4). CLI fully modularized with `operations/discovery.js` (symbol inventory, filters, search), `operations/context.js` (context retrieval, guard operations, plan emission), and `operations/mutation.js` (locate/extract/replace with guardrails). Internal Architecture section added to tools/dev/README.md documenting module structure and dependency injection pattern. Dense list output is default, combined selector expressions working, constructor listing functional with hash display. Discovery filters (--match/--exclude), position-based lookup (--snipe), top-level outline (--outline), unified diff preview (--preview-edit), and constructor inventory (--list-constructors) all implemented. All 51 Jest tests passing.
- **Careful js-edit Refactor Agent:** ✅ **COMPLETE** (Tasks 9.1–9.4) — Agent published with js-edit toolbox. Documentation cross-linked in AGENTS.md with usage guidance for three agent variants. Constructor inventory command implemented.

## 🔄 Active Initiative (Nov 4, 2025): Careful js-edit Refactor Agent

### Goal / Non-Goals
- **Goal:** Publish a new `.github/agents/Careful js-edit refactor.agent.md` playbook that fuses the disciplined, phase-driven workflow from *Careful Refactor* with the js-edit guardrail practices refined during the CLI refactor and builder initiatives. The agent must default to `tools/dev/js-edit.js` for JavaScript discovery/editing, explain the command surface in depth, and surface lessons learned (plan emission, guard hashes/spans, CommonJS selectors, stuck protocol).
- **Non-Goals:** Do not retire existing agents (*Careful Refactor*, *Careful js-edit Builder*); they remain valid for other workflows. Avoid edits to the global instruction set outside of adding cross-links once the new agent ships.

### Current Behavior (Baseline)
- *Careful Refactor* offers exhaustive modularization guidance but only hints at editing discipline—it lacks first-class js-edit expectations.
- *Careful js-edit Builder* centers on js-edit but targets net-new feature work instead of long-running refactor phases tied to tracker/plan hygiene.
- Operators and agents must cross-reference multiple docs (`tools/dev/README.md`, `docs/CLI_REFACTORING_QUICK_START.md`, session summaries) to reconstruct best practices.

### Refactor & Modularization Plan
1. **Task 9.1 – Refresh change plan for agent instruction work** *(α → β, in-progress)*
  - Use this section to capture goals, tests, and risks.
  - List js-edit highlights to promote (plan emission, guard enforcement, multi-file sequencing) and note supporting documentation.
2. **Task 9.2 – Author `Careful js-edit refactor.agent.md`** *(γ)*
  - Clone the structure of the Careful Refactor agent, weave in js-edit defaults, and tighten instructions based on recent experience (explicit stuck protocol, living plan requirements, js-edit command primer).
  - Include a dedicated js-edit toolbox section covering commands, guardrail flags, plan workflows, and when to emit plan files.
3. **Task 9.3 – Cross-link documentation** *(δ)*
  - Update `AGENTS.md`/indices (and `.github/agents/index.json` if required) after the agent lands.
  - Ensure references explain which workflows should pick the js-edit refactor agent vs. builder/refactor variants.

### Cross-model Collaboration Notes
- Leave “Pending multi-model review” markers when awaiting feedback from another AI system.
- Document each external model’s adjustments to the playbook (e.g., new guardrails, updated stuck protocol) and reconcile them with existing workflows before moving forward.

**Grok's Review (November 4, 2025):** The js-edit refactor agent concept is excellent for maintaining disciplined, tool-assisted refactoring workflows. To enhance its effectiveness, consider adding explicit guidance on fallback strategies when js-edit encounters unsupported syntax or complex refactors that exceed its capabilities—perhaps directing users to manual editing with clear documentation requirements. Additionally, recommend integrating automated testing checkpoints after each js-edit operation to catch regressions early, and include more examples of multi-file refactors to demonstrate batch editing workflows. Finally, ensure the agent playbook emphasizes the importance of plan emission for complex changes to enable safe rollbacks and peer review.

**Grok's Expanded Workflow Review (November 4, 2025):** To achieve significant progress in few phases, implement a "batch-first" workflow that consolidates discovery, planning, and initial implementation into a single intensive phase. Start with a comprehensive reconnaissance sweep using js-edit's --list-functions and --context-function to map the entire codebase surface in one pass, emitting plan files for all potential targets. Then, prioritize high-impact extractions (e.g., base class scaffolding) and execute them in sequential batches using --emit-plan and --replace with --allow-multiple for multi-file changes. Integrate automated testing checkpoints after each batch (e.g., run jest.careful.config.js scoped to affected modules) to validate incrementally without full suite runs. This approach reduces phases from 5 to 3: (1) Unified Discovery & Planning, (2) Sequential Implementation Batches, (3) Consolidated Validation & Documentation. Use the living tracker to sequence batches, ensuring each completes before advancing.

### Risks & Mitigations
- **Instruction drift:** New guidance might diverge from actual workflows. *Mitigation:* Base the document on the existing Careful Refactor agent and insert only validated improvements.
- **Redundant content:** Copying large text blocks could enlarge maintenance burden. *Mitigation:* Reuse structure but streamline wording, pointing readers to canonical docs instead of duplicating them.
- **Over-indexing on js-edit:** Some refactors require non-JavaScript edits. *Mitigation:* Document exceptions (configs, Markdown) and require justification in the change plan before bypassing js-edit.

### Focused Validation Plan
- Proofread rendered Markdown (frontmatter + headings).
- Cross-check instructions against `node tools/dev/js-edit.js --help` to ensure command coverage is accurate.
- Verify `.github/agents/index.json` accommodates the new agent name after file creation.

### Rollback Plan
- Remove `Careful js-edit refactor.agent.md` and any doc references if the playbook proves unnecessary. The change is additive, so reverting the commits fully restores the previous agent catalog.

### Task Ledger (mirrors `docs/CLI_REFACTORING_TASKS.md`)
| Task | Status | Notes |
|------|--------|-------|
| 9.1 Refresh change plan for agent instruction work | completed | This section documents scope, risks, and validation steps (2025-11-04).
| 9.2 Author `Careful js-edit refactor.agent.md` | completed | 2025-11-04: Agent published with js-edit toolbox, guardrail guidance, and improved phase workflow.
| 9.3 Cross-link documentation | completed | 2025-11-06: Updated AGENTS.md Quick Links with clarifying descriptions for when to use each agent variant (js-edit refactor for JavaScript modularization, js-edit builder for new features, Careful Refactor for non-JS work).
| 9.4 Add constructor inventory command | completed | 2025-11-06: `--list-constructors` fully implemented with hash display, params, extends/implements heritage, explicit/implicit kind detection, --include-internals flag, and dense/verbose/JSON output formats. Constructor hashes provided for all explicit constructors to enable targeted refactoring.

**Task 9.4 verification (2025-11-06):**
- Syntax: `js-edit --file <target> --list-constructors [--filter-text <substring>] [--match <pattern>] [--exclude <pattern>] [--include-internals] [--include-paths] [--list-output dense|verbose] [--json]`
- Hash display: Explicit constructors show 8-character hashes (e.g., `6Z4U7cYZ`); implicit constructors show `(implicit)` for params
- Output formats: Dense list (default), verbose table with columns (index/class/export/extends/implements/params/hash/kind/line/column/internal), JSON with full metadata
- Example: `node tools/dev/js-edit.js --file src/example.js --list-constructors --list-output verbose` displays table with all constructor details including hashes
- Filtering: Supports --filter-text across class names, hashes, params, heritage; --match/--exclude for pattern-based class filtering; --include-internals to show non-exported classes without heritage
- Verified with test file containing explicit constructors (Widget, Button) and implicit constructor (Panel)

## 🔄 Active Initiative (Nov 6, 2025): js-scan CLI Implementation

### Goal / Non-Goals
- **Goal:** Ship the Phase 1 js-scan CLI MVP described in `docs/JS_SCAN_DESIGN_PROPOSAL.md`, delivering multi-file JavaScript discovery with hash-compatible search, compact output, and agent guidance.
- **Non-Goals:** Skip Phase 2/3 stretch features (dependency maps, refactor plan automation beyond MVP). Do not modify `tools/dev/lib/swcAst.js` hashing logic or existing js-edit behavior. Avoid adopting new parser libraries beyond the established `@swc/core` stack.

### Current Behavior (Baseline)
- No workspace-wide code scanner exists; agents rely on per-file `js-edit --list-functions` calls or manual search.
- Hash-based lookups are limited to js-edit’s single-file operations, blocking guarded multi-file workflows and plan verification.
- Agents lack structured guidance to narrow large result sets, often overwhelming conversation limits.

### Implementation Plan (Reversible Steps)
1. **Bootstrap CLI Surface** – Create `tools/dev/js-scan.js` with `CliArgumentParser` wiring, shared formatter output (compact text + JSON), and stub operations. Add Windows shim `tools/dev/js-scan.cmd`.
2. **Scanner Infrastructure** – Build `tools/dev/js-scan/shared/` modules (`scanner`, `fileContext`, `filters`, `ranker`) that traverse directories, parse files via `@swc/core`, and emit `FileRecord`/`FunctionRecord` objects using `computeHash` from `tools/dev/lib/swcAst.js`.
3. **Operations (Phase 1 scope)** – Implement `operations/search.js`, `hashLookup.js`, `indexing.js`, and `patterns.js` following the design proposal (multi-term search, relevance ranking, hash lookup with collision warnings, module index, pattern filters).
4. **CLI Wiring & Guidance** – Connect CLI options to operations, enforce defaults (200-line cap, 20 match limit), and emit guidance payloads when results overflow or relevance is low.
5. **Docs & Agent Integration** – Produce `tools/dev/js-scan-README.md` and update `.github/agents/Careful js-edit refactor.agent.md` after MVP stabilization (tracked as subtask).

### Risks & Unknowns
- **Performance:** Full `src/` scans may exceed 5 seconds; mitigate with whitelisting, parallelism caps, and skip-on-error fallbacks.
- **AST Edge Cases:** Non-standard syntax (decorators, optional chaining in legacy swc config) may fail parsing; plan to skip with warning and log for follow-up.
- **Guidance Noise:** Heuristic suggestions could mislead agents; tune thresholds during validation and document limitations.

### Integration Points
- `tools/dev/lib/swcAst.js` for hashing/span normalization (read-only reuse).
- `src/utils/CliFormatter.js` and `CliArgumentParser.js` for consistent CLI ergonomics.
- Shared fixtures under `tests/fixtures/tools/` for multi-file scanning scenarios.

### Focused Test Plan
- Jest unit tests (`tests/tools/__tests__/js-scan.test.js`) covering search ranking, hash lookup parity with js-edit, module index aggregation, and pattern filters.
- CLI smoke tests against `src/` to confirm guidance messaging and performance budgets.
- Snapshot/fixture verification for compact vs. JSON output via existing CLI test utilities.

### Rollback Plan
- Work is additive. If regressions appear, delete new `tools/dev/js-scan*` modules, associated tests, docs, and revert npm script entries. Existing tooling remains unaffected.

### Task Ledger
| Task | Status | Notes |
|------|--------|-------|
| 1. CLI skeleton & parser wiring | completed | 2025-11-15: `tools/dev/js-scan.js` wired with CliArgumentParser, guidance-aware text/JSON output. |
| 2. Shared scanner infrastructure | completed | 2025-11-15: Added `shared/scanner.js` + `lib/fileContext.js` for SWC parsing, metadata normalization, and dependency capture. |
| 3. Search operation implementation | completed | 2025-11-15: Implemented `operations/search.js` with scoring, filters, and guidance triggers. |
| 4. Hash lookup implementation | completed | 2025-11-15: Added `operations/hashLookup.js` with collision detection and hash metadata. |
| 5. Module index implementation | completed | 2025-11-15: Added `operations/indexing.js` summarizing exports/functions/entry points. |
| 6. Pattern matching implementation | completed | 2025-11-15: Added `operations/patterns.js` supporting glob/regex discovery with filters. |
| 7. Guidance & output integration | completed | 2025-11-15: Introduced `shared/guidance.js`, text printer, and hash-only output option. |
| 8. Tests & fixtures | completed | 2025-11-15: Created `tests/tools/__tests__/js-scan.test.js` covering search, hash lookup, patterns, and index. |
| 9. Documentation updates | completed | 2025-11-15: Documented js-scan usage in `tools/dev/README.md`. |
| 10. Deprecated filtering & bundled excludes | in-progress | 2025-11-15: Add default skips for deprecated assets plus CLI overrides (`--include-deprecated`, `--deprecated-only`). |

---

## 📋 Future js-edit Enhancements

**Core modularization complete (Nov 6, 2025)**. Discovery filters and new commands implemented. **Documentation and testing complete (Nov 6, 2025)**.

**Completed (Nov 6, 2025):**
- **Task 7.11**: `--match` / `--exclude` discovery filters — Glob pattern support (*, ?, **) for scoped symbol listing ✅
- **Task 7.7**: `--snipe <position>` command — Quick symbol lookup at line:col or byte offset ✅
- **Task 7.8**: `--outline` command — Top-level symbol outline with compact table format ✅
- **Task 7.10**: `--preview-edit` flag — Unified diff replacement preview with context lines ✅
- **Task 9.4**: `--list-constructors` command — Constructor inventory with hash display ✅
- **Documentation**: tools/dev/README.md updated with comprehensive examples for all new commands ✅
- **Testing**: Added 6 test suites with 20+ tests covering discovery filters, position parsing, outline, unified diff, and constructor listing ✅

See `docs/archives/CHANGE_PLAN_HISTORY.md` for complete js-edit CLI modularization details.

---

## 🔄 Active Initiative (Nov 4, 2025): Crawl High-Level Facade

### Goal / Non-Goals
- **Goal:** Introduce a small, composable crawl scripting surface (`CrawlOperations`) that wraps the monolithic `NewsCrawler`, enabling high-level operations such as `ensureCountryHubs`, `exploreCountryHubs`, `crawlCountryHubHistory`, and hub/topic discovery sequences without duplicating crawl internals.
- **Non-Goals:** No changes to the internal crawl engine (`NewsCrawler`) beyond wiring through configuration; no new database schema or background task integration; defer intelligent crawl refactors that require planner redesign.

### Current Behavior (Baseline)
- Crawl orchestration resides entirely in `src/crawl.js`, mixing CLI parsing, option normalization, and crawler construction.
- High-level workflows (country hub passes, topic hub exploration) are scattered across configuration flags (`countryHubExclusiveMode`, `structureOnly`, intelligent planner toggles) with no shared façade.
- Scripting a sequence currently requires manual instantiation of `NewsCrawler` and careful option coordination per run.

### Refactor & Modularization Plan

**Phase 1 – CrawlOperations Facade (delivered 2025-11-04)**
1. **Task 1.1 – Plan Alignment:** Update this document and create `docs/CRAWL_REFACTORING_TASKS.md` (✅ tasks doc created) to track crawl facade work; ensure risks/tests enumerated prior to implementation.
2. **Task 1.2 – CrawlOperations Facade:** Author `src/crawler/CrawlOperations.js` exporting a class that encapsulates shared defaults, lifecycle hooks (instantiate → crawl → capture stats), and structured result emission.
3. **Task 1.3 – Operation Registry & Sequencing:** Implement named operations (`ensureCountryHubs`, `exploreCountryHubs`, `crawlCountryHubHistory`, `crawlCountryHubsHistory`, `findTopicHubs`, `findPlaceAndTopicHubs`) with documented option mapping plus an `executeSequence` helper for simple algorithms.
4. **Task 1.4 – Focused Tests:** Add unit tests in `src/crawler/__tests__/CrawlOperations.test.js` covering option translation, sequence execution ordering, and error propagation without invoking real network fetches (use mocks/stubs for `NewsCrawler`).
5. **Task 1.5 – Documentation:** Record usage examples and sequencing patterns in the developer docs (appendix in `docs/CLI_REFACTORING_QUICK_START.md` or new note under crawler architecture).

**Phase 2 – Sequence Orchestration & CLI Integration** ✅ **COMPLETE (2025-11-12)**
1. **Task 2.1 – Discovery & Alignment:** ✅ Inventory existing crawl orchestration touchpoints complete.
2. **Task 2.2 – Sequence Library:** ✅ Reusable sequence presets implemented in `src/crawler/operations/sequencePresets.js` with 5 workflows (ensureCountryStructure, ensureAndExploreCountryHubs, fullCountryHubDiscovery, countryHubHistoryRefresh, resilientCountryExploration). All 3 unit tests passing.
3. **Task 2.3 – CLI Entry Surface:** ✅ CLI tool `src/tools/crawl-operations.js` fully functional with --list-operations, --list-sequences, --operation, --sequence execution. Supports ASCII and JSON output formats. Extended with --db-path flag for playbook integration.
4. **Task 2.4 – Configuration & Playbook Hooks:** ✅ COMPLETED 2025-11-12. Two-part implementation:
   - **Part A (sequenceContext.js):** SequenceContextAdapter for CrawlPlaybookService integration. Provides resolveStartUrl, getRetryStrategy, shouldAvoidUrl, getPlaybookHints, suggestSequencePreset. All 18 unit tests passing.
   - **Part B (SequenceConfigLoader):** Configuration-as-code system for loading declarative YAML/JSON sequence configs with token resolution (@playbook/@config/@cli namespaces). Modules: SequenceConfigLoader.js (347 lines), SequenceConfigRunner.js (178 lines), createSequenceResolvers.js (235 lines), sequenceResolverCatalog.js (26 lines). All 11 unit tests passing (SequenceConfigLoader: 6, SequenceConfigRunner: 3, createSequenceResolvers: 2). Integration: NewsCrawler.loadAndRunSequence static method. Config directory: config/crawl-sequences/ with README.md.
5. **Task 2.5 – Tests & Documentation:** ✅ Test coverage complete (sequencePresets: 3/3, sequenceContext: 18/18, sequence config: 11/11). Documentation updated in CLI_REFACTORING_TASKS.md, CHANGE_PLAN.md, and ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md (added Sequence Config System section with usage examples and validation commands). Created PHASE_2_CRAWL_FACADE_IMPLEMENTATION_PLAN.md as detailed planning document.

**Phase 3 – Legacy Crawl CLI Modularization (✅ COMPLETED November 17, 2025)**

**Status:** All 6 tasks completed with 90/90 tests passing and comprehensive documentation updated.

**Deliverables:**

- `src/crawler/cli/bootstrap.js` (53 lines): Environment setup with verbose mode, console interception, global flag management
- `src/crawler/cli/argumentNormalizer.js` (748 lines): Normalizes 30+ CLI flags including sequence config parsing, database path resolution
- `src/crawler/cli/progressReporter.js` (312 lines): CLI logger factory, geography progress formatting, color/icon constants
- `src/crawler/cli/progressAdapter.js`: TELEMETRY/MILESTONE/PROGRESS event routing and console interception
- `src/crawler/cli/runLegacyCommand.js` (373 lines): Orchestration layer composing bootstrap/normalizer/reporter, handles --help, manages crawler lifecycle
- `src/crawl.js` (35 lines): Thin shim delegating to runLegacyCommand with legacy exports preserved

**Test Coverage:**
- `bootstrap.test.js`: 9/9 tests (verbose mode, console interception, teardown, global flag handling)
- `argumentNormalizer.test.js`: 3/3 tests (sequence config parsing, geography defaults, JSON validation)
- `progressReporter.test.js`: 58/58 tests (logger methods, formatGeographyProgress, verbose mode, color/icon constants)
- `runLegacyCommand.test.js`: 20/20 tests (orchestration, help flag, exit codes, sequence execution, error handling)
- **Total:** 90/90 tests passing

**Validation:**
```bash
# CLI smoke test
node src/crawl.js --help  # ✅ Working

# Full test suite
npx jest --config jest.careful.config.js src/crawler/cli/__tests__/ --bail=1 --maxWorkers=50%
# Output: 90/90 tests passing
```

**Documentation:**
- `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`: Added CLI Module Architecture section with module structure table, workflow examples, rationale, and validation commands
- `docs/CRAWL_REFACTORING_TASKS.md`: Updated Task 3.5 status to completed with test counts and deliverables

**Rationale:**
- **Testability**: Each module tested in isolation with mocked dependencies
- **Reusability**: CLI logger, argument normalization, progress formatting available to other entry points
- **Maintainability**: Clear separation of concerns (bootstrap handles environment, normalizer handles flags, reporter handles output, orchestrator composes)
- **Backward Compatibility**: Existing `node src/crawl.js` usage unchanged; legacy export structure preserved

**Phase 3 – Legacy Crawl CLI Modularization (planned before completion)**
1. **Task 3.1 – Bootstrap Extraction:** Break the top-level CLI bootstrap in `src/crawl.js` into a dedicated module (`src/crawler/cli/bootstrap.js`) that wires environment setup, logging, and graceful shutdown while delegating crawl execution to `CrawlOperations`.
2. **Task 3.2 – Argument Normalization Module:** Move the legacy option parsing/normalization logic into a reusable adapter (`src/crawler/cli/argumentNormalizer.js`) that can translate existing flags into façade-friendly operation/preset invocations. Ensure backward compatibility for scripts relying on current flags.
3. **Task 3.3 – Progress & Telemetry Stream Adapter:** Extract streaming progress reporting and telemetry hooks into `src/crawler/cli/progressReporter.js`, allowing both the legacy CLI and new entry surface to share consistent output without inflating the façade.
4. **Task 3.4 – Legacy Command Shims:** Rebuild `src/crawl.js` as a thin shim that composes the extracted modules, retains legacy command aliases, and internally routes to the new CLI entry surface. Provide migration helpers so future callers can pivot to `crawl-operations` directly.
5. **Task 3.5 – Tests & Documentation:** Author focused tests covering argument normalization, bootstrap lifecycle, and telemetry wiring; update docs (architecture + CLI quick start) to describe the modular CLI stack and deprecation path for direct `src/crawl.js` usage.
6. **Circular dependency cleanup (Task 3.6):**
  - Break the runtime cycle between `ArticleOperations.js` and the v1 index by removing the unused `ensureDatabase` import (or routing it through `./connection` if future helpers require it).
  - Verify that no other module reintroduces the circular path; add regression coverage via an isolated require smoke test (CLI help invocation is sufficient).
  - Update adapter documentation with the resolved architecture and record the removal of the warning in the progress tracker.

#### 4. Risks & Mitigations
- **Flag parity regressions:** Maintain exhaustive mapping table in normalizer; add Jest snapshot ensuring CLI help enumerates every known flag/alias.
- **Lifecycle leaks:** Bootstrap must dispose services (playbook cache, enhanced DB adapters). Add `finally` handler in `runLegacyCli` to call `.close()`/`.dispose()` on services from factory module.
- **Geography crawl coverage:** Some geography/gazetteer flows may remain beyond facade scope. Plan allows normalizer to return “raw” mode telling bootstrap to use existing `NewsCrawler` pipeline without refactor.
- **Test runtime:** CLI modules should be pure/async without requiring heavy DB connections for unit tests. Provide injection points for mocks to keep tests fast.

#### 5. Focused Test Plan (Phase 3)
- Parser/normalizer tests via `npx jest --config jest.careful.config.js --runTestsByPath src/crawler/cli/__tests__/argumentNormalizer.test.js`.
- Progress reporter snapshot tests verifying icon/color output (guarded for non-TTY scenarios).
- Smoke harness that runs `runLegacyCli` with stubbed services to ensure `CrawlOperations` is invoked for default Guardian crawl.
- Legacy shim test verifying `require.main === module` still launches bootstrap.

#### 6. Rollback Strategy
- Because `src/crawl.js` becomes a thin shim, rollback is achieved by re-linking to previous monolithic file (keep copy under `legacy/` during transition).
- New modules are additive; if issues arise post-refactor, revert commits introducing `src/crawler/cli/*` and restore original `src/crawl.js` from history.

### Detailed Design — Phase 2 (authored 2025-11-04)

#### 1. Current Code Topology (ground-truth from repository)
- `src/crawler/CrawlOperations.js` (114 non-empty LOC, 5 public methods after 2025-11-04 refactor) now acts purely as an orchestration façade. It instantiates:
  - A map of `CrawlOperation` subclasses (`operations/index.js`) and registers them via `_registerOperations`, attaching dynamic shortcut methods (e.g., `ensureCountryHubs`) that call the internal `_runOperation` helper.
  - A js-edit-first orchestration runner now lives in `src/orchestration/SequenceRunner.js` (introduced 2025-11-04). It accepts normalized configs, resolves façade operations, emits telemetry callbacks, and aggregates results with continue-on-error handling.
  - A lazily constructed crawler factory (`loadNewsCrawler()` inside `src/crawl.js`) to avoid ESM import timing issues observed pre-refactor.
- `src/crawler/operations/CrawlOperation.js` defines the new base class with option-merging, lifecycle timing, logging, and cleanup semantics. Concrete operation subclasses (six files under `src/crawler/operations/`) only supply `name`, `summary`, and preset defaults.
- `src/orchestration/SequenceRunner.js` encapsulates the sequence execution loop, merges shared/step overrides, enforces start URL requirements, and surfaces telemetry hooks (`onSequenceStart`, `onStepEvent`, `onSequenceComplete`). Focused tests live in `src/orchestration/__tests__/SequenceRunner.test.js`, covering override merging, abort/continue cases, and invalid configuration handling.
- `src/crawl.js` remains a 3,400+ line CLI monolith combining argument parsing, progress reporting, crawler instantiation, and intelligent planner wiring. It does not currently consume `CrawlOperations`.
- `src/crawler/CrawlPlaybookService.js` (1,100+ LOC) manages domain-specific knowledge, retries, and avoidance; future host-aware presets must integrate without duplicating its logic.
- Test coverage: `src/crawler/__tests__/CrawlOperations.test.js` stubs the crawler factory and exercises option merging and sequencing. No tests exist for individual operation subclasses or the sequence runner in isolation.
- Conciseness governance: `tools/analyze-crawl-operations.js` leverages `operations/concisenessMetrics.js` to enforce thresholds (≤120 non-empty LOC, ≤8 public methods) on the façade. Iteration log captured in `docs/CRAWL_REFACTORING_TASKS.md` shows two passes to reach compliance.

#### 2. Design Goals for Phase 2
1. **Modular sequencing:** External callers should be able to request domain-specific crawl algorithms (ensure → explore → topic discovery, history refresh bundles, etc.) with a descriptive identifier rather than manually scripting steps.
2. **Host-aware defaults:** Sequences must optionally derive parameters (start URLs, planner verbosity, hub limits) from playbooks or configuration without bloating the façade.
3. **CLI parity:** A lightweight entry surface should expose the new façade so operators and automation can trigger operations/sequences without interacting with `src/crawl.js` directly.
4. **Telemetry continuity:** Result payloads should remain consistent with current `CrawlOperations` responses to preserve downstream logging and tooling expectations.
5. **Conciseness preservation:** Future changes must keep `CrawlOperations` within conciseness thresholds by relocating additional behavior to dedicated modules.

#### 3. Proposed Architecture
1. **Sequence Preset Registry (`src/crawler/operations/sequencePresets.js`):**
  - Export a catalog of named sequences (`ensureCountryStructure`, `countryExploration`, `historyRefresh`, `topicDiscovery`, etc.) describing ordered steps, default start URL resolution strategy, shared overrides, and whether failures should abort.
  - Provide a `resolveSequence(name, context)` helper returning the normalized array accepted by `createSequenceRunner`. Context includes `startUrl`, `domain`, `playbook`, and operator-supplied overrides.
  - Preserve JSON-serializable metadata so the CLI can show human-readable descriptions and preflight output.
2. **Playbook Integration Adapter (`src/crawler/operations/sequenceContext.js`):**
  - Encapsulate optional lookups into `CrawlPlaybookService` to obtain domain-specific hints (canonical start URLs, preferred planner verbosity, retry budgets).
  - Fall back to user-provided overrides or façade defaults when playbook data is unavailable, ensuring deterministic behavior for new domains.
  - Provide explicit async hooks so long-running lookups (e.g., database reads) are centralized and mockable for tests.
3. **CLI Surface (`src/tools/crawl-operations.js`):**
  - Follow established patterns from other refactored CLIs (`CliArgumentParser`, `CliFormatter`).
  - Support commands such as `crawl-operations run <operation>` and `crawl-operations sequence <name>` with `--start-url`, `--continue-on-error`, and `--overrides key=value` options.
  - Offer `--list` to enumerate available operations and sequences using metadata from the registry.
  - Optionally integrate with `testlogs` tooling by emitting structured JSON summaries identical to `CrawlOperations` responses.
4. **Configuration-as-Code Assets (`config/crawl-sequences/`):**
  - Store first-class sequence definitions in YAML (primary) with JSON parity, allowing pull-request review of crawl strategies.
  - Define a schema (`docs/crawl-sequence.schema.json`) capturing required fields (id, description, steps[], per-step overrides, retry policy) and ship a validator helper `validateSequenceConfig.js`.
  - Loader module (`src/orchestration/SequenceConfigLoader.js`) merges on-disk configs with built-in presets, supports per-host overrides, and exposes deterministic hashing for change tracking.
  - Support a companion "simple commands" format: JSON files containing a bare array of command strings (e.g., `["ensurePlaceHubs", "exploreCountryHubs"]`) executed sequentially with no additional metadata. Loader translates each string into the corresponding operation shortcut.
  - CLI accepts `--sequence-config <path>` (defaults to repo config directory) and `--sequence <id>` to select entries; facade registry reads from loader rather than hard-coded arrays. Simple JSON arrays live under `config/crawl-sequences/simple/*.json` and reuse the same loader code path.
  - Document a forward-looking AST upgrade path that will eventually replace plain strings with structured nodes; maintain a lightweight design log describing required syntax, validation, and migration helpers before implementation begins.
5. **Automation Hooks:**
  - Provide a thin wrapper in `src/background/tasks/` (future Task 2.4) that calls the façade with resolved sequence presets, enabling scheduled crawls without invoking `src/crawl.js`.
6. **Testing Strategy:**
  - Add unit tests for `sequencePresets` (ensuring normalization outputs expected operations and overrides) and `createSequenceRunner` edge cases (continue-on-error, per-step start URL overrides).
  - Extend `CrawlOperations` tests to cover dynamic method shortcuts (e.g., registering a new operation at runtime) and sequence presets integration.

#### 4. Implementation Phases & Responsibilities
1. **Phase 2.A – Sequence Registry Foundations**
  - Implement `sequencePresets.js` with initial presets mirroring user-requested flows.
  - Add tests verifying that resolved sequences produce deterministic normalized entries and preserve overrides.
  - Update `CrawlOperations` with a `runSequencePreset(name, context)` helper delegating to the registry + `createSequenceRunner` bridge.
  - Keep façade concise by storing registry logic outside the class.
2. **Phase 2.B – Playbook Context Adapter**
  - Author `sequenceContext.js` to fetch playbook data (using existing `CrawlPlaybookService` APIs) and merge results with user overrides.
  - Inject adapter into façade via constructor injection to keep dependencies explicit for tests.
  - Provide fallbacks when playbook service is unavailable (e.g., when façade used in unit tests with stubbed crawler factory).
3. **Phase 2.C – CLI Entry Point**
  - Create `src/tools/crawl-operations.js` aligning with repo’s CLI conventions (parser↔formatter, JSON output, `--quiet` support).
  - Add smoke tests or harness script verifying CLI command outputs for a stubbed crawler factory.
  - Document usage in `docs/CLI_REFACTORING_QUICK_START.md` and `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` (append the CLI command list).
4. **Phase 2.D – Configuration-as-Code Enablement**
  - Author `sequenceConfigLoader.js`, YAML parser helpers (leveraging `js-yaml` already in repo or adding minimal dependency), and schema validator using `ajv` (already present) with positive/negative fixture coverage. **Status:** `src/orchestration/SequenceConfigLoader.js` landed 2025-11-12 with resolver diagnostics, checksum metadata, and Jest coverage.
  - Migrate default presets into version-controlled YAML files (`config/crawl-sequences/*.yaml`) and ensure loader injects them into the registry at runtime.
  - Extend CLI to accept `--sequence-config`, `--sequence`, and `--list-configs`, with help output describing config workflows and conflict resolution (config overrides registry entries by id). Include loaders for both YAML objects and the simple JSON array command format, with shared validation hooks.
  - Update documentation (`docs/CRAWL_REFACTORING_TASKS.md`, CLI quick start) with config editing workflow, validation command (`node src/tools/crawl-operations.js validate --sequence-config …`), and review checklist for config changes. Add examples covering the minimal JSON array syntax.
5. **Phase 2.E – Command AST Design (Planning Only)**
  - Draft an AST design brief (`docs/crawl-sequence-command-ast.md` placeholder) describing node types, command metadata, and backward-compatibility strategy for plain string scripts.
  - Capture parser requirements (naming rules, argument handling, conditionals) and identify validation rules that would benefit from structured nodes.
  - Defer runtime changes until the simple format hits feature limits; keep the loader emitting warning telemetry when commands require richer metadata so we know when to prioritize implementation.
6. **Phase 2.F – Automation Hook (Optional follow-up)**
  - Implement background task wrapper once CLI proves stable, ensuring proper telemetry and status propagation.

#### 5. Conciseness Review Process (codified)
1. **Metric enforcement:** Continue running `node tools/analyze-crawl-operations.js` after each Phase 2 change. The script now emits method names when thresholds are violated, aiding rapid identification of responsibilities to extract.
2. **Iteration protocol:**
  - Capture metric outputs in `docs/CRAWL_REFACTORING_TASKS.md` for each iteration.
  - When thresholds fail, identify offending functionality (e.g., new helper method inside façade) and migrate it to a dedicated module before moving on.
3. **Qualitative audit:** As part of Task 2.5, perform a manual pass ensuring the façade only handles dependency injection, registration, and orchestration delegation.

#### 6. Open Questions & Risks
- **Playbook latency:** Synchronous sequence execution could be delayed if playbook lookups require database access. Mitigation: make context adapter optional or async with caching.
- **CLI vs legacy crawl CLI:** Need a decision on whether to wrap `src/crawl.js` or deprecate parts of it once new CLI stabilizes. For now, they will coexist; documentation should clarify when to use each.
- **Testing scope:** Integration tests for CLI may require additional test harness utilities (similar to other CLI tools). Evaluate reusing existing CLI snapshot utilities from prior refactors.

### Cross-model Collaboration Notes
- Annotate this plan when another AI model contributes (e.g., “Operation presets updated by Model B on 2025-11-05”) so future implementers know whose guidance shaped the sequence design.
- If external reviewers disagree on façade boundaries or CLI exposure, summarize each position here and outline the reconciliation strategy before coding.

**Grok's Review (November 4, 2025):** This facade is a crucial step toward taming the `NewsCrawler` monolith. To maximize its impact, I suggest the following:
1.  **Dynamic Operation Loading**: Instead of a static registry, consider a dynamic loading mechanism for crawl operations. This would allow new operations to be added as plugins without modifying the core facade, improving extensibility.
2.  **Configuration-as-Code**: For complex sequences, allow passing a configuration file (e.g., YAML or JSON) that defines the steps, parameters, and error handling policies. This would make complex workflows more readable and manageable than long command-line arguments.
3.  **Transactional Semantics**: For sequences of operations, consider adding transactional semantics. If one step fails, the system could be configured to roll back any database changes made by previous steps in the sequence to ensure data consistency.
4.  **Stateful Operations**: Clarify the strategy for managing state between operations in a sequence. The facade should explicitly handle passing context (e.g., discovered hubs from one step to the next) to avoid implicit dependencies and make sequences easier to reason about.

**Grok's Expanded Workflow Review (November 4, 2025):** To get a lot of work done in few phases, adopt a "phase-collapsing" strategy that merges Phase 1 (facade) and Phase 2 (sequence orchestration) into a unified implementation sprint. Begin with a rapid prototype of the facade and sequence runner using existing `CrawlOperations` as a foundation, then immediately extend it with playbook integration and CLI surface in sequence. Use the detailed design as a blueprint to execute all three phases (1, 2, 3) in sequence without pausing for separate validation gates—run smoke tests after each major component (facade, sequences, CLI) but defer full integration testing until the end. This reduces the timeline from 3 separate phases to 1 intensive development cycle, with daily commits and mid-phase reviews to catch integration issues early. Document the merged workflow in the tracker to enable future replication.

**Google Gemini Pro 2.5 Review (November 4, 2025):** Proposed treating crawl orchestration as configuration-as-code so sequence definitions can live in dedicated config files instead of hard-coded registries. Recommended supporting YAML/JSON inputs, validator tooling, and change-reviewable presets for operations, enabling non-code contributors to adjust crawl strategies safely.

### Risks & Mitigations
- **Implicit option coupling:** Incorrect mapping could change crawl behavior. *Mitigation:* Unit tests assert option payloads passed into stubbed `NewsCrawler` constructor + `crawl` invocation.
- **Resource cleanup:** Facade must respect `NewsCrawler` lifecycle (close DB adapters). *Mitigation:* ensure facade awaits `crawl()` and calls optional `dispose`/`close` hooks when exposed; add finally blocks.
- **Future expansion pressure:** Too-rigid operation signatures could block future planner enhancements. *Mitigation:* Accept per-operation overrides via options bag, document extension points.

### Focused Test Plan
- Jest unit suite: `npx jest --config jest.careful.config.js --runTestsByPath src/crawler/__tests__/CrawlOperations.test.js --bail=1 --maxWorkers=50%`.
- Optional smoke harness: instantiate facade with stub `NewsCrawler` in test verifying sequence statuses.

### Rollback Plan
- Facade is additive: remove `src/crawler/CrawlOperations.js`, delete associated tests/docs, and purge new exports if issues arise. Existing CLI entrypoint remains untouched.

### Refactor Index (Planned)
- `src/crawler/CrawlOperations.js` (facade orchestration)
- `src/crawler/operations/` (base + concrete operations, sequence runner, presets, facade utils)
- `src/crawler/operations/__tests__/sequencePresets.test.js` (new)
- `src/crawler/__tests__/CrawlOperations.test.js` (updated)
- `docs/CRAWL_REFACTORING_TASKS.md` (tracker updates)
- Developer docs (usage section to be determined)

---

## 🔄 Active Initiative (Nov 4, 2025): NewsCrawler Modularization

### Goal / Non-Goals
- **Goal:** Decompose `src/crawler/NewsCrawler.js` into clear layers by introducing a reusable `Crawler` base class that encapsulates shared crawl lifecycle mechanics (startup, queue/telemetry wiring, worker orchestration) while trimming the `NewsCrawler` subclass down to news-specific orchestration, planner hooks, and enhanced feature glue.
- **Non-Goals:** Do not rework planner algorithms, enhanced feature services, or gazetteer ingestion logic beyond extracting shared lifecycle scaffolding. Avoid altering crawl CLI entry points until the base class lands and proves stable.

### Current Behavior (Baseline)
- `NewsCrawler.js` spans 2,300+ LOC, instantiating every helper/service inline and mixing base infrastructure (queue setup, telemetry, throttling) with domain-specific heuristics and gazetteer pipelines.
- Shared crawl concerns such as startup sequencing, telemetry progress emission, queue/worker orchestration, and abort/pause handling are tightly coupled to the news implementation, making other crawler variants difficult to author.
- Gazetteer mode controllers, planners, and enhanced features are constructed inside the constructor, leading to sprawling dependency wiring and limited test seams.

### Refactor & Modularization Plan
1. **Task 10.1 – Discovery & plan refresh** *(α discovery → β planning, in-progress)*
  - Catalogue crawl lifecycle phases, identify components that can migrate to a base `Crawler` class (state, telemetry, queue/worker setup), and capture risks in this plan.
  - Inventory documentation (`AGENTS.md` Topic Index, `.github/instructions/GitHub Copilot.instructions.md`, `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`, `docs/CRAWL_REFACTORING_TASKS.md`) and tooling (js-edit commands, crawl analyzers) that will guide the refactor; record consulted sources in the tracker.
  - Produce module extraction targets and guardrails (e.g., keep gazetteer overrides pluggable) before implementation.
2. **Task 10.2 – Introduce `Crawler` base class** *(γ implementation)*
  - Extract shared lifecycle logic (option schema handling, startup stages, queue/worker orchestration, telemetry hooks, pause/abort control) into a new module under `src/crawler/core/`.
  - Ensure the base class exposes overridable hooks for domain-specific components (link extractor factories, planner toggles, enhanced feature providers) consumed by `NewsCrawler`.
  - Guard edits with js-edit plan emission + hashes to keep diff focused and reversible.
3. **Task 10.3 – Refine `NewsCrawler` subclass** *(γ implementation)*
  - Rebuild `NewsCrawler.js` as a subclass (or composition wrapper) that configures services via the base class hooks, highlighting high-level orchestration methods and delegating shared behavior.
  - Move bulky helper setup (gazetteer pipelines, enhanced features) into dedicated modules where appropriate, keeping `NewsCrawler` within conciseness targets.
4. **Task 10.4 – Documentation & tracker updates** *(δ validation)*
  - Update this plan, `docs/CLI_REFACTORING_TASKS.md`, and relevant architecture docs (`AGENTS.md`, `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`) to explain the new class hierarchy and integration points for future crawler variants.
  - Note any new tooling or js-edit guard patterns surfaced during implementation.
5. **Task 10.5 – Focused validation** *(δ validation)*
  - Run targeted Jest/CLI smoke tests covering crawler initialization paths (standard crawl, gazetteer mode, intelligent planner) using `jest.careful.config.js` with scoped `--runTestsByPath` invocations or CLI harnesses.
  - Capture command outputs and residual risks (e.g., optional feature regressions) in the tracker.

### Cross-model Collaboration Notes
- **Grok’s Review (2025-11-04):**
  - **Prioritize Dependency Injection over a Base Class:** While a `Crawler` base class can centralize some logic, it can also lead to rigid inheritance hierarchies. A more flexible approach is to favor composition and dependency injection. Instead of `NewsCrawler` extending `Crawler`, it could be composed of smaller, focused services (e.g., `QueueManager`, `LifecycleManager`, `PlannerService`). This makes it easier to swap implementations, test components in isolation, and avoid the "god object" problem where the base class accumulates too much responsibility.
  - **Define a Clear Service Contract:** Before extracting, define clear interfaces or "contracts" for the services that `NewsCrawler` will consume. For example, a `PlannerService` contract would define methods like `getIntelligentPlan()` and `updateKnowledge()`. This ensures that as you refactor, the new modules adhere to a predictable structure, making them interchangeable and easier to reason about.
  - **Extract Services Incrementally:** Don't try to extract all 30+ collaborators at once. Start with the most self-contained ones, like `DomainThrottleManager` or the telemetry service. For each service:
    1. Define its interface.
    2. Create a new module for the service.
    3. Move the related logic from `NewsCrawler` to the new service.
    4. Inject the new service into `NewsCrawler`'s constructor.
    5. Run focused tests to ensure no regressions.
  - **Use Adapters for External Dependencies:** For external dependencies like the database or telemetry systems, ensure they are accessed through an adapter layer. This isolates the core crawler logic from the specifics of the implementation (e.g., `better-sqlite3`), making future migrations or changes much simpler. The plan mentions this for optional features, but it should be a core principle for all external interactions.
  - **Consider a `CrawlerFactory`:** Instead of a complex constructor, a `CrawlerFactory` can be responsible for assembling the `NewsCrawler` instance with all its dependencies. This centralizes the complex wiring logic and makes the creation of different crawler configurations more manageable.

**Grok's Expanded Workflow Review (November 4, 2025):** To accomplish substantial modularization in minimal phases, employ a "service-first extraction" workflow that prioritizes dependency injection from the outset. Phase 1 becomes a rapid service identification and interface definition sprint, where you analyze the 30+ collaborators and define contracts for the top 5-7 most extractable services (e.g., `QueueManager`, `TelemetryService`, `PlannerService`). Phase 2 merges implementation and subclass refinement into a single batch operation: extract services incrementally using js-edit's --emit-plan for multi-file changes, inject them into `NewsCrawler`, and run focused tests after each extraction. This collapses the original 5 phases into 3: (1) Service Contract Definition, (2) Incremental Extraction & Injection, (3) Unified Validation. Use the living tracker to maintain momentum, with daily check-ins to ensure each service extraction is complete and tested before moving to the next, enabling a high-throughput refactoring cycle that delivers modular code without prolonged phase boundaries.
- Reserve space in this section to capture insights from other AI reviewers (e.g., proposals for base-class API shape or telemetry hooks) before implementation begins.
- When external feedback shifts priorities, annotate the task ledger with the reviewer’s name/model and adjust dependent risks or validation steps accordingly.

### Discovery Highlights (2025-11-04, updated 2025-11-06)
- js-edit function inventory confirms `NewsCrawler` hosts 137 total functions (95 match crawl-related patterns), with major clusters around initialization (`init`, `_trackStartupStage`), queue orchestration (`enqueueRequest`, `_ensureWorkerRunner`, `_ensureIntelligentPlanRunner`), and lifecycle control (`crawl`, `crawlConcurrent`, `pause`/`resume`/`requestAbort`).
- **Key lifecycle orchestration methods** (via js-edit `--list-functions --match "*crawl*"`):
  - Entry points: `crawl` (line 2430, hash mYu6SUwk), `crawlConcurrent` (line 2045, hash KkWB5dDx)
  - Sequence runners: `_runCrawlSequence` (line 2231, hash KmP5miW8), `_buildStartupSequence` (line 2190, hash rSq25hHV), `_shouldUseSequenceRunner` (line 2103)
  - Startup stages: `init` (line 1471, hash iZknrztb), `_trackStartupStage` (line 1658, hash 7dHBgms2), `_emitStartupProgress` (line 1635, hash +uSC2HoE), `_markStartupComplete` (line 1738, hash JX4cxmVk)
  - Worker orchestration: `_ensureWorkerRunner` (line 1975, hash yQnnbB0K), `_ensureIntelligentPlanRunner` (line 2003, hash F2p+Wlzn), `_runConcurrentWorkers` (line 2375, hash Rmb4bNIe), `_runSequentialLoop` (line 2309, hash egfyrr9r)
  - Finalization: `_finalizeRun` (line 2385, hash tTOEeMTS)
- Constructor currently binds 30+ collaborators directly (telemetry, queue manager, robots coordinator, fetch pipeline, planners, gazetteer controllers) and performs option schema validation, state initialization, agent setup, and enhanced feature wiring inline.
- **Extractable to base class:** Startup stage tracking, telemetry emission, queue/worker orchestration scaffolding, pause/abort control, rate limiting primitives.
- **Keep in NewsCrawler subclass:** Gazetteer mode controllers, intelligent planner integration, enhanced features wiring, news-specific priority computation.
- **js-edit readiness:** All key methods have stable hashes and are replaceable, enabling guarded extractions during Task 10.2/10.3.

### Risks & Mitigations
- **Regression risk from constructor extraction:** Shared lifecycle logic must preserve ordering and feature toggles. *Mitigation:* Maintain exhaustive js-edit plans, migrate helpers incrementally, and run focused crawls/CLI smoke tests after each milestone.
- **Gazetteer mode divergence:** Gazetteer flows rely on sequential processing and special defaults. *Mitigation:* Ensure base class exposes hooks for mode-specific overrides and retain gazetteer-specific configuration in `NewsCrawler`.
- **Enhanced feature coupling:** Optional services (EnhancedDatabaseAdapter, PlannerKnowledgeService) may assume direct access to `NewsCrawler`. *Mitigation:* Introduce dependency injection hooks when moving logic so optional features remain pluggable.
- **Test gaps:** Existing coverage relies on integration behavior. *Mitigation:* Add smoke harnesses for the base class if necessary and document residual risks until broader tests are authored.

### Focused Validation Plan
- During Task 10.2/10.3, execute scoped Jest suites (`src/crawler/__tests__/CrawlOperations.test.js`, gazetteer runner smoke tests if available) and CLI dry runs (`node src/crawl.js --help`, `node src/crawl.js https://example.com --limit 0 --json`) to ensure initialization remains stable.
- Confirm telemetry/queue events continue emitting by inspecting sample crawl logs or leveraging existing analyzer scripts.

### Rollback Plan
- Keep the new `Crawler` base class additive until `NewsCrawler` is successfully migrated. If regressions arise, revert the subclass refactor to the original monolith while retaining planning notes.
- Preserve git commits in logical chunks (base class introduction separate from subclass rewiring) to ease rollback.

### Task Ledger (mirrors `docs/CLI_REFACTORING_TASKS.md`)
| Task | Status | Notes |
|------|--------|-------|
| 10.1 Discovery & plan refresh | completed | 2025-11-04: Initiated discovery; reviewing docs listed above. 2025-11-06: js-edit analysis completed—inventoried 137 functions with lifecycle method hashes/locations documented in Discovery Highlights. |
| 10.2 Introduce `Crawler` base class | completed | 2025-11-06: Created `src/crawler/core/Crawler.js` with shared lifecycle infrastructure. Reuses existing StartupProgressTracker/CrawlerState modules. |
| 10.3 Refine `NewsCrawler` subclass | completed | 2025-11-06: Refactored NewsCrawler to extend Crawler base class. Removed duplicate infrastructure, retained domain-specific overrides. Fixed Crawler export format. Smoke test confirms inheritance works. |
| 10.4 Documentation & tracker updates | completed | 2025-11-06: Updated ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md with class hierarchy, updated CHANGE_PLAN.md modularization snapshot and task ledger. |
| 10.5 Focused validation | completed | 2025-11-06: Tests executed. DomainThrottleManager (6/6), ErrorTracker (3/3), CLI smoke test, instantiation test all pass. No regressions. |
| 10.6 Comprehensive Crawler tests | completed | 2025-11-17: Created src/crawler/core/__tests__/Crawler.test.js with 25/25 tests covering all base class functionality. |
| 10.7 Enhanced Crawler docs | completed | 2025-11-17: Added JSDoc comments, usage examples, parameter types to all Crawler methods. |
| 10.8 Update ARCHITECTURE docs | completed | 2025-11-17: Added Crawler Base Class Architecture section with responsibilities, events, extension patterns, integration details. |

---

## 🔄 Active Initiative (Oct 31, 2025): URL Normalization Cleanup — `article_places`

### Branch Update — 2025-11-02 (`chore/commonjs-context-support`)
- Extended `js-edit` SWC collectors to recognize CommonJS assignments (`module.exports`, `exports.*`) with canonical selectors and context metadata.
- Added CommonJS cases to `tests/fixtures/tools/js-edit-sample.js`, expanded integration tests for locate/context flows, and refreshed selector documentation.
- Tests: `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%`.
- ✅ Variable collector now reports CommonJS assignments (`module.exports`, `exports.value`) in `--list-variables`; fixtures, docs, and Jest coverage updated accordingly.

### Goal / Non-Goals
- **Goal:** Permanently remove the legacy `article_places.article_url` TEXT column, rebuild supporting indexes on `article_url_id`, and ensure all tooling/tests operate solely on normalized URL references.
- **Non-Goals:** Broader rewrite of deprecated gazetteer UI, migration of unrelated tables, or decommissioning legacy normalization scripts beyond what this column removal requires.

### Current Behavior (Baseline) — ✅ RESOLVED (2025-11-06)
- ~~`article_places` still retains the TEXT `article_url` column~~ **Column already dropped** - schema verification confirms only `article_url_id` remains.
- ~~Normalization scripts assume the TEXT column exists~~ **Scripts already handle absence** - they short-circuit gracefully when column not found (Task 7.1 complete).
- ~~Deprecated UI queries join on `article_url`~~ **Deprecated UI uses `articles.url`** - no references to `article_places.article_url` remain in codebase.

### Refactor & Modularization Plan
1. **Discovery (α):** Audit normalization tooling, docs (`docs/DATABASE_URL_NORMALIZATION_PLAN.md`), and dependent code to catalog remaining references to the TEXT column (✅ in progress; see Task 7.1 tracker notes).
2. **Planning (β):** Document safe drop workflow — table recreation order, index remapping to `article_url_id`, validation strategy, and rollback steps.
3. **Implementation (γ):**
  - Update tooling to treat `article_url` as optional/legacy so dry runs succeed post-drop.
  - Update any runtime queries/tests to rely on `article_url_id` joins via the `urls` table.
  - Extend `tools/migrations/drop-old-url-columns.js` (or equivalent) to recreate `article_places` without the TEXT column, ensuring new index (`idx_article_places_url_id`) exists and data integrity is preserved.
  - *2025-10-31:* Implementation underway — deprecated UI `gazetteerPlace` module queued for adapter-driven refactor and focused tests to eliminate remaining TEXT column dependencies.
  - *2025-10-31 PM:* Deprecated UI data tests now execute against fresh schemas with no `articles`/`article_places` tables, confirming adapter fallbacks return empty results without raising exceptions.
  - *2025-11-01:* Deprecated API suite now hits `/api/gazetteer/articles` end-to-end, exercising the legacy fallback response when the `articles` table is absent and aligning documentation with the structured payload.
4. **Validation (δ):** Run `node tools/db-schema.js table article_places` + normalization validator to confirm schema and row counts; spot-check deprecated UI query via smoke test or targeted unit harness if feasible.
5. **Documentation:** Refresh `docs/DATABASE_URL_NORMALIZATION_PLAN.md` and tracker entries to mark completion and outline the new steady state.

### Risks & Mitigations
- **Residual code paths expect TEXT column:** Mitigate by updating fetch helpers/tests before running drop script.
- **Index recreation errors:** Explicitly recreate indexes on `article_url_id` and warn if rehydration fails.
- **Rollback complexity:** Preserve backup copy of `article_places` schema via temporary table within migration script and keep `news-backup-YYYY` DB snapshot before applying changes.

### Focused Test Plan
- Run `node tools/db-schema.js table article_places` pre/post drop to verify column removal and index remap.
- Execute `node src/tools/normalize-urls/validate-url-normalization.js` to ensure tooling reports fully normalized status without warnings.
- If practical, run deprecated gazetteer smoke query (manual or scripted) to confirm article lists still resolve via joins.

### Rollback Plan
- Before applying `--fix`, create `data/backups/news-backup-<timestamp>.db`.
- Migration script keeps original data in `_old` table until rename; if validation fails, rename back and restore backup.
- Re-add `article_url` column by recreating table from backup snapshot if emergency rollback is needed.

---

## 🔄 Upcoming Initiative (Nov 2025): Schema Initialization Simplification

**Goal:** Remove legacy migration guards from `src/db/sqlite/v1/schema.js` so initialization simply applies the canonical statements generated in `schema-definitions.js`, ensuring all tables, indexes, and triggers are created consistently on a fresh database.

**Current Pain:** `schema.js` still contains 1,000+ lines of ad-hoc ALTER TABLE migrations, trigger guards, and bespoke creation logic that no longer reflects the regenerated schema blueprint. The redundancy causes drift risk whenever new tables are added to `schema-definitions.js` but forgotten in `schema.js`.

### Phase 8: Schema Blueprint Alignment

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 8.1 | Blueprint metadata inventory | Generate name/target metadata for every statement in `schema-definitions.js` so helper functions can filter subsets deterministically (core vs gazetteer vs compression) | ✅ COMPLETED | HIGH | 2025-11-01: Generator now enriches each statement with name/target metadata feeding deterministic filters |
| 8.2 | Extend schema definitions exports | Update `schema-definitions.js` to expose structured definitions (tables/indexes/triggers) and ensure missing triggers such as `trg_latest_fetch_upsert` are represented | ✅ COMPLETED | HIGH | 2025-11-01: Regenerated blueprint exposes `TABLE_DEFINITIONS`/`INDEX_DEFINITIONS`/`TRIGGER_DEFINITIONS` with ensured triggers |
| 8.3 | Refactor schema initializers | Replace the bespoke migration code in `schema.js` with execution helpers that replay the blueprint, while keeping seeding logic for compression types | ✅ COMPLETED | HIGH | 2025-11-02: Blueprint replay helpers in place; shim removed after regeneration; CLI verification logged |
| 8.4 | Validation & documentation | Run focused schema tests (v1 adapters, gazetteer ingest) and refresh `DATABASE_INITIALIZATION_ARCHITECTURE_ANALYSIS.md` to document the simplified flow | ✅ COMPLETED | MEDIUM | 2025-11-02: Focused Jest suites + CLI verification logged; documentation refreshed with residual risks |
| 8.5 | Resolve schema-dependent Jest worker exit warning | Investigate and eliminate forced-exit warning when running compression/query telemetry suites in parallel workers | 🚧 IN_PROGRESS | MEDIUM | Warning observed during Task 8.4 validation; likely open handle leakage in compression bucket retrieval |

- **Active phase:** Phase 8 — Schema Blueprint Alignment
- **Current sub-phase:** γ — Implementation & validation (re-entered 2025-11-02 after discovery refresh)
- **Docs consulted (α):** `AGENTS.md` (Topic Index), `.github/instructions/GitHub Copilot.instructions.md`, `docs/DATABASE_INITIALIZATION_ARCHITECTURE_ANALYSIS.md`, `docs/CLI_REFACTORING_TASKS.md` (historical patterns)
- **Code reconnaissance:** `src/db/sqlite/v1/schema.js`, `src/db/sqlite/v1/schema-definitions.js`, `src/db/sqlite/schema.js`
- **Tooling inventory:** Node one-off script to list blueprint targets (`TABLE_DEFINITIONS`, `INDEX_DEFINITIONS`, `TRIGGER_DEFINITIONS`), existing better-sqlite3 initializer wrapper
- **Gaps noted:** Blueprint now ships `place_hub_audit` tables/indexes after regeneration (2025-11-02); legacy initializer still issues view-drop + column-migration logic slated for removal
- **Task ledger for 8.3 (γ implementation plan):**
  1. ✅ Capture discovery outputs and update plan (this section)
  2. ✅ Build `applySchemaSubset` helpers that replay blueprint statements with verbose logging + transaction boundaries (2025-11-02)
  3. ✅ Define target group sets (core/gazetteer/place hubs/compression/background) derived from blueprint metadata (2025-11-02)
  4. ✅ Rewrite `init*Tables` to rely on subset helpers; preserve compression seeding and legacy view-drop guard (2025-11-02)
   5. ✅ Add compatibility shim for `place_hub_audit` until blueprint regeneration lands (document in plan + tracker) (2025-11-02)
     - 2025-11-02 PM: Regenerated blueprint now includes audit artifacts; shim removed from `schema.js`.
   6. ✅ Update exports/tests as needed and run focused schema smoke verification (`node tools/db-schema.js tables` against fresh DB)
     - Exports adjusted to re-export new helpers, in-memory `initializeSchema` smoke test executed via `node -e`, and CLI verification run (`node tools/db-schema.js tables`) confirming `place_hub_audit` presence (2025-11-02).
   7. ✅ Document residual risks + follow-up (blueprint generator refresh) before moving to Task 8.4
     - Blueprint regeneration workflow captured; residual risk limited to rerunning initializer against populated DBs producing duplicate index warnings (expected and logged).

  ### Task ledger for 8.4 (δ validation & documentation plan):
  1. ✅ Run focused schema-dependent Jest suites to confirm initializer parity (`npx jest --runTestsByPath src/db/sqlite/v1/__tests__/placePageMappings.test.js src/db/__tests__/queryTelemetry.test.js src/utils/__tests__/compression.test.js src/utils/__tests__/compressionBuckets.test.js --bail=1 --maxWorkers=50% --config=jest.careful.config.js`). Execution complete 2025-11-02; all suites passed, with the usual forced-exit warning noted for follow-up.
  2. ✅ Update `docs/DATABASE_INITIALIZATION_ARCHITECTURE_ANALYSIS.md` to describe the blueprint-driven initializer, subset targets, and removal of the audit shim; record duplicate index warning behavior and CLI verification steps (completed 2025-11-02).
  3. ✅ Capture residual risks (duplicate index warnings on populated DBs, jest worker exit message) and list next validation artifacts needed for Phase 8 close-out before starting Task 8.4 documentation updates (documented 2025-11-02).

  ### Task ledger for 8.5 (γ investigation & remediation):
  1. ✅ Reproduce worker exit warning on focused suites and capture diagnostics (`npx jest --runTestsByPath ... --maxWorkers=50% --config=jest.careful.config.js`) plus variants with `--detectOpenHandles`/`--runInBand` to scope to compression-related tests (2025-11-02).
  2. ✅ Audit `compressionBuckets.retrieveFromBucket` tar-stream usage for missing `next()`/destroy semantics that could keep extract streams alive and prevent worker shutdown (2025-11-02). Confirmed we short-circuit early and and added notes to pursue deterministic finish events.
  3. ✅ Patch compression bucket retrieval logic so the tar extractor drains fully before resolving (remove mid-flight `destroy()` and resolve on `finish`). Re-ran focused suites; warning persists, implying additional source beyond tar-stream cleanup (2025-11-02).
  4. ✅ Harden query telemetry writer scheduling (timer clear/unref, new `dispose()` hook) and ensure Jest tests dispose the writer after each case. Focused reruns still emit the forced-exit warning, suggesting remaining leakage elsewhere (2025-11-02).
  5. ⏳ Capture detailed handle snapshots at worker shutdown (enhanced instrumentation or bespoke harness) to isolate lingering resources before considering Jest config changes or serializing the suites.

---

## ✅ Completed Initiative (Oct 31, 2025): Repository Utility Tooling — `count-json-files`

### Goal / Non-Goals
- **Goal:** Provide a standardized CLI utility that counts `.json` files per directory within a target tree (including nested subdirectories), presenting results via `CliFormatter`/`CliArgumentParser` with optional JSON output for automation.
- **Non-Goals:** File content analysis, integration with background schedulers, or cross-repository aggregation beyond the specified root.

### Current Behavior (Baseline)
- No existing CLI enumerates JSON files per directory; developers rely on ad-hoc shell commands (unavailable due to PowerShell approval constraints).
- Existing CLI infrastructure (formatter/parser) is mature and should be reused for consistency and zero-approval execution.

### Refactor & Modularization Plan
1. **Discovery (α):** Confirm available formatter/parser helpers and review CLI output guidance (✅ `docs/CLI_REFACTORING_QUICK_START.md`, `docs/CLI_OUTPUT_SAMPLES.md`).
2. **Planning (β):** Define CLI surface (`--root`, `--summary-format`, `--quiet`, `--json`), traversal strategy (depth-first, synchronous), and output schema (ASCII table + stats + JSON payload).
3. **Implementation (γ):**
  - Create `tools/count-json-files.js` with standard shebang + module exports (if needed).
  - Use `CliArgumentParser` to parse options and guard invalid flag combos (quiet ⇒ JSON).
  - Traverse directories with `fs.readdirSync`/`withFileTypes`; count `.json` files per directory, store relative paths.
  - Render ASCII summary (header, settings, table sorted by count desc, summary stats) and JSON payload.
  - Enhancement (2025-10-31): Extract reusable table writer module, compute cumulative per-directory counts (including nested files), and add explicit console `table` summary format alongside JSON.
  - Enhancement (2025-10-31 late): Introduce a shared `--limit` option that caps displayed directories in ASCII/table summaries and trims JSON payloads to the top N entries while annotating truncation metadata.
  - Enhancement (2025-10-31 final): Add total bytes calculation for JSON files per directory and display formatted size column in tables (e.g., "144.1 MB").
4. **Validation:** Manual smoketests (`node tools/count-json-files.js --help`, `node tools/count-json-files.js --root . --summary-format json`) plus focused unit harness if necessary (not planned unless complexity grows).
5. **Documentation:** Update `CLI_REFACTORING_TASKS.md` execution log (✅) and, if interface stabilizes, add usage snippet to `docs/CLI_OUTPUT_SAMPLES.md` (optional enhancement).

### Risks & Mitigations
- **Large directory trees:** Traversal may touch many folders. *Mitigation:* Use iterative traversal, avoid storing per-file metadata, and guard against permission errors with try/catch.
- **Path readability:** Absolute paths may be verbose. *Mitigation:* Emit both absolute and root-relative paths in ASCII table if space permits, defaulting to relative for readability.

### Focused Test Plan
- Smoke test ASCII output: `node tools/count-json-files.js --root .`
- Smoke test table output: `node tools/count-json-files.js --root . --summary-format table`
- Limit handling: `node tools/count-json-files.js --root . --summary-format table --limit 25`
- Smoke test JSON output: `node tools/count-json-files.js --root . --summary-format json --quiet`
- Edge case (empty dir): run against `tmp/emptydir` to ensure graceful handling.
- Hotspot detection: verify known repository directory with large JSON footprint appears near top when scanning from repo root.

### Rollback Plan
- Tool is additive. If issues arise, remove `tools/count-json-files.js` and related documentation entries; no existing functionality impacted.

---

---

## 🎯 Refactoring Analysis Framework

This document provides a systematic approach to identify, analyze, and plan major refactoring initiatives. Use this framework when considering large-scale code improvements to ensure data-driven decisions and measurable outcomes.

### When to Use This Framework
- Codebase has grown complex with inconsistent patterns
- Performance issues or maintainability concerns emerge
- New requirements expose architectural limitations
- Team identifies recurring pain points in development workflow

### Analysis Phases
1. **Discovery & Data Collection** - Gather quantitative and qualitative data
2. **Pattern Recognition** - Identify hotspots and opportunities
3. **Impact Assessment** - Evaluate scope and risk
4. **Planning & Prioritization** - Create actionable roadmap
5. **Validation** - Ensure decisions are data-driven

---

## Phase 1: Discovery & Data Collection

### Quantitative Analysis Tools

#### Code Metrics Collection
```bash
# Lines of code by directory
find src -name "*.js" -exec wc -l {} + | sort -nr | head -20

# File complexity analysis
find src -name "*.js" -exec node -e "
  const fs = require('fs');
  const content = fs.readFileSync(process.argv[1], 'utf8');
  const lines = content.split('\n').length;
  const functions = (content.match(/function\s+\w+/g) || []).length;
  const complexity = lines + functions * 2;
  console.log(\`\${complexity}\t\${process.argv[1]}\`);
" {} \;
" {} \; | sort -nr | head -20

# Import/export analysis
find src -name "*.js" -exec grep -l "require\|import\|export" {} \; | wc -l
```

#### Database Query Analysis
```bash
# Find inline SQL in application code
grep -r "SELECT\|INSERT\|UPDATE\|DELETE" src/ --include="*.js" | grep -v "queries/" | wc -l

# Identify SQL hotspots
grep -r "SELECT\|INSERT\|UPDATE\|DELETE" src/ --include="*.js" | grep -v "queries/" | cut -d: -f1 | sort | uniq -c | sort -nr | head -10
```

#### Test Coverage Analysis
```bash
# Test file distribution
find tests -name "*.test.js" | wc -l
find src -name "*.js" | grep -v "test" | wc -l

# Test-to-code ratio by module
for dir in src/*/; do
  code_files=$(find "$dir" -name "*.js" | grep -v "test" | wc -l)
  test_files=$(find "tests" -name "*$(basename "$dir")*.test.js" | wc -l)
  echo "$(basename "$dir"): $test_files tests / $code_files code files"
done
```

### Qualitative Analysis Tools

#### Dependency Analysis
```bash
# Circular dependency detection
node -e "
const madge = require('madge');
madge('src/', { fileExtensions: ['js'] })
  .then((res) => {
    const circular = res.circular();
    console.log('Circular dependencies found:', circular.length);
    circular.slice(0, 5).forEach(dep => console.log('  -', dep.join(' → ')));
  });
"

# Module coupling analysis
find src -name "*.js" -exec grep -l "require\|import" {} \; | xargs -I {} sh -c '
  file="$1"
  imports=$(grep -c "require\|import" "$file")
  exports=$(grep -c "export\|module.exports" "$file")
  coupling=$((imports + exports))
  echo "$coupling $file"
' _ {} | sort -nr | head -10
```

#### Error Pattern Analysis
```bash
# Common error patterns in logs
grep -r "Error\|Exception" logs/ 2>/dev/null | cut -d: -f3 | sort | uniq -c | sort -nr | head -10

# Database error hotspots
grep -r "SQLITE_ERROR\|constraint failed" logs/ 2>/dev/null | cut -d: -f1 | sort | uniq -c | sort -nr | head -5
```

### Custom Analysis Tools

#### Code Duplication Detector
```javascript
// tools/analyze-duplication.js
const fs = require('fs');
const path = require('path');

function findDuplicates(dir, minLines = 5) {
  const files = [];
  const snippets = new Map();

  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !item.startsWith('.')) {
        walk(fullPath);
      } else if (item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length - minLines; i++) {
      const snippet = lines.slice(i, i + minLines).join('\n').trim();
      if (snippet.length > 20) {
        if (!snippets.has(snippet)) {
          snippets.set(snippet, []);
        }
        snippets.get(snippet).push(`${file}:${i + 1}`);
      }
    }
  }

  const duplicates = [];
  for (const [snippet, locations] of snippets) {
    if (locations.length > 1) {
      duplicates.push({ snippet, locations, count: locations.length });
    }
  }

  return duplicates.sort((a, b) => b.count - a.count);
}

const duplicates = findDuplicates('src', 3);
console.log(`Found ${duplicates.length} duplicate code patterns`);
duplicates.slice(0, 10).forEach((dup, i) => {
  console.log(`\n${i + 1}. ${dup.count} occurrences:`);
  dup.locations.forEach(loc => console.log(`  - ${loc}`));
});
```

#### API Usage Analyzer
```javascript
// tools/analyze-api-usage.js
const fs = require('fs');
const path = require('path');

function analyzeAPIUsage(dir) {
  const apiCalls = new Map();
  const files = [];

  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        walk(fullPath);
      } else if (item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for common API patterns
      const patterns = [
        /\.query\(/,
        /\.exec\(/,
        /\.prepare\(/,
        /fetch\(/,
        /axios\./,
        /fs\./,
        /path\./
      ];

      for (const pattern of patterns) {
        if (line.match(pattern)) {
          const key = pattern.replace(/\\/g, '');
          if (!apiCalls.has(key)) {
            apiCalls.set(key, []);
          }
          apiCalls.get(key).push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
  }

  return apiCalls;
}

const apiUsage = analyzeAPIUsage('src');
for (const [api, calls] of apiUsage) {
  console.log(`\n${api}: ${calls.length} calls`);
  calls.slice(0, 3).forEach(call => console.log(`  ${call}`));
  if (calls.length > 3) {
    console.log(`  ... and ${calls.length - 3} more`);
  }
}
```

#### Performance Bottleneck Detector
```javascript
// tools/analyze-performance.js
const fs = require('fs');
const path = require('path');

function analyzePerformance(dir) {
  const bottlenecks = [];
  const files = [];

  function walk(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        walk(fullPath);
      } else if (item.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Synchronous file operations
      if (line.includes('fs.readFileSync') || line.includes('fs.writeFileSync')) {
        bottlenecks.push({
          type: 'sync-file-io',
          file: file,
          line: i + 1,
          code: line.trim(),
          severity: 'high'
        });
      }

      // Large data processing in memory
      if (line.includes('.map(') || line.includes('.filter(') || line.includes('.reduce(')) {
        if (lines[i - 1] && (lines[i - 1].includes('const ') || lines[i - 1].includes('let '))) {
          bottlenecks.push({
            type: 'large-array-processing',
            file: file,
            line: i + 1,
            code: line.trim(),
            severity: 'medium'
          });
        }
      }

      // Nested loops
      if (line.includes('for') && line.includes('for')) {
        bottlenecks.push({
          type: 'nested-loops',
          file: file,
          line: i + 1,
          code: line.trim(),
          severity: 'medium'
        });
      }
    }
  }

  return bottlenecks;
}

const bottlenecks = analyzePerformance('src');
console.log(`Found ${bottlenecks.length} potential performance bottlenecks`);

const byType = {};
for (const bottleneck of bottlenecks) {
  if (!byType[bottleneck.type]) {
    byType[bottleneck.type] = [];
  }
  byType[bottleneck.type].push(bottleneck);
}

for (const [type, items] of Object.entries(byType)) {
  console.log(`\n${type}: ${items.length} instances`);
  items.slice(0, 3).forEach(item => {
    console.log(`  ${item.file}:${item.line} (${item.severity})`);
    console.log(`    ${item.code}`);
  });
}
```

---

## Phase 2: Pattern Recognition

### Code Smell Detection
- **Large files** (>500 lines) - Break down into modules
- **High complexity functions** (>50 lines) - Extract helper functions
- **Duplicate code** (>3 occurrences) - Create shared utilities
- **Mixed responsibilities** - Separate concerns into different modules
- **Tight coupling** - Introduce interfaces or adapters

### Architectural Assessment
- **Layer violations** - Business logic in presentation layer
- **Circular dependencies** - Break dependency cycles
- **God objects** - Split large classes into focused components
- **Inconsistent naming** - Establish naming conventions
- **Missing abstractions** - Identify common patterns to extract

### Workflow Analysis
- **Development bottlenecks** - Slow builds, complex deployments
- **Testing pain points** - Hard to test components
- **Debugging difficulties** - Poor error messages or logging
- **Onboarding friction** - Complex setup or unclear patterns

---

## Phase 3: Impact Assessment

### Risk Evaluation
- **Breaking changes** - How many consumers affected?
- **Migration complexity** - How hard to update dependent code?
- **Rollback difficulty** - Can changes be safely reverted?
- **Testing requirements** - How much new test coverage needed?

### Business Value
- **Developer productivity** - Time saved per task
- **Maintenance cost** - Reduced bug fixes or technical debt
- **Feature velocity** - Faster delivery of new features
- **System reliability** - Fewer production incidents

### Effort Estimation
- **Scope** - Lines of code, files, modules affected
- **Complexity** - Technical challenges and unknowns
- **Timeline** - Realistic delivery schedule
- **Team capacity** - Available resources and expertise

---

## Phase 4: Planning & Prioritization

### Refactoring Roadmap Template

#### Phase X: [Refactoring Name]
**Goals:**
- [Specific, measurable objectives]

**Non-Goals:**
- [What explicitly won't be changed]

**Current Behavior:**
- [Baseline state description]

**Refactor & Modularization Plan:**
1. **[Task 1]** - [Implementation details]
2. **[Task 2]** - [Implementation details]

**Risks & Mitigations:**
- **[Risk 1]** - [Mitigation strategy]

**Focused Test Plan:**
- [Testing approach and validation criteria]

**Rollback Plan:**
- [Safe reversion strategy]

### Prioritization Framework
1. **High Impact, Low Risk** - Quick wins, immediate value
2. **High Impact, High Risk** - Major improvements requiring careful planning
3. **Low Impact, Low Risk** - Nice-to-haves when resources available
4. **Low Impact, High Risk** - Avoid unless absolutely necessary

---

## Phase 5: Validation & Execution

### Success Metrics
- **Quantitative:** Lines of code reduced, complexity metrics improved, performance benchmarks
- **Qualitative:** Developer feedback, code review comments, maintenance ease
- **Business:** Development velocity, bug rates, feature delivery time

### Execution Guidelines
1. **Pilot first** - Prove approach with small scope
2. **Document everything** - Clear plans and progress tracking
3. **Test thoroughly** - Validate each change before proceeding
4. **Communicate progress** - Keep stakeholders informed
5. **Measure impact** - Track metrics throughout execution

---

## Tool Development Guidelines

### When to Build Analysis Tools
- **Recurring analysis needs** - Same questions asked repeatedly
- **Complex data relationships** - Hard to see patterns manually
- **Large codebase scale** - Too big for manual inspection
- **Quantitative decision making** - Need metrics to drive choices

### Tool Design Principles
- **Single responsibility** - One tool, one analysis type
- **Machine-readable output** - JSON/CSV for further processing
- **Configurable parameters** - Allow different analysis scopes
- **Error handling** - Graceful failure with helpful messages
- **Performance conscious** - Don't slow down analysis with inefficiency

### Tool Categories
- **Static analysis** - Code structure, dependencies, complexity
- **Dynamic analysis** - Runtime behavior, performance profiling
- **Historical analysis** - Git history, change patterns, evolution
- **Comparative analysis** - Before/after metrics, A/B testing

---

## Example: CLI Refactoring Analysis

**Quantitative Data Collected:**
- 25+ CLI tools with inconsistent patterns
- ~1000+ lines of duplicate boilerplate
- 15+ inline SQL statements in CLI code
- Mixed argument parsing approaches

**Qualitative Insights:**
- Developer frustration with inconsistent output
- Maintenance burden from duplicate code
- Database safety concerns with inline SQL

**Identified Refactoring Target:**
- Standardize CLI tools with shared CliFormatter + CliArgumentParser
- Move all SQL to adapter modules
- Establish consistent output patterns

**Result:** 32-task refactoring completed successfully (see `docs/refactored/cli-refactoring-stages.md`)

---

## References

- **docs/refactored/cli-refactoring-stages.md** - Complete case study of successful large-scale refactoring
- **AGENTS.md** - Project documentation with development patterns
- **tools/** - Directory for custom analysis tools

---

## Session Summary — 2025-11-01

- Documented the `--expect-span` guard option in `tools/dev/README.md` and refreshed the `docs/CLI_REFACTORING_QUICK_START.md` workflow so hash/span replays are first-class.
- Marked span guard tasks complete in `CHANGE_PLAN.md`/`docs/JS_EDIT_ENHANCEMENTS_PLAN.md` and recorded follow-up to extend plan emission coverage when batching edits.
- Tests: `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%`.
- Follow-ups: Broaden guard plan coverage for `--allow-multiple` scenarios and highlight multi-target span reporting where useful.
- **docs/** - Architecture and process documentation

## Goal / Non-Goals

### Goal
- Transform the `guess-place-hubs` workflow into a batch-friendly, auditable pipeline that can ingest multiple domains, persist validation evidence, and surface actionable reports for operators and dashboards.
- Extend the telemetry foundations added in Task 4.1 so every candidate, validation decision, and persisted hub produces structured artefacts (DB rows, JSON reports, SSE events).
- Prepare the workflow for automation by integrating with the background task scheduler and analysis dashboards.

### Non-Goals
- Do not redesign the underlying hub analyzers or validation heuristics (Country/Region/City analyzers, `HubValidator`).
- Avoid changing the schema of the existing `place_hubs` table beyond adding evidence metadata required for auditing.
- No crawler scheduling changes beyond what is needed to orchestrate batch CLI runs for the hub guessing workflow.

---

## Current Behavior (Baseline)
- `guess-place-hubs.js` processes a single domain per invocation. Operators must loop manually to cover multiple hosts.
- `--apply` writes directly to `place_hubs` with limited insight — there is no dry-run diff preview or staging layer.
- Telemetry from Task 4.1 captures candidate rows in `place_hub_candidates`, but there is no durable audit trail for validation decisions or persisted hubs.
- The CLI emits a JSON summary (`--json`) but lacks export/report tooling for downstream dashboards.
- No scheduler integration exists; the workflow relies on ad-hoc CLI invocation.

---

## Refactor & Modularization Plan

### Phase 4A — CLI Workflow Enhancements (Task 4.2)
1. **Multi-domain batching:**
	- Accept `--domain` multiple times and positional lists (`guess-place-hubs host1 host2`).
	- Add `--domains <csv>` and `--import <file>` (CSV with `domain,[kinds]` columns) to seed batch queues.
	- Introduce `loadDomainBatch()` helper that normalizes hosts, deduplicates entries, and associates per-domain overrides (kinds, limits).
2. **Dry-run diff preview for `--apply`:**
	- Collect existing hub rows before writes; compute insertion/update sets.
	- Render preview via CliFormatter (table of new vs updated hubs) and expose JSON structure in summary payload.
	- Wrap DB writes in a transaction; if preview fails confirmation (future hook), rollback.
3. **`--emit-report` JSON snapshots:**
	- Allow writing detailed run artefacts to disk (`--emit-report report.json` or directory default `place-hub-reports/<timestamp>.json`).
	- Include candidate metrics, diff preview, validation summaries, and timing info per domain.
4. **Batch summary output:**
	- Extend `renderSummary` to show per-domain stats plus roll-up totals, respecting quiet/JSON modes.
5. **Implementation touchpoints:**
	- `parseCliArgs` (batch options), `guessPlaceHubs` (loop orchestrator), `renderSummary` (batch aware), new `summarizeHubDiff()` utility under `src/tools/guess-place-hubs/` if needed, `placeHubCandidatesStore` (ensure multi-domain runs reuse store safely).


##### Early Exit & Readiness Investigation (γ discovery log — 2025-10-30)
- **Status quo:** `guessPlaceHubs` always builds analyzers and walks prediction loops even when the target domain has no historical coverage. Operators bail manually (Ctrl+C) because readiness checks scan large tables (`fetches`, `place_page_mappings`, `place_hubs`) without indexes, causing multi-minute blocking on cold domains.
- **Intended behavior:** detect “insufficient data” (no DSPL patterns, no stored hubs, no verified mappings, no prior candidates) and exit immediately with actionable messaging and a persisted determination (`place_hub_determinations`).
- **Gap analysis:**
  - Coverage probes issue full-table `COUNT(*)` queries which exhaustively scan millions of rows when no matches exist. Without host indexes the CLI appears hung.
  - No guard rails on readiness probe duration; operators cannot cap probe time when running large batch inputs.
  - Determination persistence existed but the CLI never surfaced readiness metadata in summaries/JSON, so dashboards can’t observe early exit reasons.
- **Remediation plan:**
	- [x] Add lightweight host/domain indexes (idempotent) for readiness-critical tables and guard queries behind fast probes.
	- [x] Introduce a configurable readiness budget (`--readiness-timeout`, default 10s) and propagate budget exhaustion as a soft “data-limited” determination with guidance.
	- [x] Surface readiness diagnostics (metrics, DSPL availability, recommendations, determination) in both ASCII and JSON outputs (including per-domain batch reporting).
	- [ ] Extend unit coverage to assert the insufficient-data early exit path (no network fetches, determinations recorded) and readiness timeout messaging.

> **Next steps:** add targeted Jest coverage for the readiness pathways, then resume diff preview work once tests codify the insufficient-data and timeout flows.

**Implementation update (2025-10-30, γ sub-phase):** `guess-place-hubs` now creates host/domain indexes on readiness-critical tables, exposes a `--readiness-timeout` flag (default 10s), short-circuits probes when the budget is exhausted, and reports completed/skipped metrics plus timeout counts in both ASCII and JSON summaries.

**Diff preview progress (2025-10-30):** ✅ COMPLETE — The summary renderer surfaces proposed hub inserts/updates with formatted tables, per-domain dry-run counts, and cloned diff arrays inside the JSON summary payload.

**Report emission progress (2025-10-30):** ✅ COMPLETE — Added `buildJsonSummary` and `writeReportFile` helpers so `--json` emits enriched batch summaries while `--emit-report` writes structured JSON artefacts to disk. Report payloads now include:
  - Candidate metrics: generated, cached hits, cached 404s, cached recent 4xx, duplicates, fetched OK, validated (pass/fail), rate limited, persisted (inserts/updates), errors
  - Validation summaries: pass/fail counts + failure reason distribution (aggregate + per-domain)
  - Diff preview: insert/update snapshots with full row details
  - Timing metadata: run duration, per-domain start/complete/elapsed
  - Batch context: total/processed domains, options snapshot, domain input sources

**CLI summary enhancements (2025-10-30/31):** ✅ COMPLETE — Extended ASCII summary output to display run duration, validation pass/fail counts, and top 5 failure reasons when validation failures occur.

##### Circular dependency remediation (2025-10-30)
- **Symptoms:** Node emitted `Accessing non-existent property 'ensureDb'/'ensureGazetteer' of module exports inside circular dependency` warnings when CLI crawls bootstrapped the SQLite layer.
- **Root cause:** `ensureDb.js` eagerly required `seed-utils.js`, which in turn required `SQLiteNewsDatabase.js`. That constructor re-imported `ensureDb`, forming a loop that left the export object half-populated during module evaluation.
- **Fix strategy:**
	1. Remove the unused `seedData` import from `ensureDb.js` so the file no longer pulls `seed-utils.js` on load.
	2. Drop the unused `require('./SQLiteNewsDatabase')` statement from `seed-utils.js` to break the cycle permanently.
	3. Smoke-test by invoking a CLI that touches the SQLite bridge (e.g., `node src/tools/guess-place-hubs.js example.com --limit 0 --json`) and confirm the warning no longer appears.
- **Follow-up:** If additional modules introduce new cycles, add lint tooling (ESLint `import/no-cycle`) to surface them earlier, but current scope stops at eliminating the observed loop.
