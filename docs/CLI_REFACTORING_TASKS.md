# CLI Refactoring Tasks — Autonomous Execution Plan

**Date Created:** October 30, 2025  
**Status:** Active
**Mode:** Continuous autonomous execution with progress tracking
**History:** [See completed tasks and execution logs in `docs/archives/CLI_REFACTORING_TASKS_HISTORY.md`](./archives/CLI_REFACTORING_TASKS_HISTORY.md)

---

## Overview

This document tracks all remaining CLI tool refactoring tasks. Tasks are executed autonomously with progress updates recorded in real-time. The refactoring applies the established CliFormatter + CliArgumentParser pattern to all CLI tools systematically.

**Working Pattern:**
1. Select next task from task list
2. Mark as IN_PROGRESS
3. Execute refactoring
4. Validate output
5. Mark as COMPLETE
6. Move to next task

No human approval needed between tasks. This is continuous autonomous work until all tasks are complete or blockers are encountered.

---

## Task Inventory

### Phase 9: Agent Instruction Updates (New Scope)

Tasks focused on expanding agent playbooks with js-edit guidance and ensuring the refactor workflow instructions stay aligned with recent lessons.

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 9.1 | Refresh change plan for agent instruction work | Capture goals, risks, and validation steps for the new agent playbook in `CHANGE_PLAN.md` | completed | HIGH | 2025-11-04: Plan updated with js-edit highlights, risks, validation, and task ledger. |
| 9.2 | Author `Careful js-edit refactor.agent.md` | Create a new `.github/agents` entry combining Careful Refactor guidance with js-edit discipline and expanded tooling notes | completed | HIGH | 2025-11-04: Agent file published with js-edit toolbox, stuck protocol, and improved phase guidance. |
| 9.3 | Cross-link documentation | Ensure `AGENTS.md`/instructions references capture the new agent and its js-edit requirements | in-progress | MEDIUM | 2025-11-04: Aligning documentation updates while refining CHANGE_PLAN configuration sequencing guidance. |

### Phase 11: Crawl Sequence Config Implementation (New Scope)

Tasks to introduce configuration-driven crawl sequences (string command arrays) and prepare the crawler stack for later AST integration while tightening orchestration boundaries and telemetry.

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 11.1 | Discovery & tooling inventory | Map current crawl orchestration code paths, catalogue existing configs/tooling, and update `CHANGE_PLAN.md` with scope/risks | ✅ COMPLETED | HIGH | 2025-11-12: Discovery notes captured in CHANGE_PLAN (Task 2.4) covering loader contract, resolver catalog, telemetry metadata, and schema asset plan. |
| 11.2 | Implement sequence config loader | Add loader that reads JSON/YAML command arrays, validates them, and normalizes command metadata for execution | ✅ COMPLETED | HIGH | 2025-11-12: Implemented loader module + schema validator with resolver support; added README + tests (`npx jest --config jest.careful.config.js --runTestsByPath src/orchestration/__tests__/SequenceConfigLoader.test.js --bail=1 --maxWorkers=50%`). |
| 11.3 | Build sequence runner & operations bridge | Implement runner that maps strings to `CrawlOperations` methods, handles args, and wires telemetry hooks | ✅ COMPLETED | HIGH | 2025-11-04: Added `createSequenceRunner` (`src/orchestration/SequenceRunner.js`) with telemetry callbacks, override merging, and Jest coverage. 2025-11-05: Bridged `CrawlOperations` to the new runner (manual patch after js-edit limitation), forwarding `stepOverrides`, preserving `onStepComplete`, and expanding Jest coverage (`SequenceRunner.test.js`, `CrawlOperations.test.js`). 2025-11-05: Sequence execution results now include preset metadata/context (name, description, overrides, source) for CLI consumption. 2025-11-05 (ongoing): Wiring loader-sourced metadata through the façade/runner bridge and updating the CLI summaries to render the richer metadata/context payloads. 2025-11-12: CLI `crawl-operations` tool now normalizes `--sequence-config` options, invokes the loader, threads config metadata through execution, and pretty-prints the results in ASCII/JSON with error codes surfaced for loader failures. Added `crawl-operations.sequence-config.test.js` to cover the new option normalization paths. 2025-11-12: Focused Jest (`npx jest --config jest.careful.config.js --runTestsByPath src/tools/__tests__/crawl-operations.sequence-config.test.js --bail=1 --maxWorkers=50%`) passes, confirming CLI normalization + metadata bridge. |
| 11.4 | Refine NewsCrawler orchestration integration | Update crawler startup to consume sequences, enforce deterministic command ordering, and isolate configuration concerns | in-progress | HIGH | Maintain backwards compatibility by providing default sequence configs. 2025-11-12: Initiated integration work; preparing NewsCrawler adapter entry point to consume loader/runner context. 2025-11-12 PM: Extracted shared `SequenceConfigRunner` helper (`src/orchestration/SequenceConfigRunner.js`), refactored `crawl-operations` CLI to reuse it, and added `NewsCrawler.loadAndRunSequence` to bridge configs into the crawler stack. Focused Jest run (`npx jest --config jest.careful.config.js --runTestsByPath src/orchestration/__tests__/SequenceConfigRunner.test.js --bail=1 --maxWorkers=50%`) passes, covering loader delegation and facade execution wiring. 2025-11-13: Rebuilding `normalizeLegacyArguments` so legacy CLI surfaces sequence-config inputs without regressing start URL precedence; helper scaffolding merged, function rewrite in progress. 2025-11-13 (later): Legacy CLI now routes `--sequence-config` through `NewsCrawler.loadAndRunSequence`; argument normalizer rewritten, db path resolution added, and new Jest coverage (`src/crawler/cli/__tests__/argumentNormalizer.test.js`) guards JSON parsing and geography defaults. 2025-11-13 (latest): Auditing `NewsCrawler.crawl` startup stages to map planner/sitemap/worker bootstrap flow into default sequence steps prior to adapter refactor. 2025-11-13 (night): Consulted sequence config docs + `SequenceRunner` implementation to chart shared startup operations and committed to NewsCrawler-specific runner covering sequential, concurrent, and gazetteer modes before touching crawl loops. 2025-11-14: `crawl()`/`crawlConcurrent()` now orchestrate via `_runCrawlSequence` with mode-specific step lists, `_finalizeRun` centralizes summary/error handling, and `useSequenceRunner` toggles legacy fallbacks for deployments without sequence support. |
| 11.5 | Safety, telemetry, and monitoring updates | Instrument execution timing, failure counts, and SSE/analysis reporting for sequence-driven runs | in-progress | MEDIUM | 2025-11-14: Consulted AGENTS.md Topic Index + docs/INDEX.md; preparing telemetry wiring and resolver plumbing for `SequenceConfigRunner` + NewsCrawler bridge so loader outputs feed playbook/config metrics. 2025-11-14 PM: `NewsCrawler.loadAndRunSequence` now builds the resolver map, forwards it to `runSequenceConfig`, and invokes cleanup so loader metadata includes playbook/config tokens ahead of telemetry instrumentation. |
| 11.6 | Focused tests & documentation updates | Add targeted tests for loader/runner integration, update docs/CHANGE_PLAN/tracker entries, and record verification commands | not-started | HIGH | Tests should cover happy path, invalid commands, and dry-run behavior. |

### Phase 12: js-edit CLI Modularization (New Scope)

Tasks for splitting the js-edit CLI into focused operation modules while preserving guardrail behavior.

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 7.1 | Discovery & module boundary plan | Document module layout, helper dependencies, and risks ahead of extraction | ✅ COMPLETED | HIGH | 2025-11-14: Findings logged in CHANGE_PLAN.md; helper inventory captured for context/mutation modules. |
| 7.2 | Module scaffolding | Introduce `tools/dev/js-edit/operations/` scaffolding without behavioral changes | ✅ COMPLETED | HIGH | 2025-11-05: Added placeholder context/mutation modules wired for future dependency injection. |
| 7.3 | Extract discovery operations | Move list/search/preview flows into `operations/discovery.js` and thread dependencies | ✅ COMPLETED | HIGH | 2025-11-05: CLI now delegates discovery commands via dependency injection with smoke validation. |
| 7.4 | Extract context & guard operations | Relocate context helpers, guard summary renderers, and plan emitters into `operations/context.js` with CLI wiring | completed | HIGH | 2025-11-14: CLI now threads dependencies into `operations/context.js`, legacy helpers removed from `js-edit.js`, and context/guard flows delegate to the module. |
| 7.5 | Extract mutation workflows | Move locate/replace helpers and guard enforcement into `operations/mutation.js` | ✅ COMPLETED | HIGH | 2025-11-15: α discovery resumed; reviewed `.github/instructions/GitHub Copilot.instructions.md`, `AGENTS.md`, `docs/CHANGE_PLAN.md`, and this tracker before implementation. 2025-11-16: γ implementation advance — relocated function-target scan orchestration into discovery module, updated CLI dependency injection, and validated with `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%`. 2025-11-16 (late): γ implementation continues — removing inline locate/extract/replace helpers from the CLI so `mutationOperations` is the single execution path; re-read `.github/instructions/GitHub Copilot.instructions.md`, `AGENTS.md`, `docs/INDEX.md`, `docs/CHANGE_PLAN.md`, and this tracker to confirm guardrails before editing; next: rerun focused Jest and update docs once cleanup validated. 2025-11-17: γ implementation continues — removing legacy `locate*`/`extract*`/`replace*` helpers from the CLI to ensure `mutationOperations` is the single execution path. 2025-11-17 (afternoon): Reinforced `readSource` to return `{ source, sourceMapper }`, fixing the `[✖ ERROR] Value is non of these types \\`Vec<u8>\\`, \\`String\\`` regression triggered when mutation workflows parsed files. 2025-11-06: ✅ Verified complete — all legacy mutation helpers removed, CLI delegates to `operations/mutation.js`, all 51 Jest tests passing. |
| 7.6 | Validation & documentation | Run focused tests and update docs/tracker to reflect new module layout | 🔄 IN_PROGRESS | HIGH | Documentation refresh underway to embed js-edit static analysis + workflow usage guidance. |
| 7.7 | Implement `--snipe` command | Add targeted context lookup command for file+span inputs with concise output | ✅ COMPLETED | HIGH | 2025-11-06: Implemented `--snipe <position>` accepting line:col (e.g., `10:5`) or byte offset (e.g., `500`). Finds nearest enclosing symbol at specified position, returns minimal table with type/name/kind/hash/location. Verified: `node tools/dev/js-edit.js --file tests/fixtures/tools/js-edit-sample.js --snipe "1:10"` correctly identifies `exports.alpha` function. |
| 7.8 | Implement `--outline` command | Emit top-level symbol listings (`--outline`/`--outline --json`) with byte offsets | ✅ COMPLETED | MEDIUM | 2025-11-06: Implemented `--outline` filtering to top-level symbols (scopeChain empty or containing only `exports`/`module.exports`). Emits compact table with index/type/name/kind/line/column/bytes sorted by source position. Includes both functions and variables. Verified with fixture showing 21 of 38 total symbols. |
| 7.9 | Enhance selector expressions | Support combined selectors (e.g., `function:name@range`) and semantic filters | ✅ COMPLETED | HIGH | 2025-11-15: α discovery kicking off; cataloguing selector parsing/formatting surfaces + ran `node tools/dev/js-edit.js --file tests/fixtures/tools/js-edit-sample.js --list-functions --json` to capture span metadata for combined selector design. 2025-11-06: Verified complete — `parseSelectorExpression` and `parseSelectorFilter` implemented supporting @kind, @export, @hash, @range, @bytes, @path, and @replaceable filters with proper error handling. |
| 7.10 | Add `--preview-edit` flag | Provide diff-style preview of replacements without writing to disk | ✅ COMPLETED | HIGH | 2025-11-06: Implemented unified diff preview for replacements. Added `generateUnifiedDiff` helper function supporting configurable context lines (default 3). When `--preview-edit` is used with `--replace`, shows before/after changes in standard unified diff format with @@ hunks, +/- prefixes, and context lines. Verified with simple and complex replacements showing accurate line-by-line diffs. |
| 7.11 | Add discovery filters | Introduce `--match`/`--exclude` pre-filters to limit traversal scope | ✅ COMPLETED | MEDIUM | 2025-11-06: Implemented `--match` and `--exclude` CLI arguments with glob pattern support (*, ?, **). Added `globToRegex` and `matchesPattern` helpers to discovery operations. Updated listFunctions, listVariables, and listConstructors to apply include/exclude filters before --filter-text. Verified with CLI tests: `--match "alpha*"`, `--exclude "beta*"`, `--match "*Controller*" --exclude "*log*"` all working correctly. |
| 7.12 | Emit mutation digest snapshots | Extend `mutationOperations.replace*` to write before/after digest files per command | completed | HIGH | 2025-11-15: CLI now supports `--emit-digests`/`--emit-digest-dir`, writing before/after JSON snapshots; surfaced paths in output and payloads. |
| 7.13 | Implement `--scan-targets` dry-run | List selector matches with hashes/spans without performing mutation | completed | HIGH | 2025-11-15: Added `--scan-targets` with function/variable modes (`--scan-target-kind`), plan integration, and table/JSON output. |

**2025-11-15 Update:** Attempted to inspect `fmt` declaration with `node tools/dev/js-edit.js --file tools/dev/js-edit.js --context-variable fmt`; command failed (`fmt.codeBlock is not a function`), so js-edit cannot safely target the CLI while it formats its own output. Proceeding with manual patches for Task 7.5 after recording the limitation.

**2025-11-15 Progress:** Wired `tools/dev/js-edit.js` to require `./js-edit/operations/mutation`, injected dependencies via `mutationOperations.init`, and routed locate/extract/replace commands through the module. Legacy inline implementations remain for now pending cleanup. Validation commands: `node --check tools/dev/js-edit.js`, `node tools/dev/js-edit.js --file tests/fixtures/tools/js-edit-sample.js --list-functions --json`.

**2025-11-17 Progress:** Restored `tools/dev/js-edit/shared/constants.js`, updated CLI/discovery modules to consume the shared list-output config, reinstated selector candidate helpers with canonical-first matching to avoid scope-chain collisions, and reran focused Jest plus CLI list-function smoke commands to confirm js-edit discovery and mutation flows are healthy.

**2025-11-06 Session Summary:** Completed js-edit modularization tasks 7.5 (mutation workflows), 7.9 (selector expressions), 7.14 (dense output), and 9.4 (constructor listing). All features verified working with CLI tests and full Jest suite passing (51/51 tests). Dense list output is default, selector @ filters functional, mutation operations properly delegated to modules.

### Phase 10: NewsCrawler Modularization (New Scope)

Tasks to break the monolithic `NewsCrawler` into layered components, starting with a reusable crawler base class and clearer separation of infrastructure vs. news-specific orchestration.

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 10.1 | Discovery & planning for crawler modularization | Audit `NewsCrawler.js`, identify crawl lifecycle landmarks, catalogue helper modules, and capture risks/plan updates in `CHANGE_PLAN.md` | in-progress | HIGH | 2025-11-04: User requested Crawler superclass; initiated deep discovery. Consulted AGENTS.md Topic Index, `.github/instructions/GitHub Copilot.instructions.md`, and `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`; change plan updated to capture goals/risks. |
| 10.2 | Introduce `Crawler` base class | Extract shared crawler infrastructure (startup, queue, telemetry, throttling) into a new base class consumed by `NewsCrawler` | not-started | HIGH | Depends on Task 10.1 plan output; will ensure backwards compatibility with existing crawl entry points. |
| 10.3 | Refine NewsCrawler-specific orchestration | Rework `NewsCrawler.js` to lean on the base class, highlight high-level crawl algorithms, and replace inline helpers with dedicated modules | not-started | HIGH | Includes adding top-of-file comment enumerating primary crawl orchestration methods. |
| 10.4 | Update documentation & tracker | Refresh developer docs, change plan ledger, and tracker notes to reflect new class hierarchy and helper module usage | not-started | MEDIUM | After implementation, ensure `AGENTS.md` and architecture docs reference the new structure. |
| 10.5 | Focused validation | Run targeted Jest/CLI smoke tests covering crawl initialization and concurrency paths to confirm refactor stability | not-started | HIGH | To execute once Tasks 10.2-10.3 land; capture commands + results in tracker. |

### Phase 7: URL Normalization Cleanup (New Scope)

Tasks to finish retiring legacy TEXT URL columns now that all `article_places` rows carry `article_url_id` references.

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 7.1 | Stabilize tooling for column removal | Update normalization/validation scripts to treat `article_url` as optional, refresh docs, plan safe drop workflow | ✅ COMPLETED | HIGH | 2025-10-31: Scripts now short-circuit when the column is absent, index creation is idempotent, and docs updated with post-drop guidance |
| 7.2 | Remove runtime dependencies on TEXT column | Update any code paths that still join on `article_places.article_url` (deprecated UI queries/tests) to use `article_url_id` + `urls` join, adjust indexes, and add smoke coverage | in-progress | HIGH | 2025-10-31: Deprecated UI data module now defers to adapter helpers; focused Jest (`gazetteerPlace.data.test.js`) updated to run against schemas without `articles`/`article_places` tables. Remaining work: audit other `articles` references (API endpoints, background tasks) and move residual SQL behind adapters before column drop. |
| 7.3 | Drop `article_url` column safely | Enhance migration tooling to recreate table without the column, rebuild indexes on `article_url_id`, run drop in `--fix` mode, and validate via CLI | not-started | HIGH | Requires completion of Tasks 7.1 and 7.2 |

- **Active phase:** Phase 7 — URL Normalization Cleanup
- **Current sub-phase:** γ — Implementation & validation (entered 2025-10-31)
- **Docs consulted this session:** `docs/DATABASE_URL_NORMALIZATION_PLAN.md`, `docs/CHANGE_PLAN.md`

