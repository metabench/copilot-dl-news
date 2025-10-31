# CLI Refactoring Tasks — Autonomous Execution Plan

**Date Created:** October 30, 2025  
**Status:** Phase 2 Complete → Phase 3 In Progress  
**Mode:** Continuous autonomous execution with progress tracking

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

### Phase 2: Completed ✅
- ✅ Create CliFormatter module
- ✅ Create CliArgumentParser wrapper
- ✅ Install commander.js
- ✅ Refactor validate-gazetteer.js
- ✅ Refactor analyze-domains.js
- ✅ Refactor detect-articles.js
- ✅ Document patterns and examples

**Result:** 3 pilot tools with beautiful output. Pattern established and proven.

---

### Phase 3: Refactor Remaining CLI Tools

#### Tier 1: High Priority (Core Tools)
These tools are frequently used and have poor output formatting.

| # | Tool | Path | Status | Priority | Notes |
|---|------|------|--------|----------|-------|
| 3.1 | find-place-hubs | `src/tools/find-place-hubs.js` | ✅ COMPLETED | HIGH | Resilient hub discovery (CLI facelift + missing-column guardrails) |
| 3.2 | guess-place-hubs | `src/tools/guess-place-hubs.js` | ✅ COMPLETED | HIGH | Hub pattern analysis |
| 3.3 | export-gazetteer | `src/tools/export-gazetteer.js` | ✅ COMPLETED | HIGH | Data export tool |
| 3.4 | populate-gazetteer | `src/tools/populate-gazetteer.js` | ✅ COMPLETED | HIGH | Data import/population |
| 3.5 | backfill-dates | `src/tools/backfill-dates.js` | ✅ COMPLETED | HIGH | Utility/maintenance |

#### Tier 2: Medium Priority (Analysis Tools)
Secondary analysis and reporting tools.

| # | Tool | Path | Status | Priority | Notes |
|---|------|------|--------|----------|-------|
| 3.6 | show-analysis | `src/tools/show-analysis.js` | ✅ COMPLETED | MEDIUM | Analysis display |
| 3.7 | analyse-pages-core | `src/tools/analyse-pages-core.js` | ✅ COMPLETED | MEDIUM | Page analysis |
| 3.8 | crawl-place-hubs | `tools/crawl-place-hubs.js` | ✅ COMPLETED | MEDIUM | Hub crawling (note: already has good output!) |
| 3.9 | count-testlogs | `tools/count-testlogs.js` | ✅ COMPLETED | MEDIUM | Log analysis |
| 3.10 | db-schema | `tools/db-schema.js` | ✅ COMPLETED | MEDIUM | Database inspection |

#### Tier 3: Lower Priority (Specialized Tools)
Special-purpose and less frequently used tools.

| # | Tool | Path | Status | Priority | Notes |
|---|------|------|--------|----------|-------|
| 3.11 | get-test-summary | `tests/get-test-summary.js` | ✅ COMPLETED | MEDIUM | Test reporting |
| 3.12 | get-failing-tests | `tests/get-failing-tests.js` | ✅ COMPLETED | LOW | Test queries |
| 3.13 | get-latest-log | `tests/get-latest-log.js` | ✅ COMPLETED | LOW | Log utilities |
| 3.14 | get-slow-tests | `tests/get-slow-tests.js` | ✅ COMPLETED | LOW | Performance analysis |
| 3.15 | intelligent-crawl | `tools/intelligent-crawl.js` | ✅ COMPLETED | LOW | Crawl analysis |

#### Tier 4: Infrastructure (May Not Need Refactoring)
These may already have good output or are internal utilities.

| # | Tool | Path | Status | Priority | Notes |
|---|------|------|--------|----------|-------|
| 3.16 | analysis-run | `src/tools/analysis-run.js` | ✅ COMPLETED | LOW | Background task runner |
| 3.17 | db-query | `tools/db-query.js` | ✅ COMPLETED | LOW | Query utility |
| 3.18 | compression-benchmark | `tools/compression-benchmark.cjs` | ✅ COMPLETED | LOW | Benchmark tool |
| 3.19 | vacuum-db | `tools/vacuum-db.js` | ✅ COMPLETED | LOW | Database maintenance |
| 3.20 | db-table-sizes | `tools/db-table-sizes.js` | ✅ COMPLETED | LOW | Database stats |

---

## Execution Strategy

### Per-Task Workflow

**BEFORE STARTING:**
1. Read task file (max 150 lines to start)
2. Identify current output format
3. Determine needed refactoring scope
4. Scan for inline SQL (look for `raw.prepare`, `db.prepare`, `db.exec`, raw `SELECT`/`INSERT` strings). Move any statements you find into the appropriate adapter under `src/db/sqlite/v1/queries/` before proceeding.
5. Check if it's already using CliFormatter (skip if yes)

**DURING EXECUTION:**
1. Create backup notes of original structure
2. Add CliFormatter + CliArgumentParser imports
3. Replace argument parsing with CliArgumentParser
4. Replace console.log/process.stdout with fmt.* calls
5. Test with sample data or --help flag

**AFTER EXECUTION:**
1. Mark task as COMPLETE
2. Record changes made
3. Note any special cases
4. Move to next task

### Batch Processing

Work in batches of 5 tasks per phase:
- Phase 3A: Tasks 3.1-3.5 (Tier 1 core tools)
- Phase 3B: Tasks 3.6-3.10 (Tier 2 analysis tools)
- Phase 3C: Tasks 3.11-3.15 (Tier 3 specialized tools)
- Phase 3D: Tasks 3.16-3.20 (Tier 4 infrastructure review)

After each batch, update this document with completion status.

---

## Task Details & Execution

### ✅ COMPLETE: Phase 2 Pilot Tools

#### 2.1 CliFormatter Module ✅
- **File:** `src/utils/CliFormatter.js`
- **Status:** COMPLETE
- **Changes:** 400+ lines of reusable output formatting
- **Methods:** 15+ (headers, tables, stats, progress, etc.)

#### 2.2 CliArgumentParser ✅
- **File:** `src/utils/CliArgumentParser.js`
- **Status:** COMPLETE
- **Changes:** 100+ lines, commander.js wrapper
- **Features:** Help generation, type coercion, validation

#### 2.3 validate-gazetteer.js ✅
- **File:** `src/tools/validate-gazetteer.js`
- **Status:** COMPLETE
- **Before:** Manual parsing, plain text output
- **After:** CliFormatter + CliArgumentParser, beautiful report
- **Lines saved:** ~25 lines boilerplate

#### 2.4 analyze-domains.js ✅
- **File:** `src/tools/analyze-domains.js`
- **Status:** COMPLETE
- **Before:** Tab-separated output, ad-hoc parsing
- **After:** ASCII table, color-coded results
- **Lines saved:** ~15 lines

#### 2.5 detect-articles.js ✅
- **File:** `src/tools/detect-articles.js`
- **Status:** COMPLETE
- **Before:** Complex manual parsing, plain output
- **After:** Clean parsing, section-based output, two modes
- **Lines saved:** ~20 lines

---

### ⏳ IN_PROGRESS: Phase 3A Tier 1 Tools

#### 3.1 find-place-hubs.js ✅
- **File:** `src/tools/find-place-hubs.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** HIGH
- **Summary:** Migrated to CliArgumentParser + CliFormatter and added schema-aware fallbacks so legacy SQLite snapshots without `host`, `section`, `analysis`, or `word_count` columns still run safely.
- **Key Changes:**
   - Replaced bespoke argument parser with CliArgumentParser (handles `--apply`, `--no-list`, help output).
   - Rebuilt console output with CliFormatter (header, stats, tables, footer).
   - Added dynamic PRAGMA column detection and URL host derivation to avoid `no such column` failures.
- **Validation:**
   - `node src/tools/find-place-hubs.js --help`
   - `node src/tools/find-place-hubs.js --limit 5`
- **Metrics:** ~90 lines touched (net +12) with duplicated parsing logic removed and robust fallbacks added.

#### 3.2 guess-place-hubs.js ✅
- **File:** `src/tools/guess-place-hubs.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** HIGH
- **Summary:** Refactored hub guessing CLI to use CliArgumentParser + CliFormatter with optional JSON output while buffering logs for clean machine-readable mode.
- **Key Changes:**
   - Replaced bespoke parser with CliArgumentParser (positional domains, `--json`, shared numeric flags) and updated the shared parser to allow excess arguments safely.
   - Added CliFormatter-driven sections for configuration, results, recent decisions, and optional verbose logs.
   - Introduced formatting helpers and logger buffering so verbose streams render nicely without contaminating JSON output.
- **Validation:**
   - `node src/tools/guess-place-hubs.js --help`
   - `node src/tools/guess-place-hubs.js example.com --limit 0 --json` (verifies JSON path + positional domain handling; halts when DB preconditions missing)
   - `node src/tools/find-place-hubs.js example.com --limit 1 --json` (regression check for shared parser positional support)

#### 3.3 export-gazetteer.js ✅
- **File:** `src/tools/export-gazetteer.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** HIGH
- **Summary:** Migrated gazetteer export tool to CliArgumentParser + CliFormatter, added JSON summary mode, and surfaced per-table counts while preserving NDJSON stream semantics.
- **Key Changes:**
   - Replaced bespoke argument parsing with standardized options (`--db`, `--out`, `--format`, `--quiet`).
   - Introduced structured summary output (ASCII or JSON) including record counts, duration, and file size; `--quiet` suppresses it.
   - Counted rows during export and retained `scrubExtra` logic; fallback still ensures database if read-only open fails.
- **Validation:**
   - `node src/tools/export-gazetteer.js --out tmp/test-gazetteer.ndjson --format json`

#### 3.4 populate-gazetteer.js ✅
- **File:** `src/tools/populate-gazetteer.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** HIGH
- **Scope:** Data import/population
- **Summary:** Completed end-to-end refactor with CliFormatter + CliArgumentParser, moved all SQL through the v1 populate query module, and upgraded verbose diagnostics to formatter-driven tables while preserving logger fallbacks for quiet mode.
- **Key Changes:**
   - Routed REST Countries and Wikidata insert/update flows through `createPopulateGazetteerQueries`, replacing inline SQL for names, hierarchy, ADM codes, and cleanup.
   - Added formatter-powered snapshot and delta tables (with quiet-mode fallbacks) to replace manual tab-delimited logging.
   - Ensured helper usage for hierarchy links, canonical selection, external IDs, and cleanup routines to keep adapters the single touchpoint.
- **Validation:**
   - `node src/tools/populate-gazetteer.js --help`
   - `node src/tools/populate-gazetteer.js --db tmp/populate-cli.db --offline --countries=GB --force --summary-format ascii`

#### 3.5 backfill-dates.js ✅
- **File:** `src/tools/backfill-dates.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** HIGH
- **Summary:** Modernized the backfill utility with CliArgumentParser + CliFormatter, routed every query through a new `createBackfillDatesQueries` adapter, and added structured summaries while preserving the legacy tab-delimited event stream for pipelines.
- **Key Changes:**
   - Replaced ad-hoc argument parsing with standardized flags (`--stream`, `--summary-format`, `--no-list-existing`) and configuration display.
   - Added `articles.backfillDates` query helper for batch selection, existing-date iteration, and updates; CLI now uses adapter instead of inline SQL.
   - Introduced ASCII/JSON summary output (with `--quiet` for JSON-only) plus event counter tracking.
- **Validation:**
   - `node src/tools/backfill-dates.js --help`

### ✅ COMPLETE: Phase 3B Tier 2 Tools (Partial)

#### 3.6 show-analysis.js ✅
- **File:** `src/tools/show-analysis.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** MEDIUM
- **Summary:** Migrated the analysis viewer to CliArgumentParser + CliFormatter, added JSON output, and routed SQL through `createShowAnalysisQueries` so the CLI no longer owns inline queries.
- **Key Changes:**
   - Swapped bespoke argument parsing for standardized options (`--db`, `--url`, `--verbose`, `--full-json`, `--json`).
   - Introduced formatter-driven sections for system status, HTTP metadata, storage metrics, and findings (including table previews).
   - Added JSON summary mode for automation and moved SQL lookups into `analysis.showAnalysis` adapter with robust error handling.
- **Validation:**
   - `node src/tools/show-analysis.js --help`
   - `node src/tools/show-analysis.js --url https://example.com --json`

### ⏳ NOT_STARTED: Remaining Phase 3B Tier 2 Tools

#### 3.7 analyse-pages-core.js ✅
- **File:** `src/tools/analyse-pages-core.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** MEDIUM
- **Summary:** Centralized every SQL statement behind `createAnalysePagesCoreQueries`, rewired the analysis loop to consume adapter helpers, and ensured decompression + hub persistence operate without touching raw statements. Added optional compression-bucket support detection with single warning emission and kept telemetry hooks intact.
- **Key Changes:**
   - Added `analysis.analysePagesCore` adapter exposing pending-analysis selection, bucket lookups, analysis updates, hub writes, and unknown-term persistence with shared connection handling.
   - Refactored the CLI worker to obtain queries once, wire helper functions (`loadHtmlForRow`, hub save paths) through the adapter, and streamline optional features (compression buckets, unknown-term capturing).
   - Tidied error handling so missing compression schema downgrades gracefully while preserving verbose logging.
- **Validation:**
   - `node -e "require('./src/tools/analyse-pages-core.js'); console.log('analyse-pages-core loaded')"`
   - `npx jest --runTestsByPath src/tools/__tests__/analyse-pages-core.hubs.test.js --bail=1 --maxWorkers=50%` *(blocked by jsdom/parse5 ESM import; noted for follow-up)*

#### 3.8 crawl-place-hubs.js ✅
- **File:** `tools/crawl-place-hubs.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** MEDIUM
- **Refactor Plan:**
   1. Swap bespoke chalk logging + manual argv parsing for `CliFormatter` + `CliArgumentParser`, keeping lively runtime messaging while aligning configuration/summaries with the shared pattern.
   2. Extract place hub selection queries into `createCrawlPlaceHubsQueries` under `src/db/sqlite/v1/queries/`, removing inline SQL from the CLI.
   3. Enforce `--max-pages` as a positive integer with updated help/summary messaging so max limits actually cut off long crawls and default to "unlimited" only when omitted.
   4. Emit structured configuration and completion summaries (ASCII and JSON modes) and ensure crawler overrides pipe through formatter-aware logs without regressing existing behavior.
- **Summary:** CLI now enforces positive `--max-pages`, surfaces clearer help/summary text, and preserves quiet/JSON automation flows while leaving runtime progress streams intact. Queries remain routed through the existing adapter, and new validation guardrails prevent unlimited crawls by mistake.
- **Validation:**
   - `node tools/crawl-place-hubs.js --max-pages 0 --depth 0 --summary-format ascii`
   - `node tools/crawl-place-hubs.js --max-pages 1 --summary-format json --quiet`

#### 3.9 count-testlogs.js ✅
- **File:** `tools/count-testlogs.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** MEDIUM
- **Summary:** Migrated the test log counter to CliArgumentParser + CliFormatter, providing structured ASCII output by default and JSON summaries for automation while retaining simple flags for breakdown and verbose listings.
- **Key Changes:**
   - Standardized CLI options (`--path`, `--breakdown`, `--verbose`, `--summary-format`, `--quiet`) and added graceful EPIPE handling for shell pipelines.
   - Produced formatter-driven sections for totals, recent files, optional suite breakdowns, and verbose listings, including humanized byte sizes and ISO timestamps.
   - Added JSON payloads mirroring the ASCII report, enhanced missing-directory feedback, and normalized filename parsing for suite detection.
- **Validation:**
   - `node tools/count-testlogs.js --help`
   - `node tools/count-testlogs.js --breakdown`
   - `node tools/count-testlogs.js --summary-format json --quiet`

#### 3.10 db-schema.js ✅
- **File:** `tools/db-schema.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** MEDIUM
- **Refactor Plan:**
   1. Replace bespoke argv parsing with `CliArgumentParser`, exposing `--db`, `--summary-format`, `--quiet`, and capturing positional subcommands (`tables`, `table`, `indexes`, `foreign-keys`, `stats`).
   2. Introduce formatter-driven rendering for each subcommand (tables, table detail, indexes, foreign keys, stats) plus JSON payload mirroring results; add helpful metadata like database path and table counts.
   3. Harden error handling (missing command, unknown table/index, absent database path) and remove progress `stderr` writes in favor of clear formatter messaging.
- **Summary:** CLI now standardizes parsing/output, adds ASCII sections for every subcommand, and provides clean JSON payloads (pretty or quiet) while guarding for missing databases, unknown tables, and EPIPE conditions. Rendering logic maps raw schema metadata into formatter tables and ensures row counts include error context when queries fail.
- **Validation:**
   - `node tools/db-schema.js tables`
   - `node tools/db-schema.js table articles`
   - `node tools/db-schema.js indexes articles`
   - `node tools/db-schema.js stats --summary-format json`
   - `node tools/db-schema.js stats --quiet`
   - `node tools/db-schema.js tables --db data\missing.db`

---

### 🚧 IN_PROGRESS: Phase 3C Tier 3 Tools (Partial)

#### 3.11 get-test-summary.js ✅
- **File:** `tests/get-test-summary.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** MEDIUM
- **Summary:** CLI now uses `CliArgumentParser` + `CliFormatter`, delivers consistent ASCII sections for summary/resolved/failing blocks, supports compact one-liners, and emits clean JSON (pretty or quiet) without shell noise. Positional suite filters coexist with `--suite`, fallback detection stays intact, and exit codes still mirror failure counts.
- **Key Changes:**
   - Introduced standardized parsing (`--suite`, `--summary-format`, `--quiet`, `--json`, `--compact`) with validation that quiet mode only applies to JSON.
   - Replaced manual console output with formatter-driven headers, stats, lists, and info/warn notes for suspect ALL suites, fallback logs, and broken-suite counts.
   - Added JSON/quiet emitters plus compact formatter preserving previous telemetry fields while avoiding duplicate message spam.
- **Validation:**
   - `node tests/get-test-summary.js`
   - `node tests/get-test-summary.js --json`
   - `node tests/get-test-summary.js --summary-format json --quiet`
   - `node tests/get-test-summary.js --compact`
   - `node tests/get-test-summary.js unit`

#### 3.12 get-failing-tests.js ✅
- **File:** `tests/get-failing-tests.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** LOW
- **Summary:** Rebuilt the failing-test reporter on top of `CliArgumentParser` + `CliFormatter`, added structured ASCII and JSON emitters for latest summaries and history snapshots, and enforced quiet-mode JSON to keep automation output clean. Normalized positional suite filters, surfaced history metadata (attempt counts, runtimes, exit codes), and tightened error paths when no failures or logs exist.
- **Key Changes:**
   - Introduced `createParser` + `normalizeOptions` helpers to handle positional suite filters, `--history`, `--logs`, `--simple`, `--count`, and JSON/quiet aliases with guardrails against invalid flag combinations.
   - Added builder/render pairs (`buildLatestReport`, `renderLatestAscii`, `emitLatestJson`, `buildHistoryReport`, etc.) so ASCII tables and JSON payloads share the same enriched record structures, including runtime, attempts, and stored failure message excerpts.
   - Ensured quiet mode requires JSON, emits machine-readable payloads only, and corrected process exit handling (no stray `process.EXITCODE`).
- **Validation:**
   - `node tests/get-failing-tests.js`
   - `node tests/get-failing-tests.js --history`
   - `node tests/get-failing-tests.js --summary-format json --quiet`
   - `node tests/get-failing-tests.js --json --quiet`
   - `node tests/get-failing-tests.js --count`
   - `node tests/get-failing-tests.js --count --json`
   - `node tests/get-failing-tests.js --simple --json`
   - `node tests/get-failing-tests.js --quiet` *(expected error path)*
   - `node tests/get-failing-tests.js --history --json --quiet`

#### 3.13 get-latest-log.js ✅
- **File:** `tests/get-latest-log.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** LOW
- **Summary:** Upgraded the log locator to `CliArgumentParser` + `CliFormatter`, added ASCII/JSON summaries with suite filter context, and enforced quiet-mode JSON so automation pipelines receive machine-readable output only. Sorting now relies on filesystem mtimes with suite fallbacks for legacy filenames.
- **Key Changes:**
   - Introduced parser normalization for positional suite filters plus `--json`, `--summary-format`, and quiet guardrails (quiet ⇒ JSON).
   - Added metadata collectors for suite, timestamp hints, and file stats, rendering structured ASCII sections (header, summary, path) and mirroring payloads in JSON with human-readable byte sizes.
   - Hardened error handling for missing directories and absent suite matches, reusing `CliError` exit codes and EPIPE handling consistent with other tools.
- **Validation:**
   - `node tests/get-latest-log.js`
   - `node tests/get-latest-log.js unit`
   - `node tests/get-latest-log.js --summary-format json --quiet`
   - `node tests/get-latest-log.js --json --quiet`
   - `node tests/get-latest-log.js unit --json`

#### 3.14 get-slow-tests.js ✅
- **File:** `tests/get-slow-tests.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** LOW
- **Summary:** Modernized the slow-test reporter with `CliArgumentParser` + `CliFormatter`, added JSON/quiet support, and reused `get-latest-log` helpers to avoid spawning subprocesses. The CLI now surfaces structured summaries, color-coded tables, and machine-readable payloads while guarding for missing log sections and invalid thresholds.
- **Key Changes:**
   - Normalized argument parsing (positional threshold + suite, `--count`, `--summary-format`, `--json`, `--quiet`) with validation that quiet mode only targets JSON and thresholds remain positive.
   - Replaced manual logging with formatter-driven header/summary/table output, including runtime highlighting and failure emphasis; JSON payload mirrors stats, notes, and per-test details.
   - Imported `findLatestLogEntry`/`buildLatestLogJson` from `get-latest-log.js` (now exportable) to locate logs synchronously, eliminating `execSync` usage and adding clear error messaging for missing directories/logs.
- **Validation:**
   - `node tests/get-slow-tests.js`
   - `node tests/get-slow-tests.js 3 unit`
   - `node tests/get-slow-tests.js --count`
   - `node tests/get-slow-tests.js --summary-format json --quiet`
   - `node tests/get-slow-tests.js --count --summary-format json`

#### 3.15 intelligent-crawl.js ✅
- **File:** `tools/intelligent-crawl.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** LOW
- **Summary:** Standardized the intelligent crawl CLI around `CliArgumentParser` and `CliFormatter`, added structured crawl/verification summaries, and introduced quiet-mode JSON reporting with captured progress logs.
- **Key Changes:**
   - Replaced bespoke argument parsing with a parser-driven declaration that covers limits, filters, verification toggles, and summary-format/quiet combinations with upfront validation.
   - Rebuilt reporting via `CliFormatter` for both verification and crawl runs, emitting consistent headers, sections, tables, and machine-readable payloads while preserving prior ASCII output.
   - Added log interception so quiet JSON mode returns structured results alongside captured progress, and promoted crawler config/coverage metadata into formatter summaries.
- **Validation:**
   - `node tools/intelligent-crawl.js --help`
   - `node tools/intelligent-crawl.js --quick-verification --summary-format json --quiet`
   - `node tools/intelligent-crawl.js --quick-verification`

---

### ⏳ PENDING_REVIEW: Phase 3D Tier 4 Tools

#### 3.16 analysis-run.js ✅
- **File:** `src/tools/analysis-run.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** LOW
- **Summary:** Modernized the analysis runner CLI to use `CliArgumentParser` + `CliFormatter`, added explicit `--no-progress-logging`, and surfaced a structured completion summary without disrupting legacy `[analysis-run]` streaming logs or programmatic `runAnalysis` usage.
- **Key Changes:**
   - Introduced a shared parser factory that maps all legacy flags (db/limits/skip/dry-run/benchmark/piechart/run-id) and defaults the news.db path via `findProjectRoot`.
   - Added formatter-driven summary output (header, configuration stats, stage table, highlights) that appears after runs while preserving raw progress lines for existing tests and tooling.
   - Hardened CLI error handling to emit formatted errors, retained exported `parseArgs`, and wired `--no-progress-logging` through to the existing progress sink logic.
- **Validation:**
   - `node src/tools/analysis-run.js --help`
   - `node src/tools/analysis-run.js --skip-pages --skip-domains --dry-run --no-progress-logging`

#### 3.17 db-query.js ✅
- **File:** `tools/db-query.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** LOW
- **Summary:** Refactored the read-only query helper to use `CliArgumentParser` + `CliFormatter`, added `--list` discovery mode, and routed database access through the v1 `openDatabase` helper while preserving clean JSON output for automation.
- **Key Changes:**
   - Standardized CLI options (`--db`, `--sql`, `--file`, `--list`, `--format`, `--limit`, `--quiet`, `--json`) with validation that flags are not combined in unsafe ways and that only read-safe statements are permitted.
   - Replaced manual table rendering with formatter-driven sections (execution metadata, results, summary) including row limiting notices and optional quiet footer suppression.
   - Leveraged `findProjectRoot` for default database resolution, introduced optional `DB_QUERY_DEBUG` logging for positional parsing diagnostics, and ensured SQLite connections open via the shared adapter in read-only/fileMustExist mode.
- **Validation:**
   - `node tools/db-query.js --help`
   - `node tools/db-query.js --list --limit 5`
   - `node tools/db-query.js --sql "SELECT COUNT(*) AS count FROM analysis_runs" --json`

#### 3.18 compression-benchmark.cjs ✅
- **File:** `tools/compression-benchmark.cjs`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** LOW
- **Summary:** Rebuilt the compression benchmark around `CliArgumentParser` + `CliFormatter`, added structured summaries for both single-level and multi-level runs, and delivered machine-readable JSON/quiet output without disturbing verbose per-article logs.
- **Key Changes:**
   - Normalized option parsing (including `--summary-format`/`--quiet` guardrails and null-safe `--compare-levels`) while keeping worker-based comparison mode intact.
   - Replaced bespoke console logging with formatter-driven sections covering configuration, timing percentiles, dataset projections, database comparisons, and recommendation bullets; introduced shared helpers for ASCII + JSON emission.
   - Computed consistent aggregate metrics (totals, averages, throughput, storage deltas) with guardrails against divide-by-zero, ensuring compression timing accumulates correctly in both single-threaded and worker modes.
- **Validation:**
   - `node tools/compression-benchmark.cjs --help`
   - `node tools/compression-benchmark.cjs --limit 3 --algorithm brotli --level 5 --threads 1 --batch-size 1`
   - `node tools/compression-benchmark.cjs --limit 2 --algorithm brotli --level 5 --summary-format json --quiet`

#### 3.19 vacuum-db.js ✅
- **File:** `tools/vacuum-db.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** LOW
- **Summary:** Standardized the maintenance CLI with shared parser/formatter support, added JSON output for automation, and captured reclaimed-byte metrics with duration tracking.
- **Key Changes:**
   - Replaced bespoke argument parsing with CliArgumentParser options for database selection, summary format, and quiet JSON mode.
   - Introduced CliFormatter-driven ASCII summaries plus machine-readable payloads detailing reclaimed space, percentages, and elapsed time.
   - Swapped legacy `ensureDb` usage for the modern `openDatabase` helper and hardened filesystem error handling to surface clear CLI errors.
- **Validation:**
   - `node tools/vacuum-db.js --help`
   - `node tools/vacuum-db.js --summary-format json --quiet`

#### 3.20 db-table-sizes.js ✅
- **File:** `tools/db-table-sizes.js`
- **Status:** ✅ COMPLETED (2025-10-30)
- **Priority:** LOW
- **Summary:** Rebuilt the table-size analyzer around CliArgumentParser/CliFormatter, added JSON/quiet output, and replaced ad-hoc logging with structured dbstat summaries plus CLI/worker fallbacks.
- **Key Changes:**
   - Introduced standardized options for mode selection (`auto|cli|worker|size`), table limits, JSON output, and download controls using CliArgumentParser.
   - Implemented direct `dbstat` collection via better-sqlite3 with formatter-driven ASCII tables and machine-readable payloads, including file-size context and duration metrics.
   - Preserved sqlite3 CLI and worker-thread fallbacks with guarded downloads, consolidated progress messaging through CliFormatter, and surfaced actionable notes in summaries.
   - Enforced JSON quiet output to honor `--limit`, exposing `tablesDisplayed`/`hiddenTableCount` metadata so automation results align with the ASCII view.
- **Validation:**
   - `node tools/db-table-sizes.js --help`
   - `node tools/db-table-sizes.js --limit 5`
   - `node tools/db-table-sizes.js --limit 3 --summary-format json --quiet` (validates quiet JSON limit enforcement)

---

### Phase 4: Hub Guessing Workflow Modernization (New Scope)

Tasks map to the expanded modernization initiative captured in `CHANGE_PLAN.md`. Complete after Phase 3A unless dependencies require earlier groundwork.

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 4.1 | Candidate Storage & Telemetry Foundations | New `place_hub_candidates` table, shared `recordFetchResult`, HubValidator HTML reuse + metrics | ✅ COMPLETED | HIGH | Unlocks downstream batching and audit workflows — 2025-10-30: HubValidator now accepts provided HTML and emits structured metrics; guess-place-hubs now writes candidates + validation telemetry via shared fetch recorder |
| 4.2 | CLI Workflow Enhancements | Multi-domain batching, CSV `--import`, `--apply` diff preview, `--emit-report` JSON snapshots | 🚧 IN_PROGRESS | HIGH | Steps 0-5 complete; testing (step 6) remains |
| 4.3 | Swagger/OpenAPI Server Infrastructure | Standalone OpenAPI 3.x server with full API documentation, UI-independent endpoints | 🚧 IN_PROGRESS | HIGH | Stage 1 complete: Orchestration layer extracted, API routes implemented, tests passing (5/5). CLI tool refactored to use orchestration layer (removed 1194 lines of inline business logic). |
| 4.4 | Evidence Persistence & Auditing | Persist validator metrics into `place_hubs` and populate new `place_hub_audit` table | ⏳ NOT_STARTED | HIGH | Requires 4.1 structured validator output |
| 4.5 | Scheduling & Batch Automation | Integrate background scheduler + queue definitions, persist batch metadata for reuse | ⏳ NOT_STARTED | MEDIUM | Feeds run history used by 4.6 dashboards |
| 4.6 | Observability & Dashboards | SSE events, `/analysis` dashboard updates, archive summaries to `analysis_runs` | ⏳ NOT_STARTED | MEDIUM | Builds on 4.2 reports + 4.5 scheduler data |
| 4.7 | Testing & Documentation Updates | Fixtures for mixed responses, docs refresh for guess → validate → export workflow | ⏳ NOT_STARTED | HIGH | Final verification phase |

#### Phase 4 Sub-Phase Tracker
- **Active phase:** Phase 4 — Hub Guessing Workflow Modernization
- **Current sub-phase:** γ — Implementation & validation (entered 2025-10-30)
- **Sub-phase timeline:**
   - α — Deep discovery & tooling inventory (completed 2025-10-30)
   - β — Plan & documentation (completed 2025-10-30)
- **Docs consulted during α:** `AGENTS.md` (Topic Index), `docs/PLACE_HUB_HIERARCHY.md`, `docs/hub-content-analysis-workflow.md`, `CHANGE_PLAN_HUB_GAP_ANALYZER.md`
- **Code reconnaissance:** `src/tools/guess-place-hubs.js`, `src/db/placeHubCandidatesStore.js`, `src/db/sqlite/v1/queries/guessPlaceHubsQueries.js`, `src/hub-validation/HubValidator.js`
- **Tooling inventory:** Current CLI summary renderer, `place_hub_candidates` store, `createFetchRecorder` instrumentation, existing guess→validate flow
- **Risks noted:** Applying multi-domain batches must avoid duplicate hub writes, diff preview needs transaction-safe staging, CSV import must normalize domains consistently
- **β objectives:** Maintain `CHANGE_PLAN.md` as single source of truth (done), expand task breakdown for 4.2–4.6, and prepare validation/test matrices prior to implementation

#### Task 4.2 Execution Breakdown (β planning)
0. ✅ Break the `ensureDb` ⇄ `seed-utils` circular require so SQLite helpers load without warnings (plan documented in `CHANGE_PLAN.md`, remove unused imports, verify via CLI smoke test).
1. ✅ Extend argument parsing to accept multiple domains (`--domain` repeatable, positional list, `--domains`, `--import` CSV) and produce normalized batch descriptors.
2. ✅ Introduce batch orchestrator (`runGuessPlaceHubsBatch`) that iterates domains sequentially, reusing existing `guessPlaceHubs` core and aggregating summaries. *Orchestrator complete with readiness timeout budgeting, probe diagnostics, and diff preview rendering.*
3. ✅ Implement diff preview pipeline for `--apply` (collect existing hubs, compute insert/update sets, render via CliFormatter, expose JSON payload). *Multi-domain ASCII tables live; JSON summaries now include cloned diff arrays + counts for aggregate and per-domain views.*
4. ✅ Add `--emit-report` support (optional path or auto timestamp) emitting structured JSON for each run; include per-domain stats, candidate metrics, diff preview, error summaries. *Report writer complete with enriched payloads including `candidateMetrics` (generated/cached/validated/persisted), `validationSummary` (pass/fail/reasons), diff preview, timing metadata, and per-domain breakdowns.*
5. ✅ Update CLI summary renderer for batch output (per-domain tables + roll-up stats) while retaining quiet/JSON behaviors. *Batch summaries now surface run duration, validation counts, and top failure reasons.*
6. ⬜ Ensure candidate store + fetch recorder remain compatible with batch processing (reset attempt counters, run IDs) and add focused tests/fixtures covering new paths.

#### Task 4.3 Swagger/OpenAPI Server Implementation (β planning)

**Objective:** Create a standalone OpenAPI 3.x-compliant API server with Swagger UI, comprehensive endpoint documentation, and machine-readable API specs for headless consumers (CLI tools, automation scripts, future dashboards).

**Implementation Stages:**

**Stage 1: OpenAPI Infrastructure Setup** ✅ COMPLETED (2025-10-30)
1. ✅ Install dependencies: `swagger-ui-express`, `swagger-jsdoc`, `js-yaml` (for spec authoring)
2. ✅ Create OpenAPI 3.0.3 specification at `src/api/openapi.yaml` with server metadata, info, contact, license
3. ✅ Add Swagger UI middleware to Express app at `/api-docs` with custom branding and API explorer features
4. ✅ Create orchestration layer in `src/orchestration/` with dependency injection and pure business logic
5. ✅ Implement `/api/place-hubs/*` endpoints using orchestration layer (POST /guess, GET /readiness/:domain)
6. ✅ Create integration tests for orchestration layer (5/5 passing)
7. ✅ Refactor CLI tool `src/tools/guess-place-hubs.js` to use orchestration layer:
   - Removed 1194 lines of inline orchestration logic (8 functions)
   - Reduced file from 2737 lines to 1543 lines (44% reduction)
   - CLI now thin wrapper around orchestration layer (argument parsing + output formatting only)
   - Both CLI and API now use same business logic via dependency injection
   - Verified CLI still works: `node src/tools/guess-place-hubs.js --help` and live domain test
   - All orchestration tests passing (5/5)

**Refactoring Details:**
- **Functions Removed:** `defaultLogger`, `assessDomainReadiness`, `createBatchSummary`, `createFailedDomainSummary`, `runGuessPlaceHubsBatch`, `composeCandidateSignals`, `selectPlaces`, `guessPlaceHubs`
- **Functions Kept:** CLI-specific helpers (parseCliArgs, buildDomainBatchInputs, renderSummary, buildJsonSummary, writeReportFile, normalizeDomain, extractTitle, resolveDbPath, etc.)
- **New Imports:** `guessPlaceHubsBatch` from `../orchestration/placeHubGuessing`, `createPlaceHubDependencies` from `../orchestration/dependencies`
- **Backup Created:** `src/tools/guess-place-hubs.js.backup` (original 2727 lines preserved)

**Stage 2: Core API Endpoint Documentation**
1. Document existing crawl management endpoints:
   - `GET /api/crawls` - List all crawl jobs with filtering/pagination
   - `POST /api/crawl` - Start new crawl job
   - `GET /api/crawls/:id` - Get crawl job details
   - `POST /api/crawls/:id/pause` - Pause running crawl
   - `POST /api/crawls/:id/resume` - Resume paused crawl
   - `DELETE /api/crawls/:id` - Clear/cancel crawl
2. Document background task endpoints:
   - `GET /api/background-tasks` - List background tasks
   - `POST /api/background-tasks` - Create new background task
   - `GET /api/background-tasks/:id` - Get task details
   - `POST /api/background-tasks/:id/pause` - Pause task
   - `POST /api/background-tasks/:id/resume` - Resume task
3. Document analysis endpoints:
   - `GET /api/analysis` - List analysis runs
   - `GET /api/analysis/:id` - Get analysis details
   - `POST /api/analysis/run` - Trigger analysis

**Stage 3: Hub Guessing Workflow API Endpoints (NEW)**
1. `POST /api/place-hubs/guess` - Batch hub guessing endpoint
   - Request body: domains array, options (kinds, limits, readiness timeout)
   - Response: Job ID for async processing or synchronous results for small batches
   - Documentation: Full request/response schemas, error codes, examples
2. `GET /api/place-hubs/candidates` - Query candidate hub storage
   - Query params: domain, place_kind, status filters, pagination
   - Response: Paginated candidate list with validation metrics
3. `GET /api/place-hubs/reports` - List saved reports
   - Query params: date range, domain filters
   - Response: Report metadata with download links
4. `GET /api/place-hubs/reports/:id` - Download specific report JSON
5. `POST /api/place-hubs/validate` - Validate hub URLs (sync endpoint for small batches)
   - Request body: URLs array, validation options
   - Response: Validation results with structured metrics
6. `GET /api/place-hubs/readiness/:domain` - Check domain readiness for hub guessing
   - Response: Readiness status, DSPL coverage, recommendations

**Stage 4: Schema Definitions & Examples**
1. Define reusable OpenAPI components:
   - `CrawlJob` schema (status, progress, config)
   - `BackgroundTask` schema (type, status, progress, result)
   - `AnalysisRun` schema (url, findings, metrics)
   - `PlaceHubCandidate` schema (domain, url, place, validation metrics)
   - `HubGuessReport` schema (batch summary, domain breakdowns, diff preview)
   - `ValidationMetrics` schema (confidence scores, failure reasons)
   - `ReadinessStatus` schema (status, reason, recommendations, probe metrics)
2. Add comprehensive request/response examples for each endpoint
3. Document error response schemas (4xx/5xx with consistent structure)
4. Add authentication/authorization placeholders (for future OAuth/JWT integration)

**Stage 5: API Testing & Validation**
1. Create OpenAPI validation test suite:
   - Verify spec validity using `swagger-parser`
   - Test all documented endpoints match actual routes
   - Validate request/response schemas against live API
2. Add integration tests for new hub guessing endpoints:
   - `POST /api/place-hubs/guess` with single/batch domains
   - Candidate query filtering and pagination
   - Report download and listing
3. Generate Postman collection from OpenAPI spec for manual testing
4. Add `npm run api:docs` script to regenerate/validate OpenAPI spec

**Stage 6: Documentation & Developer Guide**
1. Create `docs/API_DOCUMENTATION.md` with:
   - Getting started guide (running server, accessing Swagger UI)
   - Authentication setup (when implemented)
   - Common usage patterns (batch hub guessing workflow)
   - Rate limiting and error handling conventions
   - Webhook/SSE integration examples
2. Update `README.md` with API server quick start
3. Add JSDoc comments to all route handlers with OpenAPI annotations
4. Create API client examples (Node.js, Python, curl)

**Validation Commands:**
- `npm run dev` - Start server with Swagger UI at `http://localhost:3000/api-docs`
- `curl http://localhost:3000/api-docs.json | jq .` - Verify OpenAPI spec
- `npm run api:validate` - Run OpenAPI spec validation
- `npm test -- --testPathPattern=api` - Run API integration tests

**Success Criteria:**
- ✅ Swagger UI accessible and navigable
- ✅ All existing endpoints documented with request/response schemas
- ✅ New hub guessing endpoints implemented and documented
- ✅ OpenAPI spec passes validation (swagger-parser)
- ✅ Integration tests verify endpoint behavior matches documentation
- ✅ Postman collection generated for manual testing

---

## Progress Tracking

### Batch Summary

| Batch | Tasks | Target | Status | Completion |
|-------|-------|--------|--------|------------|
| **Phase 2** | 5 | Pilot tools | ✅ COMPLETE | 100% |
| **Phase 3B** | 3.6-3.10 | Tier 2 (MEDIUM) | ✅ COMPLETE | 100% |
| **Phase 3C** | 3.11-3.15 | Tier 3 (LOW) | ✅ COMPLETE | 100% |
| **Phase 3D** | 3.16-3.20 | Tier 4 (REVIEW) | ✅ COMPLETE | 100% |
| **Phase 4** | 4.1-4.7 | Hub Guessing Workflow + API | 🚧 IN PROGRESS | 36% |

### Overall Progress
- **Completed:** 26 tasks (Phase 2 + Tasks 3.1-3.20 + Task 4.1)
- **Substantially Complete:** 1 task (Task 4.2: steps 0-5 complete, step 6 testing remains)
- **Remaining:** 5 tasks (4.3–4.7)
- **Total:** 32 tasks
- **Completion Rate:** 84% (27/32 counting Task 4.2 as 83% complete)

---

## Execution Log

### Session 1: October 30, 2025
- ✅ Created CliFormatter module
- ✅ Created CliArgumentParser wrapper
- ✅ Installed commander.js dependency
- ✅ Refactored 3 pilot tools (validate-gazetteer, analyze-domains, detect-articles)
- ✅ Created comprehensive documentation
- **Next:** Start Phase 3A (Tier 1 tools) - find-place-hubs, guess-place-hubs, export-gazetteer, populate-gazetteer, backfill-dates

### Session 2: October 30, 2025
- ✅ Completed Task 3.1 (`find-place-hubs.js`) with resilient schema fallbacks and refreshed output.
- ✅ Completed Task 3.2 (`guess-place-hubs.js`) with CliFormatter output, JSON fallback, and positional argument support via shared parser update.
- 🔄 Next Targets: Task 3.3 (`export-gazetteer.js`), Task 3.4 (`populate-gazetteer.js`).
- **Strategy:** Continue sequentially through Phase 3A (Tier 1) without pauses, updating this log after each task.

### Session 3: October 30, 2025
- ✅ Completed Task 3.3 (`export-gazetteer.js`) — ASCII/JSON summaries with row counts, quiet mode compatibility.
- ✅ Completed Task 3.4 (`populate-gazetteer.js`) — adapter-backed SQL, formatter tables for verbose snapshots, and offline verification run against a temp database.
- 🔄 Next Targets: Begin Task 3.5 (`backfill-dates.js`).

### Session 4: October 30, 2025
- ✅ Completed Task 3.5 (`backfill-dates.js`) — standardized CLI parsing/output, centralized queries in `articles.backfillDates`, and added structured summaries while preserving the legacy stream.
- 🔄 Next Targets: Kick off Phase 3B starting with Task 3.6 (`show-analysis.js`).

### Session 5: October 30, 2025
- ✅ Completed Task 3.6 (`show-analysis.js`) — CLI now uses CliFormatter/CliArgumentParser, SQL is centralized in `analysis.showAnalysis`, and JSON automation mode added.
- 🔄 Next Targets: Proceed to Task 3.7 (`analyse-pages-core.js`).

### Session 6: October 30, 2025
- ✅ Completed Task 3.7 (`analyse-pages-core.js`) — Introduced the `analysis.analysePagesCore` adapter and rewired the worker to consume adapter helpers for analysis updates, hub persistence, and compression buckets while maintaining telemetry hooks.
- ⚠️ Focused Jest run (`analyse-pages-core.hubs.test.js`) currently blocked by upstream jsdom/parse5 ESM transform requirement; module load sanity check passes. Logged for follow-up when addressing repo-wide Jest ESM setup.
- 🔄 Next Targets: Task 3.8 (`crawl-place-hubs.js`).

### Session 7: October 30, 2025
- ✅ Completed Task 3.8 (`crawl-place-hubs.js`) — Tightened `--max-pages` validation, refreshed help/summary text, and confirmed quiet JSON mode emits clean summaries while preserving streaming progress output.
- 🔄 Next Targets: Task 3.9 (`count-testlogs.js`).

### Session 8: October 30, 2025
- ✅ Completed Task 3.9 (`count-testlogs.js`) — Introduced CliFormatter/CliArgumentParser, added JSON payloads, and enhanced breakdown/verbose reporting with human-readable sizes.
- 🔄 Next Targets: Task 3.10 (`db-schema.js`).

### Session 9: October 30, 2025
- ✅ Completed Task 3.10 (`db-schema.js`) — Overhauled parsing/output with CliArgumentParser + CliFormatter, added JSON/quiet modes, and verified all subcommands plus error handling.
- 🔄 Next Targets: Task 3.11 (`tests/get-test-summary.js`).

### Session 10: October 30, 2025
- ✅ Completed Task 3.11 (`tests/get-test-summary.js`) — Standardized parsing/output, added compact + JSON/quiet emitters, and validated suite filtering along with fallback messaging.
- 🔄 Next Targets: Task 3.12 (`tests/get-failing-tests.js`).

### Session 11: October 30, 2025
- ✅ Completed Task 3.12 (`tests/get-failing-tests.js`) — Formatter/Parser integration plus enriched latest/history reporting with strict quiet-mode validation.
- ✅ Completed Task 3.13 (`tests/get-latest-log.js`) — Added formatter-driven summaries, JSON payloads, and quiet-mode guardrails while reusing shared log helpers.
- 🔄 Next Targets: Task 3.14 (`tests/get-slow-tests.js`).

### Session 12: October 30, 2025
- ✅ Completed Task 3.14 (`tests/get-slow-tests.js`) — Adopted shared parser/output helpers, removed execSync, and ensured JSON/quiet flows stay clean.
- ✅ Completed Task 3.15 (`tools/intelligent-crawl.js`) — Wrapped verification + crawl flows with formatter summaries and quiet JSON mode.
- 🔄 Next Targets: Task 3.16 (`src/tools/analysis-run.js`).

### Session 13: October 30, 2025
- ✅ Completed Task 3.16 (`src/tools/analysis-run.js`) — Swapped to shared parser, added formatter summaries, and preserved legacy streaming logs with opt-out progress.
- 🔄 Next Targets: Task 3.17 (`tools/db-query.js`).

### Session 14: October 30, 2025
- ✅ Completed Task 3.17 (`tools/db-query.js`) — Standardized parsing/output, added `--list` discovery mode, and wired read-only connections through the v1 adapter.
- 🔄 Next Targets: Task 3.19 (`tools/vacuum-db.js`).

### Session 15: October 30, 2025
- ✅ Completed Task 3.19 (`tools/vacuum-db.js`) — Migrated to CliArgumentParser/CliFormatter, emitted ASCII + JSON summaries, and modernized database access while surfacing reclaimed-space metrics.
- 🔄 Next Targets: Task 3.20 (`tools/db-table-sizes.js`).

### Session 16: October 30, 2025
- ✅ Completed Task 3.20 (`tools/db-table-sizes.js`) — Replaced the legacy CLI downloader with formatter-driven dbstat summaries, preserved CLI/worker fallbacks, and added JSON/quiet output.
- ✅ Patched quiet JSON mode to respect `--limit` and expose `tablesDisplayed`/`hiddenTableCount` metadata for automation consumers.
- 🏁 Phase 3 refactor complete — all CLI tools now share the standardized parser/formatter pattern.

### Session 17: October 30, 2025
- ✅ Completed Phase 4 discovery sweep covering docs, code, and tooling inventory.
- ✅ Updated `CHANGE_PLAN.md` to steer Hub Guessing Workflow modernization (Tasks 4.2–4.6) with detailed sub-phase plan.
- ✅ Logged early-exit/readiness investigation (γ) with remediation plan (indexes + timeout + summaries) ahead of implementation.
- 🔄 Next Targets: Enter sub-phase γ with Task 4.2 (CLI workflow enhancements) once validation matrix is drafted.

### Session 18: October 30, 2025
- ✅ Implemented readiness probe budgeting: added `--readiness-timeout`, wired orchestration defaults, and surfaced elapsed/diagnostic data in summaries + JSON output.
- ✅ Hardened SQLite readiness probes by creating host/domain indexes and capturing completed vs. skipped metrics for each domain.
- ✅ Updated `CHANGE_PLAN.md` and this tracker with readiness progress and remaining coverage work.
- ✅ Executed Task 4.2 step 0 by removing unused imports in `ensureDb.js`/`seed-utils.js`, eliminating the circular require and confirming via `node -e "require('./src/db/sqlite/ensureDb'); console.log('ensureDb loaded')"` that warnings no longer appear.
- � Extended ASCII summary output with proposed hub change tables and dry-run diff counts; JSON/report payloads to be finalized alongside `--emit-report`.
- �🔄 Next Targets: Finish diff preview pipeline and emit-report writer for Task 4.2, then add focused Jest coverage for the new readiness flows.

### Session 19: October 30, 2025
- ✅ Completed diff preview pipeline: ASCII tables surface proposed inserts/updates and JSON summaries now carry cloned diff arrays with aggregate counts for batch + per-domain views.
- ✅ Added `buildJsonSummary` + `writeReportFile` helpers so `--json` emits enriched payloads and `--emit-report` writes structured summaries with automatic directory handling.
- ✅ Extended report payload with candidate metrics (generated, cached, validated, persisted) and validation summaries (pass/fail counts + failure reason distribution) at both aggregate and per-domain levels.
- ✅ Enhanced CLI summary renderer to display run duration, validation metrics, and top failure reasons alongside existing stats.
- 🔄 Next Targets: Author focused tests for diff preview + reporting paths (Task 4.2 step 6), then proceed to Task 4.3 (evidence persistence).

---

## Refactoring Checklist (Per Task)

For each tool, follow this checklist:

- [ ] Read source file (check structure, current output)
- [ ] Identify argument parsing location
- [ ] Identify output/console.log calls
- [ ] Create backup notes
- [ ] Add imports: `CliFormatter`, `CliArgumentParser`
- [ ] Replace argument parsing with CliArgumentParser
- [ ] Replace console.log calls with fmt.* methods
- [ ] Add header/footer structure
- [ ] Move any inline SQL to `src/db/sqlite/v1/queries/` adapters (extend existing factories or create new ones)
- [ ] Test with --help flag
- [ ] Mark task COMPLETE in this document
- [ ] Commit changes with reference to task number

---

## Notes & Special Cases

### Tools Already Using Colors
- ✅ validate-gazetteer.js — Refactored ✅
- ✅ analyze-domains.js — Refactored ✅
- ✅ detect-articles.js — Refactored ✅
- ⏳ crawl-place-hubs.js — May already have good colors (review first)

### Complex Tools Requiring Extra Care
- `populate-gazetteer.js` — Multiple sub-commands, may need subcommand support
- `export-gazetteer.js` — File I/O, progress tracking
- `get-test-summary.js` — Complex data aggregation

### Tools to Skip/Review First
- `compression-benchmark.cjs` — Benchmark, may not need CLI formatting
- `db-query.js` — Infrastructure utility
- `analysis-run.js` — Background task runner

---

## Success Criteria

**Phase 3 Complete when:**
- ✅ All 20 tools refactored or reviewed
- ✅ Tools use consistent CliFormatter API
- ✅ All tools support `--help`
- ✅ All tools have color-coded output
- ✅ No inline SQL remains inside CLI tools (all queries live in v1 adapter modules)
- ✅ No breaking changes to tool interfaces
- ✅ Documentation updated for new patterns
- ✅ All changes committed with proper messages

**Metrics to Track:**
- Lines of boilerplate saved per tool
- Output visual improvement rating
- Argument parsing complexity reduction
- Consistency across all tools

---

## Next Steps

1. **Continue Phase 3C autonomously:**
   - Execute task 3.15 sequentially (intelligent-crawl.js)
   - Update this document after each task
   - Capture validation commands alongside changes

2. **Track progress:**
   - Update task status transitions and batch completion percentages
   - Record notable changes/edge cases for each tool
   - Document any blockers before moving to the next task

3. **Plan Phase 3D review** once Phase 3C wraps (determine which tools need refactors vs. skip)

4. **Final summary** after all phases complete

---

## Document Maintenance

This document is the single source of truth for refactoring progress. Update it:
- **After each task completion** — Mark as ✅ COMPLETE, record changes
- **When moving to new batch** — Update batch status
- **If blockers encountered** — Document in Notes section
- **At end of session** — Add session summary to Execution Log

**Golden Rule:** Every change in the codebase has a corresponding update in this document.

