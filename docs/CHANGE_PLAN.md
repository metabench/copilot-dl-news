# CHANGE_PLAN.md — ACTIVE REFACTORING TRACK

**📌 CURRENT (Oct 30, 2025): Hub Guessing Workflow Modernization — Phase 4**

**Previous Initiative:** Compression Facade Adoption & Legacy Cleanup (stabilized — remaining follow-ups parked in `CHANGE_PLAN_COMPRESSION_UTILITIES.md`).

---

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
### Phase 4B — Evidence Persistence & Auditing (Task 4.3)
1. **Schema additions:**
	- Create `place_hub_audit` table capturing `{domain, url, place_kind, place_name, decision, validation_metrics_json, attempt_id, run_id, created_at}`.
	- Ensure migrations/ALTERs reside in `src/db/sqlite/v1/schema.js` with idempotent guards (legacy snapshots).
2. **Queries & stores:**
	- Extend `createGuessPlaceHubsQueries` with `recordAuditEntry()` and `loadAuditTrail()` helpers.
	- Update `createPlaceHubCandidatesStore` to persist validation metrics/evidence references.
3. **Evidence payloads:**
	- Promote `buildEvidence` to include references to candidate row IDs, attempt metadata, and validation metrics.
4. **Summary integration:**
	- Surface audit counts in CLI summaries/report file; optionally gate with `--audit-log-limit`.

### Phase 4C — Scheduling & Batch Automation (Task 4.4)
1. **Scheduler integration:**
	- Add a thin wrapper (`src/background/tasks/GuessPlaceHubsTask.js`) leveraging the CLI internals with structured arguments.
	- Register configuration in `tests/test-config.json` (if needed) and background task manifest.
2. **Run metadata:**
	- Persist batch run state (`place_hub_guess_runs`) capturing input set, timestamps, result counts.
	- Link audit entries/candidates to `run_id` for roll-ups (supports dashboards, `analysis_runs`).
3. **CLI coordination:**
	- Expose `--run-id` for scheduler-provided identifiers to keep CLI + background task aligned.

### Phase 4D — Observability & Dashboards (Task 4.5)
1. **SSE events:**
	- Emit progress events per domain (start, candidate fetched, validation, diff preview, persist).
	- Hook into existing SSE infrastructure used by crawls/background tasks.
2. **Dashboard updates:**
	- Extend `/analysis` dashboard to show recent guess-place-hubs runs (counts, success rate, rate-limit events).
	- Archive summaries into `analysis_runs` (align with scheduler metadata).
3. **Report ingestion:**
	- Ensure `--emit-report` files can be imported by dashboard utilities (define spec in docs).

### Phase 4E — Testing & Documentation (Task 4.6)
1. **Automated tests:**
	- Add unit tests for batch parsing (`parseCliArgs`), diff preview generator, audit store.
	- Create fixtures representing mixed responses (success, 404, rate limit) for CLI batch testing.
2. **Documentation:**
	- Update CLI usage docs (`README`, `docs/PLACE_HUB_HIERARCHY.md`, relevant quick references) with new flags.
	- Document audit schema and report format.
3. **Operational playbook:**
	- Refresh runbooks describing the guess → validate → export workflow with new automation steps.

---

## Patterns to Introduce
- **Batch orchestrator abstraction:** Shared helper to normalize domain inputs and feed them into the existing `guessPlaceHubs` core.
- **Diff preview staging:** Compute and render changes before committing `--apply` writes; reuse JSON structure in reports.
- **Audit trail pipeline:** Candidate store → validation metrics → `place_hub_audit` table → report exporter.
- **Run metadata cohesion:** Consistent `run_id` propagated across candidates, audits, reports, and scheduler tasks.

---

## Risks & Mitigations
- **Database contention:** Multi-domain batches may hold transactions longer.
  - *Mitigation:* Process domains sequentially within a run, wrap each domain’s apply step in its own transaction, expose `--parallel` explicitly unsupported for now.
- **Large report files:** Emitting full decision logs for large batches could grow rapidly.
  - *Mitigation:* Allow `--report-max-decisions` to cap per-domain entries; default to recent subset already used in summaries.
- **Scheduler drift:** Background task wrapper must stay in sync with CLI behavior.
  - *Mitigation:* Reuse core helper (`runGuessPlaceHubsBatch(options)`), keep scheduler-specific logic thin, add integration test harness.
- **Legacy snapshot compatibility:** Older databases may lack new columns/tables.
  - *Mitigation:* Schema migrations use `CREATE TABLE IF NOT EXISTS` and column guards; fallback to JSON-only reports if schema upgrade fails.

---

## Focused Test Plan
- CLI smoke tests:
  - `node src/tools/guess-place-hubs.js bbc.com theguardian.com --json`
  - `node src/tools/guess-place-hubs.js --import fixtures/domains.csv --limit 2 --emit-report tmp/report.json`
  - `node src/tools/guess-place-hubs.js cnn.com --apply --diff-preview`
- Unit tests (to add):
  - `npx jest --runTestsByPath src/tools/__tests__/guess-place-hubs.batch.test.js`
  - `npx jest --runTestsByPath src/db/__tests__/placeHubCandidatesStore.audit.test.js`
- Scheduler integration (after 4.4):
  - `node src/background/tasks/GuessPlaceHubsTask.js --dry-run --import fixtures/domains.csv`
- Dashboard verification (after 4.5):
  - Hit `/analysis` endpoint locally; ensure new sections render without regressions.

---

## Rollback Plan
- CLI enhancements: keep batch logic behind feature flags (`--legacy-single`) during rollout; revert by toggling flags and removing new options.
- Audit schema: migrations are additive; revert by dropping `place_hub_audit` table and removing optional columns (guards remain).
- Scheduler integration: disable task registration and remove run metadata tables; CLI remains functional manually.
- Reports: if file emission causes issues, disable via config flag (`REPORTS_ENABLED=false`).

---

## Refactor Index
- `src/tools/guess-place-hubs.js` — Batch orchestration, diff preview, report emission.
- `src/tools/guess-place-hubs/` (new) — Helper modules (`batchLoader.js`, `diffPreview.js`, `reportWriter.js`).
- `src/db/placeHubCandidatesStore.js` — Audit metadata persistence.
- `src/db/sqlite/v1/queries/guessPlaceHubsQueries.js` — Audit + run metadata helpers.
- `src/db/sqlite/v1/schema.js` — `place_hub_audit` table, run metadata table definitions.
- `src/background/tasks/GuessPlaceHubsTask.js` (new) — Scheduler entry point.
- `docs/PLACE_HUB_HIERARCHY.md`, `docs/hub-content-analysis-workflow.md`, Runbooks — Documentation refresh.

---

**Status (Oct 30, 2025):** Task 4.1 delivered candidate storage + validation telemetry foundations. Sub-phase β requires finalizing this plan (done) so implementation of Task 4.2 can begin.
