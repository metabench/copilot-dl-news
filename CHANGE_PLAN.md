# CHANGE_PLAN.md — ACTIVE REFACTORING TRACK

**📌 CURRENT (Oct 30, 2025): Hub Guessing Workflow Modernization**

**Previous:** CLI Output Modularization (Phase 2 complete) — see `CLI_REFACTORING_TASKS.md`

---

## Goal / Non-Goals

### Goal
- Transform `guess-place-hubs` from a standalone CLI into a reusable system service that powers crawls, background tasks, and analyst tooling.
- Capture richer scoring inputs, persist evidence, and surface telemetry so that hub discovery decisions become auditable and schedulable.
- Keep the CLI pathway operational as the primary manual entry point while sharing code with automation layers.

### Non-Goals
- Do not redesign analyzer algorithms from scratch; focus on feeding them more context and tuning with real data.
- Do not deprecate existing CLI modes until the new workflow reaches feature parity (apply, JSON output, dry runs).
- Avoid rewriting unrelated crawlers or background task runners beyond what is required for scheduling hooks.

---

## Current Behavior (Baseline)
- `src/tools/guess-place-hubs.js` runs analyzers sequentially, logs output via `CliFormatter`, and optionally persists hubs using `HubValidator`.
- Candidate scoring is ephemeral; only the winning hub is inserted into `place_hubs` and `fetches`/`http_responses` via inline `recordFetch` helpers.
- Validation fetches HTML each time, even if the analyzer already downloaded it, and no structured metrics are stored.
- CLI handles a single domain per invocation; no batching, diff previews, or import automation.
- Intelligent crawl planner and background tasks are unaware of the guesser; manual runs only.
- Observability is limited to console output; `/analysis` dashboards and SSE streams do not reflect guesses.
- Test coverage targets the CLI happy path with limited fixtures; documentation focuses on refactored output rather than workflow usage.

---

## Refactor & Modularization Plan

### Phase A — Shared Storage & Telemetry Foundations
1. **Candidate Repository**: Introduce `src/db/placeHubCandidatesStore.js` with CRUD helpers backed by a new `place_hub_candidates` table (domain, candidate_url, analyzer, score, signals JSON, created_at, attempt_id, validation_status).
2. **Fetch Recording Helper**: Extract a `recordFetchResult({ db, url, status, headers, body, source, retryOfId })` utility that dual-writes to `http_responses` + legacy `fetches` and emits telemetry (rate-limit counters, retry tags).
3. **HubValidator Updates**: Allow validator to accept pre-fetched HTML, fall back to cached discovery/content tables, and return structured metrics (`{ status, evidence, issues }`).

### Phase B — CLI Enhancements & Evidence Persistence
4. **CLI Orchestration Module**: Split orchestration into `guessPlaceHubsWorkflow.js` so CLI and background jobs share batching, import, and reporting logic.
5. **Batching & Import**: Add positional multi-domain support, CSV ingestion (`--import path.csv`), and queued execution with rate-limit awareness.
6. **Apply Preview**: Implement `--apply` preview mode showing diff of inserts/updates (leveraging CliFormatter tables) before confirmation.
7. **Report Emission**: Support `--emit-report path` storing JSON snapshots under `testlogs/guess-place-hubs/` for analyzer/test integration.
8. **Evidence Storage**: Persist validator evidence to `place_hubs` (new JSON column) and create `place_hub_audit` table for historical validation events.

### Phase C — Scheduling & Observability Integration
9. **Priority Config Wiring**: Extend `config/priority-config.json` with thresholds (score floor, retry delay) consumed by the workflow.
10. **Planner Integration**: Add hooks so intelligent crawl planner enqueues guess tasks when coverage snapshots reveal gaps; expose queue through background task manager.
11. **Background Task Runner**: Implement a background task that replays pending candidate batches, reusing the workflow module.
12. **SSE & Analysis Dashboards**: Stream decisions via SSE, update `/analysis` dashboards with success/failure metrics, and persist run summaries to `analysis_runs` tying to `background_task_id`.

### Phase D — Testing & Documentation
13. **Fixtures & Tests**: Add fixtures covering cached HTML reuse, mixed HTTP responses, audit persistence, and CLI CSV import/batch flows (targeted Jest suites).
14. **Docs & Guides**: Update `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md`, CLI quick-start docs, and `CLI_REFACTORING_TASKS.md` execution log with the new workflow.
15. **Developer Telemetry Docs**: Document new SSE events and analysis dashboard metrics in relevant architecture guides.

---

## Patterns to Introduce
- **Workflow Module**: Pure orchestration functions (`runGuessBatch`, `persistEvidence`) to keep CLI, planner, and background tasks aligned.
- **Telemetry Contract**: A shared event interface for rate-limit updates and SSE broadcasting.
- **Evidence Schema**: Normalized JSON structures for validator metrics stored both inline (`place_hubs.evidence_json`) and in audit history.

---

## Risks & Mitigations
- **Schema Migrations**: New tables/columns risk breaking older SQLite snapshots. Mitigate with migrations that check for existing columns and provide backfill scripts.
- **Analyzer Performance**: Batching and additional signals may slow runs. Profile with staged rollouts and configurable limits.
- **Scheduler Coupling**: Ensure planner hooks are feature-flagged to avoid accidental load spikes; default to manual mode until validated.
- **Telemetry Volume**: SSE/event noise can overwhelm dashboards. Add throttling and summary aggregation before emitting.

---

## Focused Test Plan (Per Phase)
- **Phase A**: `jest --runTestsByPath src/tools/__tests__/guess-place-hubs.test.js src/db/__tests__/placeHubCandidatesStore.test.js`
- **Phase B**: CLI behavioural tests via `jest --runTestsByPath src/tools/__tests__/guess-place-hubs.cli.test.js` plus manual `node src/tools/guess-place-hubs.js --help` and sample CSV import run.
- **Phase C**: Integration tests for planner/background hooks (`jest --runTestsByPath src/analysis/__tests__/intelligent-crawl-planner.test.js`).
- **Phase D**: Documentation lint scripts (if any) and regenerate CLI examples.

---

## Rollback Plan
- Isolate schema changes behind migrations with down scripts (drop new tables/columns if necessary).
- Keep existing CLI code path (pre-workflow module) available behind feature flag until end-to-end tests pass; revert by toggling the flag and removing new scheduler hooks.
- SSE/dashboard integration guarded by config; disable to stop emitting if regressions surface.

---

## Refactor Index (Will Update As Work Lands)
- `src/tools/guess-place-hubs.js` → delegates to `src/workflows/guessPlaceHubsWorkflow.js` (new).
- `src/db/placeHubCandidatesStore.js` (new) consumed by CLI, planner, background tasks.
- `src/utils/fetch/recordFetchResult.js` (new helper) replaces inline logic in guesser and other tools.
- `src/validation/HubValidator.js` gains HTML reuse + metrics API.
- `config/priority-config.json` extended with guesser thresholds.
- `docs/TESTING_REVIEW_AND_IMPROVEMENT_GUIDE.md` and CLI docs updated with new workflow guidance.
