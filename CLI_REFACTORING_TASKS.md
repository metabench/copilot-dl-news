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
| 3.3 | export-gazetteer | `src/tools/export-gazetteer.js` | ⏳ NOT_STARTED | HIGH | Data export tool |
| 3.4 | populate-gazetteer | `src/tools/populate-gazetteer.js` | ⏳ NOT_STARTED | HIGH | Data import/population |
| 3.5 | backfill-dates | `src/tools/backfill-dates.js` | ⏳ NOT_STARTED | HIGH | Utility/maintenance |

#### Tier 2: Medium Priority (Analysis Tools)
Secondary analysis and reporting tools.

| # | Tool | Path | Status | Priority | Notes |
|---|------|------|--------|----------|-------|
| 3.6 | show-analysis | `src/tools/show-analysis.js` | ⏳ NOT_STARTED | MEDIUM | Analysis display |
| 3.7 | analyse-pages-core | `src/tools/analyse-pages-core.js` | ⏳ NOT_STARTED | MEDIUM | Page analysis |
| 3.8 | crawl-place-hubs | `tools/crawl-place-hubs.js` | ⏳ NOT_STARTED | MEDIUM | Hub crawling (note: already has good output!) |
| 3.9 | count-testlogs | `tools/count-testlogs.js` | ⏳ NOT_STARTED | MEDIUM | Log analysis |
| 3.10 | db-schema | `tools/db-schema.js` | ⏳ NOT_STARTED | MEDIUM | Database inspection |

#### Tier 3: Lower Priority (Specialized Tools)
Special-purpose and less frequently used tools.

| # | Tool | Path | Status | Priority | Notes |
|---|------|------|--------|----------|-------|
| 3.11 | get-test-summary | `tests/get-test-summary.js` | ⏳ NOT_STARTED | MEDIUM | Test reporting |
| 3.12 | get-failing-tests | `tests/get-failing-tests.js` | ⏳ NOT_STARTED | LOW | Test queries |
| 3.13 | get-latest-log | `tests/get-latest-log.js` | ⏳ NOT_STARTED | LOW | Log utilities |
| 3.14 | get-slow-tests | `tests/get-slow-tests.js` | ⏳ NOT_STARTED | LOW | Performance analysis |
| 3.15 | intelligent-crawl | `tools/intelligent-crawl.js` | ⏳ NOT_STARTED | LOW | Crawl analysis |

#### Tier 4: Infrastructure (May Not Need Refactoring)
These may already have good output or are internal utilities.

| # | Tool | Path | Status | Priority | Notes |
|---|------|------|--------|----------|-------|
| 3.16 | analysis-run | `src/tools/analysis-run.js` | ⏳ PENDING_REVIEW | LOW | Background task runner |
| 3.17 | db-query | `tools/db-query.js` | ⏳ PENDING_REVIEW | LOW | Query utility |
| 3.18 | compression-benchmark | `tools/compression-benchmark.cjs` | ⏳ PENDING_REVIEW | LOW | Benchmark tool |
| 3.19 | vacuum-db | `tools/vacuum-db.js` | ⏳ PENDING_REVIEW | LOW | Database maintenance |
| 3.20 | db-table-sizes | `tools/db-table-sizes.js` | ⏳ PENDING_REVIEW | LOW | Database stats |

---

## Execution Strategy

### Per-Task Workflow

**BEFORE STARTING:**
1. Read task file (max 150 lines to start)
2. Identify current output format
3. Determine needed refactoring scope
4. Check if it's already using CliFormatter (skip if yes)

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

#### 3.3 export-gazetteer.js
- **File:** `src/tools/export-gazetteer.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** HIGH
- **Scope:** Data export tool
- **Est. Effort:** 15 min
- **Refactoring:** Standard (arg parsing + output formatting)

#### 3.4 populate-gazetteer.js
- **File:** `src/tools/populate-gazetteer.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** HIGH
- **Scope:** Data import/population
- **Est. Effort:** 20 min
- **Refactoring:** Standard (arg parsing + output formatting)

#### 3.5 backfill-dates.js
- **File:** `src/tools/backfill-dates.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** HIGH
- **Scope:** Utility/maintenance tool
- **Est. Effort:** 15 min
- **Refactoring:** Standard (arg parsing + output formatting)

---

### ⏳ NOT_STARTED: Phase 3B Tier 2 Tools

#### 3.6 show-analysis.js
- **File:** `src/tools/show-analysis.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** MEDIUM

#### 3.7 analyse-pages-core.js
- **File:** `src/tools/analyse-pages-core.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** MEDIUM

#### 3.8 crawl-place-hubs.js
- **File:** `tools/crawl-place-hubs.js`
- **Status:** ⏳ NOT_STARTED (May already have good output)
- **Priority:** MEDIUM
- **Note:** Review first - may already use colors/emojis well

#### 3.9 count-testlogs.js
- **File:** `tools/count-testlogs.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** MEDIUM

#### 3.10 db-schema.js
- **File:** `tools/db-schema.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** MEDIUM

---

### ⏳ NOT_STARTED: Phase 3C Tier 3 Tools

#### 3.11 get-test-summary.js
- **File:** `tests/get-test-summary.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** MEDIUM

#### 3.12 get-failing-tests.js
- **File:** `tests/get-failing-tests.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** LOW

#### 3.13 get-latest-log.js
- **File:** `tests/get-latest-log.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** LOW

#### 3.14 get-slow-tests.js
- **File:** `tests/get-slow-tests.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** LOW

#### 3.15 intelligent-crawl.js
- **File:** `tools/intelligent-crawl.js`
- **Status:** ⏳ NOT_STARTED
- **Priority:** LOW

---

### ⏳ PENDING_REVIEW: Phase 3D Tier 4 Tools

#### 3.16 analysis-run.js
- **File:** `src/tools/analysis-run.js`
- **Status:** ⏳ PENDING_REVIEW
- **Priority:** LOW
- **Note:** May be infrastructure only

#### 3.17 db-query.js
- **File:** `tools/db-query.js`
- **Status:** ⏳ PENDING_REVIEW
- **Priority:** LOW
- **Note:** May be infrastructure only

#### 3.18 compression-benchmark.cjs
- **File:** `tools/compression-benchmark.cjs`
- **Status:** ⏳ PENDING_REVIEW
- **Priority:** LOW
- **Note:** May not need CLI formatting

#### 3.19 vacuum-db.js
- **File:** `tools/vacuum-db.js`
- **Status:** ⏳ PENDING_REVIEW
- **Priority:** LOW
- **Note:** Maintenance utility

#### 3.20 db-table-sizes.js
- **File:** `tools/db-table-sizes.js`
- **Status:** ⏳ PENDING_REVIEW
- **Priority:** LOW
- **Note:** Stats utility

---

### Phase 4: Hub Guessing Workflow Modernization (New Scope)

Tasks map to the expanded modernization initiative captured in `CHANGE_PLAN.md`. Complete after Phase 3A unless dependencies require earlier groundwork.

| # | Task | Scope | Status | Priority | Notes |
|---|------|-------|--------|----------|-------|
| 4.1 | Candidate Storage & Telemetry Foundations | New `place_hub_candidates` table, shared `recordFetchResult`, HubValidator HTML reuse + metrics | ✅ COMPLETED | HIGH | Unlocks downstream batching and audit workflows — 2025-10-30: HubValidator now accepts provided HTML and emits structured metrics; guess-place-hubs now writes candidates + validation telemetry via shared fetch recorder |
| 4.2 | CLI Workflow Enhancements | Multi-domain batching, CSV `--import`, `--apply` diff preview, `--emit-report` JSON snapshots | ⏳ NOT_STARTED | HIGH | Depends on 4.1 storage helpers |
| 4.3 | Evidence Persistence & Auditing | Persist validator metrics into `place_hubs` and populate new `place_hub_audit` table | ⏳ NOT_STARTED | HIGH | Requires 4.1 structured validator output |
| 4.4 | Scheduler & Config Integration | Add priority-config thresholds, intelligent crawl planner triggers, background-task queue | ⏳ NOT_STARTED | MEDIUM | Feature-flag initial rollout |
| 4.5 | Observability & Dashboards | SSE events, `/analysis` dashboard updates, archive summaries to `analysis_runs` | ⏳ NOT_STARTED | MEDIUM | Builds on 4.2 reports + 4.4 scheduler data |
| 4.6 | Testing & Documentation Updates | Fixtures for mixed responses, docs refresh for guess → validate → export workflow | ⏳ NOT_STARTED | HIGH | Final verification phase |

---

## Progress Tracking

### Batch Summary

| Batch | Tasks | Target | Status | Completion |
|-------|-------|--------|--------|------------|
| **Phase 2** | 5 | Pilot tools | ✅ COMPLETE | 100% |
| **Phase 3A** | 3.1-3.5 | Tier 1 (HIGH) | ⏳ IN_PROGRESS | 40% |
| **Phase 3B** | 3.6-3.10 | Tier 2 (MEDIUM) | ⏳ NOT_STARTED | 0% |
| **Phase 3C** | 3.11-3.15 | Tier 3 (LOW) | ⏳ NOT_STARTED | 0% |
| **Phase 3D** | 3.16-3.20 | Tier 4 (REVIEW) | ⏳ NOT_STARTED | 0% |

### Overall Progress
- **Completed:** 7 tasks (Phase 2 + Tasks 3.1-3.2)
- **In Progress:** 0 tasks
- **Remaining:** 18 tasks
- **Total:** 25 tasks
- **Completion Rate:** 28%

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

1. **Start Phase 3A autonomously:**
   - Execute tasks 3.1-3.5 sequentially
   - Update this document after each task
   - Commit each completed tool

2. **Track progress:**
   - Update task status from ⏳ NOT_STARTED → ✅ COMPLETE
   - Record changes made per tool
   - Note any special cases or blockers

3. **Continue to Phase 3B** after Phase 3A completion

4. **Final summary** after all phases complete

---

## Document Maintenance

This document is the single source of truth for refactoring progress. Update it:
- **After each task completion** — Mark as ✅ COMPLETE, record changes
- **When moving to new batch** — Update batch status
- **If blockers encountered** — Document in Notes section
- **At end of session** — Add session summary to Execution Log

**Golden Rule:** Every change in the codebase has a corresponding update in this document.

