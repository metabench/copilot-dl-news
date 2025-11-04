# CHANGE_PLAN.md — URL Foreign Key Normalization (Active)

## Active Plan — Migration Export Gitignore Hygiene (Initiated 2025-11-04)

### Goal
- Ensure large exported JSON/NDJSON artifacts produced during migration runs stay out of version control by adding the appropriate ignore patterns.

### Current Behavior
- Migration export runs drop sizable `.json`/`.ndjson` files under `migration-export/`, `migration-temp/`, and similar directories. Some of these paths are not yet covered by `.gitignore`, so rerunning exports dirties the working tree and risks accidental commits.

### Proposed Changes
1. Audit existing ignore rules in `.gitignore` to confirm which migration export directories are already covered.
2. Add targeted ignore patterns for the remaining exported JSON/NDJSON artifacts (e.g., `migration-export/**/*.json`, `migration-export/**/*.ndjson`, and any other export staging locations) while leaving manifests or checked-in fixtures untouched.
3. Verify the ignore list by checking `git status` to ensure newly created export artifacts do not appear as untracked files.

### Risks & Unknowns
- Need to avoid over-broad patterns that would hide intentionally committed manifests or fixture data (e.g., small JSON configs that belong in version control).
- Must confirm the ignore rules stay Windows/PowerShell friendly and do not conflict with existing entries.

### Integration Points
- Repository root `.gitignore` (text file; editing via `apply_patch` since js-edit targets JavaScript only).
- Migration tooling directories (`migration-export/`, `migration-temp/`, `data/exports/`) to identify artifact naming conventions.

### Docs Impact
- None anticipated; `.gitignore` update should be self-explanatory.

### Focused Test Plan
- Manual: regenerate or touch representative export files (if needed) and confirm `git status` stays clean after updating `.gitignore`.

### Rollback Plan
- Revert `.gitignore` changes if ignore rules prove too aggressive or hide required files.

### Branch & Notes
- Working branch: `main` (small hygiene update; no feature branch required).
- Editing approach: `.gitignore` is not JavaScript, so js-edit is bypassed; documenting rationale here per Careful js-edit Builder protocol.
- 2025-11-04: Cleared stale `index.lock`, ran `git rm --cached -r migration-export` so existing exports drop out of version control before the new ignore patterns take effect.

## Active Plan — Phase 0 Migration Tooling (Initiated 2025-11-03)

### Goal
- Deliver the Phase 0 migration toolkit so we can audit the current schema, export/import data sets, and validate results without touching application code.

### Current Behavior
- Schema checks and exports are manual one-offs (ad-hoc SQL, SQLite CLI, loose scripts) with no shared manifest or version tracking.
- There is no CLI workflow to capture backups, run orchestrated migrations, or summarize validation status in a consistent way.
- Existing docs outline the desired modules (`SchemaVersionManager`, exporter/importer, validator, orchestrator) but the repository lacks hardened implementations and tests tying them together.

### Proposed Changes
1. Implement the core migration modules under `src/db/migration/` (version manager, exporter, importer, validator, orchestrator) with reusable APIs that match the Phase 0 doc.
2. Wire up a CLI (`tools/migration-cli.js`) that can report status, perform exports/imports, run full migrations, and validate the database, including support for configurable paths.
3. Add focused tests (better-sqlite3 temp DB fixtures) covering version tracking, export/import round trips, validation rules, and orchestrated flows so we can trust the toolkit before touching production data.
4. Document the workflow in `src/db/migration/README.md` and cross-link the CLI usage in the docs index so future agents know how to run the tooling.

### Risks & Unknowns
- Better-sqlite3 based exports/imports may surface platform-specific filesystem quirks (Windows path limits, locked files) that require retries or defensive error handling.
- Large tables could make naive SELECT * streaming fragile; we need to ensure batch iteration doesn’t exhaust memory or hang under pressure.
- CLI ergonomics (path parsing, environment overrides) must play nicely with existing command rules to avoid PowerShell approval prompts.

### Integration Points
- `src/db/sqlite/v1/ensureDb.js` for database handles in tests and CLI workflows.
- `tools/` command suite for migration CLI integration, plus existing docs under `docs/PHASE_0_IMPLEMENTATION.md`.
- Jest infrastructure for new migration-focused test suites under `src/db/migration/__tests__/`.

### Docs Impact
- Update or create `src/db/migration/README.md` and reference the CLI in `docs/PHASE_0_IMPLEMENTATION.md`/`docs/DATABASE_MIGRATION_STRATEGY.md` once tooling is validated.
- Potentially add a short entry to `AGENTS.md` pointing agents to the new toolkit.

### Focused Test Plan
- `npx jest --config jest.careful.config.js --runTestsByPath src/db/migration/__tests__/schema-versions.test.js src/db/migration/__tests__/validator.test.js src/db/migration/__tests__/orchestrator.test.js --bail=1 --maxWorkers=50%` (and extend with new exporter/importer suites once they land).
- Ad-hoc manual smoke tests via `node tools/migration-cli.js status|export|validate` against a temp database copy.

### Rollback Plan
- Revert the migration module/CLI additions and remove the new tests/docs; since Phase 0 tooling is isolated from application code, rollback is limited to deleting those files and restoring package.json if dependencies were added.

### Branch & Notes
- Working branch: `main` (js-edit work already lives here; stay put to avoid juggling dirty state across branches).
- Current blockers: none; need to allocate time for batch streaming tests to ensure exporter/importer handle multi-thousand row fixtures without locking issues.
- 2025-11-03: Align CLI import defaults with orchestrator export directory, then rerun migration-focused Jest suite to confirm behaviour.
- 2025-11-03: Introduce importer table reset (or duplicate-safe inserts) so migrations into freshly provisioned databases avoid primary key collisions; capture approach in docs once validated.
- 2025-11-03: Investigate validator failure; discovered `seedTestData` inserts into `http_responses` without the NOT NULL `request_started_at`, so rows are skipped and validation reports 5 orphaned URLs — patch seed helper to populate this column before rerunning migration tests.
- 2025-11-03: Refresh validator tests to build manifests from live row counts, cover content storage FK violations, and assert URL→response integrity; suite now green alongside the orchestrator tests.
- 2025-11-03 (later): Full migration run against `data/news.db` failed during the import step for `url_aliases` (`SQLiteError: near "exists": syntax error`), leaving downstream tables like `content_storage` empty and validation reporting five errors; need to adjust importer SQL for reserved column names before retrying.
- 2025-11-11: Post-quoting retry now highlights `content_storage` and `fetches` importing zero rows because BLOB payloads arrive as `{ type: 'Buffer', data: [...] }`; update importer batch insert to coerce these objects to Node `Buffer` instances before rerunning migration.
- 2025-11-11 (later): Follow-up migration run still flags `fetches` as empty; manual reproduction shows `SQLiteError: no such column: NEW.url` via triggers created by schema init. Need to suppress or rewrite the `fetches` triggers (they reference a legacy `url` column absent from exports) before retrying the migration validation step.
- 2025-11-11 (latest): Full migration now streams all tables, and `fetches` counts align after trigger rewrite. Validator failures stem from integrity checks expecting zero orphaned `urls`/`content_storage` rows even though the source database reports 199,318 and 8 respectively; plan is to compare target vs. source counts instead of enforcing zero so true regressions still surface. Also observed intermittent export failure for `queue_events.ndjson` (`UNKNOWN: unknown error, open ...`); investigate stale file/locking before final rerun.
- 2025-11-11 (latest+1): Updated validator to compare integrity metrics against the source database (captures expected vs. actual + delta), refreshed tests to cover the new semantics, and reran the full migration — validation now passes and `queue_events` export succeeds after clearing the stale NDJSON artifact.
- 2025-11-12: Reviewed `migration-temp/news-migrated.db` post-run; `article_places` still carries the legacy `article_url` TEXT column plus indexes/unique constraint on that field even though every row now has `article_url_id`. Column drop + index/constraint remap remain outstanding migration work.
- 2025-11-12 (later): Updated schema blueprint to remove `article_url`, switch constraints/indexes to `article_url_id`, taught the importer to ignore exported columns missing from the target schema (with cached PRAGMA lookups + one-time warnings), and tightened the normalization validator so denormalized columns fail validation when populated.
- 2025-11-03: Ran `node tools/migration-cli.js migrate migration-temp/news-migrated.db --db-path data/news.db --export-dir migration-export` against the refreshed schema (deleting the previous migrated DB first) and confirmed `article_places` now ships without the legacy `article_url` column. The URL normalization validator passes (`node src/tools/normalize-urls/validate-url-normalization.js migration-temp/news-migrated.db`), but the exporter still intermittently fails to emit `queue_events.ndjson`; need a follow-up cleanup of the export directory so the next full run captures that table instead of skipping it.
- 2025-11-03 (later): Tooling TODOs before declaring victory — (a) update the exporter to remove/overwrite pre-existing NDJSON files safely so Windows doesn't raise `UNKNOWN: unknown error, open ...` during the `queue_events` export, and (b) ensure migration orchestrator closes out streaming statements so the CLI stops exiting with "database connection is busy" after success. Once both land, rerun the full migrate → validate workflow end-to-end.
- 2025-11-12 (in progress): Begin exporter cleanup pass — add a pre-run removal step for stale NDJSON files and ensure table iterators release their statements even if the stream ends early or throws. Validate changes with a focused export of `queue_events` before running the full migration again.
- 2025-11-12 (in progress+1): Latest migrate run succeeded overall, but `content_analysis.ndjson` still throws `EBUSY` during the pre-run delete. Add a retry/backoff around the removal step so Windows unlocks the file before export resumes, then re-run migrate to confirm a clean manifest.
- 2025-11-12 (complete): Added retry/backoff to the exporter’s pre-run delete and reran the full migrate workflow. Manifest now shows every table (including `content_analysis`) exported with row counts, and the CLI finished without "database connection is busy" warnings.

## Active Plan — js-edit Lightweight Discovery Helpers (Initiated 2025-11-09)

### Goal
- Deliver the “lighter alternatives” discussed with the operator by adding fast discovery helpers to `js-edit`: filtered listings, selector previews, and plain-text search that reports guard hashes, all without expanding the guardrail footprint.

### Current Behavior
- `--list-functions` / `--list-variables` always emit the full inventory, forcing operators to sift through large tables manually.
- Previewing a candidate requires running `--context-*` which defaults to ±512 characters and can feel heavyweight when only a quick glance is needed.
- There is no CLI entry point for text-based search; operators must open the file in an editor to locate literal strings before returning to `js-edit` for guarded operations.

### Proposed Changes
1. Extend `--list-functions` and `--list-variables` with an optional `--filter-text <substring>` flag (case-insensitive) so listings can be narrowed before applying selectors.
2. Add a lightweight `--preview <selector>` command that reuses existing locate logic but prints a concise snippet (first matching lines + guard metadata) without invoking the broader context machinery.
3. Introduce `--search-text <substring>` to scan file contents (UTF-8 safe) and report each match with line/column, a short preview excerpt, and the guard hash/path of the enclosing function or variable when available.
4. Update CLI help, README references, and quick-start guidance to surface the new discovery options and their guardrail relationship.
5. Extend the focused Jest integration suite with fixtures covering filtering, preview output, and text-search result formatting (ASCII + JSON).
6. Add `--select hash:<value>` parsing so operators can jump directly from guard hashes to a resolved record without JSON copy/paste.
7. Introduce `--with-file <relative>` so inline edits can reference snippets relative to the target file without building absolute paths.
8. Enhance text-search output with a ready-to-run `js-edit` command suggestion (selector + guard hash) for each match.

### Risks & Unknowns
- Need to confirm selector resolution latency stays acceptable when `--search-text` maps matches back to enclosing records (may require cached inventories).
- Must ensure new flags remain mutually exclusive with existing operations to avoid multi-command conflicts (e.g., `--list-functions` already enforces single-operation semantics).
- Text search should respect multi-byte characters; guard against index drift when slicing previews around matches.
- Large files could yield many matches; may need sensible default limits or summaries to avoid overwhelming output.

### Integration Points
- `tools/dev/js-edit.js` argument parser, operation dispatch, formatter helpers, and JSON emitters.
- `tools/dev/lib/swcAst.js` for any shared utilities needed to map raw offsets back to function/variable records.
- `tests/tools/__tests__/js-edit.test.js` plus associated fixtures for integration coverage.

### Docs Impact
- Update `tools/dev/README.md` and `docs/CLI_REFACTORING_QUICK_START.md` so operators know how to use `--filter-text`, `--preview`, and `--search-text` alongside existing guardrail workflows.
- If behaviour expectations for agents change, add a brief note to `.github/instructions/GitHub Copilot.instructions.md`.

### Focused Test Plan
- `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%` after wiring each major feature.
- Ad-hoc CLI smoke checks (`node tools/dev/js-edit.js --file tests/fixtures/tools/js-edit-sample.js --search-text callback`) to validate ASCII + JSON output.

### Rollback Plan
- Revert `tools/dev/js-edit.js`, any new helper utilities, updated fixtures, and documentation changes; remove associated tests to restore prior CLI surface.
- Since features are additive, rolling back the specific commits on the feature branch will return the CLI to its previous behaviour.

### Branch & Notes
- Working branch: `chore/js-edit-light-discovery` (created 2025-11-09 from `main`).
- Knowledge gaps: need to decide whether `--search-text` should cap match counts or expose a `--limit` flag; confirm formatter helpers already support truncated snippets.
- Tool friction: parser currently enforces “single operation” rule—must ensure new options either comply or extend the validation layer cleanly.
- 2025-11-09: `--filter-text` now narrows both `--list-functions` and `--list-variables`, with CLI summaries reporting total vs. matched counts.
- 2025-11-10: Preview helpers (`previewFunction`/`previewVariable`) now emit concise snippets and reuse shared search utilities; next step is wiring `--search-text` through main dispatch with formatter/JSON variants.
- 2025-11-10 (later): Wired `--preview`, `--preview-variable`, and `--search-text` through CLI dispatch and added focused Jest coverage for the new discovery helpers.
- 2025-11-11: Operator requested expanded `--help` output; scope includes grouping discovery flags (`--filter-text`, `--preview*`, `--search-text`) with detailed usage notes and cross-linking guardrail options.
- 2025-11-11 (later): Injected grouped help sections into `parseCliArgs` and added Jest coverage ensuring `--help` surfaces examples, discovery commands, guardrails, selector hints, and output controls.
- 2025-11-11 (even later): Added hash-directed selectors (`--select hash:<value>`), relative snippet loading via `--with-file`, and text-search follow-up suggestions across CLI output; extended Jest coverage and discovery docs to reflect the new workflows.
- 2025-11-11 (latest): Expanded `tools/dev/README.md` and `docs/CLI_REFACTORING_QUICK_START.md` with hash-driven workflows, search-text suggestion walkthroughs, and `--with-file` examples; discovery plan docs now in sync with implemented features.
- 2025-11-11 (current): Local changes promoted onto `main`; final staging/commit/push in progress per operator request.

## Active Plan — js-edit Inline Code Diagnostics (Initiated 2025-11-02)

### Goal
- Audit the newly added `--with-code` workflow, document why the current inline-code Jest cases fail, and publish a diagnostic review for operators.

### Current Behavior
- `tools/dev/js-edit.js` now unescapes `--with-code` arguments and validates syntax before applying replacements.
- Several inline-code Jest tests expect the CLI to succeed, but the most recent run (`npx jest tests/tools/__tests__/js-edit.test.js --forceExit --reporters=default --testNamePattern="with-code"`) fails seven cases.
- Failure messages show syntax reparse errors (e.g., duplicated `const` tokens) and outdated expectations for CLI error text.

### Proposed Changes
1. Reproduce the failing CLI invocations against temp copies of `tests/fixtures/tools/js-edit-sample.js` to capture exact error output from js-edit.
2. Compare the expected snippets in each test with the variable/function spans js-edit replaces to understand why syntax validation rejects them.
3. Summarize findings (root cause, reproduction steps, recommended fixes) in a formal diagnostic under `docs/review/` for future agents.

### Risks & Unknowns
- No code edits planned, but reproduction commands must avoid mutating fixtures.
- Ensure documentation clearly distinguishes declarator vs. declaration replacements so readers don’t repeat the same mistakes.

### Integration Points
- `tools/dev/js-edit.js` (inline replacement flow, newline normalization, guardrails).
- `tools/dev/lib/codeEscaper.js` (unescape + syntax validation logic).
- `tests/tools/__tests__/js-edit.test.js` (failing cases to reference in the diagnostic).

### Docs Impact
- Create a diagnostic in `docs/review/` capturing the investigation, outputs, and guidance for repairing the tests or adjusting CLI usage.

### Focused Test Plan
- Observation-only: `npx jest tests/tools/__tests__/js-edit.test.js --forceExit --reporters=default --testNamePattern="with-code"` to capture failures; no additional suites required.

### Rollback Plan
- Documentation-only effort; if diagnostic causes confusion, revert the new review file and associated plan notes.

### Branch & Notes
- Working branch: `chore/js-edit-light-discovery` (matches active workspace state; no new branch needed for read-only review).
- 2025-11-02: Confirmed js-edit rejects inline snippets that duplicate declaration keywords (`const` added twice) and that CLI now exits earlier when no primary operation flag is supplied — both behaviors will be captured in the diagnostic.
- 2025-11-11: Updated inline-code Jest specs to pass `--variable-target declaration`, corrected hash extraction for function replacements, refreshed the misuse error expectation, and verified with `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --testNamePattern="with-code"` (passing).
- 2025-11-11 (later): Upcoming work expands the discovery helpers with hash-based `--select`, relative `--with-file`, and search command suggestions; implementation pending.

## Active Plan — js-edit Byte Mapping Reliability (Initiated 2025-11-02)

### Goal
- Ensure js-edit’s span and snippet handling stays byte-accurate across string and buffer operations, avoiding whitespace/hash drift while keeping performance tight enough for iterative CLI workflows.

### Current Behavior
- `buildByteIndex`/`normalizeSpan`/`extractCode` recompute byte indexes independently, causing repeated O(n) scans per operation.
- Some call sites mix string slicing with byte-aware buffers, leading to subtle whitespace mismatches (e.g., declarator guards writing leading spaces that hashes skip).
- Guard hashes depend on buffer slices while CLI outputs rely on string slices, so normalization inconsistencies show up as mismatched hashes or truncated snippets after the recent byte-aware refactor.

### Proposed Changes
1. Inventory all helpers that compute byte/code-unit mappings (`buildByteIndex`, `normalizeSpan`, `extractCode`, `computeHash`, CLI guards) and document their call graph so we know where caching is safe.
2. Introduce a `ByteMapper` utility that constructs string ↔ buffer offset maps exactly once per source, exposing fast helpers for both byte and code-unit lookups.
3. Refactor swcAst helpers to accept an optional mapper instance and avoid re-parsing/re-mapping when the caller already has one; fall back gracefully for standalone usage.
4. Update CLI operations (extract/replace function + variable) to leverage the mapper consistently, guaranteeing the same snippet feeds guard hashes, file writes, and plan payloads.
5. Extend tests/fixtures with multi-byte and leading whitespace scenarios that previously triggered mismatches, ensuring both string and buffer paths agree.
6. Benchmark the revised helpers inside the CLI (enable `--benchmark`) to confirm the mapper amortizes cost without noticeable regressions.
7. Expand js-edit CLI output, help text, and JSON payloads so character offsets and byte offsets are clearly distinguished (including units/labels) and add coverage for mixed newline scenarios (LF/CRLF).
8. Introduce newline-style detection when applying replacements, normalising snippets to the target file’s convention, surfacing any conversions (with byte delta) in CLI summaries, and add regression coverage for line-ending handling.
9. Add high-coverage edge-case tests for span/byte alignment, including multi-byte glyphs, leading whitespace, trailing newline variations, and nested destructuring, ensuring guard hashes remain stable.
10. Document the new span/byte conventions, newline handling workflow, and CLI outputs across `tools/dev/README.md`, `docs/CLI_REFACTORING_QUICK_START.md`, and relevant agent instructions.

### Risks & Unknowns
- Mapper caching must stay memory-light; large files processed repeatedly could hold onto buffers longer than expected.
- Need to confirm SWC span end indices remain exclusive when mapped via the new helper—regressions here could reintroduce truncation.
- CLI code paths that only need a quick hash might not benefit from mapper reuse; ensure optional parameters don’t complicate simple use cases.
- New newline detection flow must avoid mutating untouched files (guard rails need to remain strict) and work for mixed-line endings inside the same file.
- CLI output must stay concise despite additional metadata; ensure JSON / text formats remain backwards compatible for existing scripts.

### Integration Points
- `tools/dev/lib/swcAst.js` for the helper refactor, plus any new module housing `ByteMapper`.
- `tools/dev/js-edit.js` operations that compute guard hashes, emit snippets, or write temp files.
- Jest integration suite under `tests/tools/__tests__/js-edit.test.js` and fixtures in `tests/fixtures/tools/`.
- CLI help + documentation: `tools/dev/README.md`, `docs/CLI_REFACTORING_QUICK_START.md`, `.github/instructions/GitHub Copilot.instructions.md` if agent expectations change.

### Docs Impact
- Update `tools/dev/README.md` and `docs/CLI_REFACTORING_QUICK_START.md` if mapper usage alters CLI guidance or performance notes.
- Capture any new helper API in `docs/JS_EDIT_ENHANCEMENTS_PLAN.md`.
- Document newline detection workflow, byte vs. char reporting semantics, and CLI messaging updates, ensuring future operators know how to interpret output.

### Focused Test Plan
- `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%` after each significant refactor.
- Ad-hoc CLI sanity checks (`node tools/dev/js-edit.js --extract-variable`) using multi-byte fixture cases.

### Rollback Plan
- Mapper lives in its own module so we can revert to direct helper calls by removing the new utility and restoring prior signatures.
- If performance tanks, flip callers back to the pre-refactor code path and open a follow-up to revisit caching.

### Branch & Notes
- **Branch:** `chore/js-edit-hash-workflows` (active; byte-mapping + newline work rides on this branch until guardrail overhaul lands).
- **Non-JS Edit Rationale:** CHANGE_PLAN.md updated directly to capture the new plan; js-edit targets JavaScript spans only.
- **2025-11-02 (late-night):** Refreshed `tools/dev/README.md` and `docs/CLI_REFACTORING_QUICK_START.md` with dual span (char + byte) guardrail guidance using direct Markdown edits (js-edit handles JavaScript spans only).
- **2025-11-07:** Introduced shared byte mapper helpers (`createByteMapper`/`resolveByteMapper`) and threaded them through `collectFunctions`/`collectVariables`; `js-edit` now reuses a cached mapper across function + variable inventories.
- **2025-11-08:** Scope expanded to (a) surface both UTF-16 code-unit spans and raw byte spans across CLI/JSON output, (b) convert replacements to the target file’s dominant newline convention while reporting conversions + byte deltas, and (c) add regression tests covering LF vs. CRLF fixtures plus multi-byte glyph spans before resuming hash workflow tasks.
- **2025-11-08 (evening):** Updated `tests/tools/__tests__/js-edit.test.js` replacement guard plan assertions to cover byte-aware identifier and span metadata.
- **2025-11-08 (late):** Hardened variable replacement guardrails by adding path-aware fallbacks when post-replacement spans collapse due to newline/byte index divergence (still needs CRLF validation).
- **2025-11-08 (late night):** Updated `replace-variable` integration spec expectations for newline guard payloads; `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%` passing after relaxed assertions matching converted CRLF metadata.
- **2025-11-09:** Extended function replacement guard-plan coverage so newline metadata is asserted for both immediate guard payloads and emitted plan files; rerun focused Jest after remaining updates.
- **2025-11-02 (evening):** Confirmed CRLF regression test now covers `replaceVariable` fallback, scoped upcoming span/byte summarisation work to `renderGuardrailSummary`, `formatSpanDetails`, `buildPlanPayload`, and locate/context table renderers prior to implementation.
- **2025-11-10:** Prep next pass: share cached `ByteMapper` with context/extract/replace flows (both functions and variables), reuse normalized spans across CLI helpers, and extend regression fixtures to cover multi-byte + CRLF mixes once wiring lands.
- **2025-11-11:** Starting ByteMapper follow-up — cache newline stats during main parse, reuse the shared mapper when re-collecting post-replacement records, and script additional multi-byte + mixed newline regression tests to lock in the behaviour.

### Next Implementation Steps
1. ✅ Validate the new `replaceVariable` fallback workflow across CRLF fixtures so guard hashes/path checks stay stable when post-replacement spans collapse to zero length. (2025-11-08 via updated replace-variable Jest spec.)
2. ✅ Extend guard + locate outputs so every span reports both code-unit and byte offsets (text + JSON), updating `renderGuardrailSummary`, plan payloads, locate/context tables, and JSON payload emitters. (2025-11-02)
3. Teach snippet loaders (`loadReplacementSource`, context builders) to detect the target file’s dominant newline style, normalize replacement snippets to match, and surface a CLI summary detailing any conversions and resulting byte deltas. *(2025-11-08: `--replace-variable` now normalizes replacements, records newline guard metadata, and reports byte deltas; extend the same flow to function replacements and shared helpers.)*
4. Adjust JSON payloads/plan files to capture newline handling metadata (original vs. applied style, conversions performed) for downstream automation.
5. Add focused Jest fixtures covering: (a) CRLF-driven files, (b) mixed newline files, (c) multi-byte grapheme spans, ensuring guard hashes remain stable after replacements.
6. ✅ Update documentation (`tools/dev/README.md`, `docs/CLI_REFACTORING_QUICK_START.md`) once behaviour ships so operators understand the new span units + newline reporting. (2025-11-02)

## Goal
- Replace legacy `url` TEXT columns with `url_id` foreign keys that reference the canonical `urls` table, and provide code-level support for working with both string URLs and IDs during the transition.

## Current Behavior
- Multiple tables (`crawl_tasks`, `latest_fetch`, `news_websites`, `place_hub_audit`, `place_page_mappings`, `place_sources`, `queue_events_enhanced`) still persist raw URL strings alongside (or instead of) `url_id` columns, leading to duplication and inconsistent joins.
- Adapters and services frequently accept URL strings and perform ad-hoc lookup/insert work, with no shared helper for ID resolution.
- Tests and documentation assume direct URL storage, so migrating schema without coordination will break consumers.

## Proposed Changes
1. **Baseline Snapshot** — Capture schema fingerprint, row counts, and representative samples for each affected table to validate post-migration integrity.
2. **Migration Authoring** — For each table, add `url_id` columns, backfill values using existing URLs (creating missing `urls` entries as needed), and drop legacy string columns once data coverage is confirmed.
3. **Schema Regeneration** — Regenerate `src/db/sqlite/v1/schema-definitions.js` and related fingerprints after migrations apply cleanly.
4. **Shared URL Helper** — Factor a reusable helper (or extend existing utilities) that adapters can call to resolve string URLs to IDs with caching/batching support.
5. **Adapter Updates** — Update `SQLiteNewsDatabase`, `ArticleOperations`, and allied modules to persist/query by `url_id`, while accepting URL strings at the edge for compatibility.
6. **Service Layer Pass** — Adjust services/background tasks/API controllers to consume the new adapter methods (`getByUrlId`, etc.) and to avoid writing raw strings.
7. **Testing** — Add migration regression tests plus adapter/service coverage ensuring URL ID paths function; run targeted Jest suites.
8. **Documentation & Rollout Notes** — Update database normalization guides, API docs, and migration runbooks; document rollout steps and verification queries.
9. **Verification Script** — Provide SQL/CLI snippets to confirm no residual `url` TEXT columns remain and all foreign keys enforce integrity.
10. **Plan Close-Out** — Summarize outcomes, remaining risks, and follow-up tasks, then mark the plan complete once code/docs/tests land.

## Risks & Unknowns
- `SQLiteNewsDatabase` references `this._ensureUrlId` but the implementation location is unclear; need to verify before refactoring.
- Long-running background processes may still insert raw URLs; must audit to avoid race conditions during rollout.
- Large table rewrites could be expensive; migration strategy may require batched copy or temporary tables to avoid locking.

## Integration Points
- `tools/db-schema.js`, `tools/db-query.js` for schema inspection and validation
- `src/utils/UrlResolver.js` for potential helper reuse/enhancement
- Adapters in `src/db/sqlite/v1`, services under `src/services`, and background tasks in `src/background`
- Documentation: `docs/DATABASE_NORMALIZATION_PLAN.md`, `docs/agents/database-schema-evolution.md`

## Docs Impact
- Update normalization guides to describe `url_id` usage and helper APIs.
- Adjust API documentation where responses/requests include URL identifiers.
- Capture migration procedure and verification steps in rollout docs.

## Focused Test Plan
- Migration regression test covering each affected table.
- Adapter/service Jest suites exercising both string and ID entry points.
- Targeted CLI validation (post-migration `node tools/db-schema.js` checks) documented in this plan.

## Rollback Plan
- Create pre-migration SQLite backups (per `data/backups/` policy) and record restoration steps.
- Keep migrations idempotent where possible; if failure occurs, restore from backup and revert feature branch.
- Maintain feature branch `feat/url-normalization` until changes merge; rollback by resetting branch and restoring backups.

### Working Branch & Session Notes
- **Branch:** `feat/url-normalization`
- **Session Date:** 2025-11-04
- **Knowledge Gaps:** need definitive location of `NewsDatabase._ensureUrlId`; confirm existing URL helper coverage for queue/task flows.
- **Tooling Friction:** `js-edit --list-functions` output for large files is unwieldy; consider future flag to filter by name prefix or line range. `js-edit` currently reports `replace` as unsupported on class methods like `ArticleOperations#_ensureUrlId`, so fallback editing was required.
- **Tooling Friction:** `js-edit --list-functions` output for large files is unwieldy; consider future flag to filter by name prefix or line range. `js-edit` currently reports `replace` as unsupported on class methods like `ArticleOperations#_ensureUrlId`, so fallback editing was required. Updating `schema-definitions.js` exposed another limitation — `--replace-variable` cannot target a slice of a large array initializer, making it impossible to swap a single CREATE TABLE statement without rewriting the 33k-char payload. Future js-edit work should allow element-level replacement or range-limited edits for variable initializers.

### Execution Checklist
- [ ] Capture baseline metrics (schema fingerprint, per-table row counts, NULL coverage for `url` fields).
- [ ] Author migrations to introduce `url_id` columns and backfill data for each target table.
- [ ] Remove legacy `url` text columns (or make them virtual) once backfill verified and add foreign keys/indexes.
- [ ] Regenerate schema blueprints and fingerprints.
- [ ] Extract/extend shared URL helper accessible to adapters/services. _(helper module shipped at `src/db/sqlite/urlHelpers.js`; adapters now being migrated to consume it starting with `ArticleOperations`.)_
- [ ] Migrate `QueueDatabase`, `PlannerDatabase`, and `CoverageDatabase` to use the shared URL helper instead of bespoke `_ensureUrlId` implementations.
- [ ] Update adapters (`SQLiteNewsDatabase`, `ArticleOperations`, queue/background DB modules) to favour `url_id`.
- [ ] Patch service/background layers to call the new adapter methods and avoid string persistence.
- [ ] Add/extend Jest coverage and migration regression tests.
- [ ] Update documentation (normalization guides, API references, rollout instructions).
- [ ] Provide verification SQL/CLI snippets and capture rollout guidance in this plan.
- [ ] Recreate `article_places` without the legacy `article_url` column (make `article_url_id` NOT NULL, rebuild the UNIQUE constraint + covering index on the ID column, and ensure importer/exporter flows accept the new schema).
- [ ] Update migration tooling/validator so imports drop ignored columns automatically and the URL normalization validator fails when denormalized columns remain populated.

---

## Active Plan — js-edit Class Method Replacement Support (Initiated 2025-11-02)

### Goal
- Enhance `tools/dev/js-edit.js` so class methods (including private/static/getter/setter variants) are treated as replaceable targets, enabling guarded replacements similar to function declarations and recognised callback handlers.

### Current Behavior
- `collectFunctions` marks class methods with `replaceable: false`; `js-edit` rejects replacement attempts, blocking CLI-driven refactors inside class bodies.
- CLI messaging advises the feature is unsupported, forcing manual edits or tooling fallback.
- Associated tests/fixtures lack coverage for class method mutations, so regressions would go unnoticed after enabling the workflow.

### Proposed Changes
1. **Branch Prep** — Create `chore/js-edit-class-methods` and record branch in this plan. ✅ (branch active)
2. **Collector Update** — Adjust `collectFunctions` to flag class methods as replaceable (with scope metadata for guardrails) and ensure enclosing context metadata stays intact. ✅ _Completed 2025-11-05_
3. **Guardrail Extension** — Relax `js-edit` replacement guard that currently whitelists only declarations/callbacks so it permits class-method records; update error messaging accordingly. ⏳
4. **Fixtures & Tests** — Extend `tests/tools/__tests__/js-edit.test.js` plus fixtures to cover locate/replace flows for standard, static, private (`#`), and accessor methods.
5. **CLI Help & Docs** — Update `tools/dev/README.md` and `docs/CLI_REFACTORING_QUICK_START.md` to mention class method support and any selector nuances.
6. **Regression Sweep** — Run `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%` and document results.

### Risks & Unknowns
- Need to confirm SWC spans for computed accessors behave consistently; may require guardfall for computed keys.
- Replacements on private methods (`#method`) must respect selector naming; verify canonical name generation is stable across parser versions.
- Existing guardrails might require additional path matching for `ClassPrivateMethod`; ensure they still resolve after replacements.

### Integration Points
- `tools/dev/lib/swcAst.js` (function collection logic, selector metadata).
- `tools/dev/js-edit.js` (replacement guard checks).
- Test fixtures under `tests/fixtures/tools/`.
- Documentation in `tools/dev/README.md`, `docs/CLI_REFACTORING_QUICK_START.md`.

### Docs Impact
- Mention class method replacement support in README + quick start guide, including recommended selectors.
- Add brief note to `.github/instructions/GitHub Copilot.instructions.md` if workflow expectations change for agents.

### Focused Test Plan
- Extend existing js-edit Jest suite with new cases covering locate + replace for class methods, static methods, and accessors.
- Confirm guard summaries show `replaceable: true` for class methods via CLI snapshot assertions.

### Rollback Plan
- If guardrail adjustments introduce regressions, revert collector changes and CLI guard updates, then re-run tests to verify prior behavior restored.
- Keep feature work isolated on `chore/js-edit-class-methods`; drop branch if blockers arise.

### Working Branch & Notes
- **Branch:** `chore/js-edit-class-methods` (created 2025-11-02 from `feat/url-normalization`).
- **Knowledge Gaps:** Need to confirm SWC node coverage for `ClassPrivateMethod` spans and computed keys before enabling replacement guardrails.
- **Tooling Friction:** `js-edit` replacement guard currently rejects class-method records even with `--force`; collector changes must elevate `replaceable` flag and CLI must accept the new kind.
- **2025-11-10:** Begin guardrail follow-up: adjust `replaceFunction` messaging + validation to acknowledge class methods, then add focused CLI replacement test cases for static/private/accessor methods using CRLF fixture variants.
- **2025-11-10 (late):** Added CLI regression covering `exports.NewsSummary > static > initialize` replacement to confirm guard hashes/path checks succeed against class methods copied to temp targets.
- **2025-11-11:** Extend class-method coverage to getters, instance, and private methods while tightening guardrail messaging/path checks so replacements succeed across method kinds without forcing overrides.

---

## Active Plan — js-edit Hash Query Enhancements (Initiated 2025-11-02)

### Goal
- Extend `js-edit` so operators can identify functions via their guard hashes directly from the function inventory output, and then extract the corresponding source snippets (and metadata) by providing one or more hashes to the CLI.

### Current Behavior
- `--list-functions` CLI output omits the guard hash even though `collectFunctions` already records it.
- No CLI entry point accepts hashes as selectors; operators must rely on names/path signatures, which is cumbersome for ambiguous callbacks.
- Extraction utilities focus on selectors or numeric spans, and the console formatter lacks concise, hash-centric tables for rapid triage.

### Proposed Changes
1. **Branch Prep** — Create `chore/js-edit-hash-workflows` from `main` (record branch info once created).
2. **Inventory Output** — Update `--list-functions` (table + JSON) to surface guard hashes and align column formatting with existing ASCII table conventions.
3. **Multi-Hash Extract Command** — Introduce a CLI option (e.g., `--extract-hashes <hash,hash>`), resolve each hash to the corresponding function entry (with collision handling), and emit the source with clear headers showing hash + path signature.
4. **Output Formatting** — Add reusable separator helpers so extraction output uses ASCII-only horizontal rules and concise annotated headers suitable for humans/bots.
5. **Augmented Query Modes** — Evaluate additional lightweight summaries (e.g., path signature listing, byte length, enclosing contexts) that can accompany hash-driven extraction to aid pre-edit reconnaissance.
6. **Help & Docs** — Refresh CLI help, README, and quick-start guidance so hash-driven workflows are discoverable and documented.
7. **Focused Tests** — Extend existing Jest suite and fixtures to cover the new command, hash collisions, and output formatting expectations.

### Risks & Unknowns
- Hash collisions are unlikely but must be handled predictably (e.g., guard failure with actionable messaging).
- Need to ensure hash outputs remain stable despite future digest-length adjustments (currently 8-char base64 with hex fallback).
- Multi-hash extraction could generate large output; guard against unbounded dumps by enforcing safe defaults and summarising when necessary.

### Integration Points
- `tools/dev/js-edit.js` (CLI argument parsing, command execution, table formatter).
- `tools/dev/lib/swcAst.js` (function metadata already contains hashes; may need helper exposure).
- `tests/tools/__tests__/js-edit.test.js` plus fixtures under `tests/fixtures/tools/` for coverage.
- Console formatting utilities currently embedded in `js-edit` (review for reuse).

### Docs Impact
- Update `tools/dev/README.md` and `docs/CLI_REFACTORING_QUICK_START.md` with hash-based workflows, sample commands, and usage notes.
- Note any new guardrail behaviours in `.github/instructions/GitHub Copilot.instructions.md` if operator expectations change.

### Focused Test Plan
- Jest integration tests covering `--list-functions` hash output, single/multi-hash extraction, collision handling, and formatted output assertions.
- Snapshot or string-based assertions validating ASCII separator usage and metadata annotations for extracted source.

### Rollback Plan
- Revert CLI/help/documentation changes if hash workflows introduce regressions; hashes remain internal metadata so removal is straightforward.
- Since changes are CLI-only, rolling back involves resetting `tools/dev/js-edit.js`, related tests, and docs on the feature branch before merge.

### Working Branch & Notes
- **Branch:** `chore/js-edit-hash-workflows` (created 2025-11-02 from `main`).
- **Open Questions:** Confirm whether hash selectors should also support variables; if scope expands, clone tasks into follow-up plan.
- **Tooling Friction:** Existing console formatter may need refactor to reuse separators across commands without duplicating ASCII art logic.
- **2025-11-10:** Implementation kickoff: surface guard hashes in `--list-functions`, wire `--extract-hashes` dispatch (collision handling + concise ASCII separator output), and script Jest coverage for multi-hash extraction + JSON payloads.

---

# Historical Plan — AST Editing Tool Investigation

## Goal
- Assess and, if feasible, prototype a repository-friendly code transformation CLI that can safely extract and replace JavaScript functions in very large files without manual `apply_patch` edits.
- Determine whether adopting a high-performance parser (possibly via a native Node.js add-on) measurably improves turnaround time and correctness for bulk refactors.

## Session Plan — 2025-11-02: Database URL Column Audit

### Goal
- Produce an authoritative list of database tables that expose a `url` column of type `TEXT`, using existing schema-inspection tooling only.

### Current Behavior
- Table-to-column mappings are not documented in CHANGE_PLAN.md, and it is unclear which tables currently define a `url` field or what their column affinities are.

### Proposed Changes
1. Identify the active working branch (expected: `main`) and document it here before taking any actions. **Working branch:** `main` (no feature branch needed for read-only inspection).
2. Run read-only schema inventory commands (preferred tool: `node tools/db-schema.js`) to enumerate all tables.
3. For each table, capture column definitions and filter to those with a `url` column whose declared affinity is `TEXT`.
4. Summarize the findings in the final response; no code or data modifications are planned.

### Risks & Unknowns
- SQLite may store type information with varying affinity strings (e.g., `TEXT`, `VARCHAR`) which could require interpretation.
- Tooling output may be large; ensure commands remain read-only and avoid accidental mutation flags (e.g., `--fix`).

### Integration Points
- Utilize `tools/dev/js-edit.js` only if JavaScript post-processing becomes necessary (not anticipated).
- Rely on `tools/db-schema.js` for schema inspection to stay aligned with repository tooling expectations.

### Docs Impact
- None expected; this is an observational task unless discrepancies emerge that warrant documentation updates.

### Focused Test Plan
- No automated tests required; verification occurs through inspection of CLI output.

### Rollback Plan
- Not applicable; operations are read-only. If unintended mutations occur, halt immediately and notify maintainers.

## Session Plan — 2025-11-02: URL Foreign Key Normalization Blueprint

### Goal
- Produce a comprehensive implementation blueprint that migrates every non-`urls` table currently storing raw `url` text into a normalized structure that references `urls.id` instead, while ensuring the application stack can operate on URL IDs for performance-sensitive code paths.

### Background
- Audit confirmed eight tables (`crawl_tasks`, `latest_fetch`, `news_websites`, `place_hub_audit`, `place_page_mappings`, `place_sources`, `queue_events_enhanced`, `urls`) expose a `url` column defined as `TEXT`.
- The `urls` table already owns the canonical string representation and should remain unchanged; every other table needs to reference `urls.id` instead of storing text directly.
- Need to ensure DB adapters and downstream layers can work with both URL strings (for compatibility) and URL IDs (for efficiency).

### Working Branch
- Pending implementation; remain on `main` while the blueprint is authored. Create a feature branch (e.g., `feat/url-normalization`) before coding.

### Proposed Phases & Tasks
1. **Discovery & Impact Mapping**
	- [ ] Inventory modules interacting with affected tables (`crawl_tasks`, `latest_fetch`, `news_websites`, `place_hub_audit`, `place_page_mappings`, `place_sources`, `queue_events_enhanced`).
	- [ ] Audit existing helpers for URL insertion/lookup (search `src/db/sqlite`, `src/services`, `src/background`).
	- [ ] Confirm documentation dependencies (`docs/agents/database-schema-evolution.md`, `docs/DATABASE_NORMALIZATION_PLAN.md`).

2. **Branch & Safety Prep**
	- [x] Create feature branch (target name: `feat/url-normalization`).
	- [ ] Capture baseline schema snapshot and row counts using `sqlite3 .schema`/existing tooling.
	- [ ] Record backup guidance in rollout notes.

3. **Schema Design & Migration Implementation**
	- [ ] Draft SQL migration(s) to add `url_id` columns (nullable) to each impacted table and populate via joins to `urls`.
	- [ ] Ensure migrations create missing URL entries (`INSERT OR IGNORE INTO urls(url)`), backfill `url_id`, and add foreign keys + indexes.
	- [ ] Create replacement tables dropping legacy `url` columns and promoting `url_id` to NOT NULL where data coverage allows; otherwise retain fallback with constraints.
	- [ ] Update schema fingerprint and regenerate blueprint (`src/db/sqlite/v1/schema-definitions.js`).

4. **DB Adapter & Helper Enhancements**
	- [ ] Introduce shared URL helper module (`src/db/sqlite/urlHelpers.js` or augment existing) providing `ensureUrlId`, `fetchUrlById`, and batch utilities.
	- [ ] Update adapters for each affected table to read/write via `url_id`, returning both ID and resolved string (lazy fetch) to maintain compatibility.
	- [ ] Ensure adapters expose ID-based query variants (e.g., `getByUrlId`) to unlock higher-level performance improvements.

5. **Higher-Level Service Updates**
	- [ ] Refactor services/background tasks to prefer ID-based methods; maintain string-oriented entry points that delegate through helper.
	- [ ] Update validation/serialization logic (API, background processors) to surface URL IDs where appropriate.
	- [ ] Adjust telemetry/logging so URL lookup remains meaningful (e.g., include resolved string for logs).

6. **Testing & Verification**
	- [ ] Add regression tests covering migrations using in-memory/temp DB (ensure old fixtures with string URLs migrate cleanly).
	- [ ] Extend adapter/service tests to assert ID workflows (`getByUrlId`, `ensureUrlId`).
	- [ ] Run focused Jest suites and document commands in this plan.

7. **Documentation & Rollout**
	- [ ] Update relevant docs (`docs/DATABASE_SCHEMA_EVOLUTION.md`, adapter READMEs) to describe new normalization contract and helper APIs.
	- [ ] Record migration steps, verification queries, and rollback instructions in a new migration doc under `docs/migrations/`.
	- [ ] Summarize rollout checklist (backup, migration execution, verification, code deploy) before closure.

### Risks & Unknowns
- Duplicate/malformed URLs could prevent unique constraints from succeeding; may require pre-cleanup.
- Background tasks or external tooling might still write raw URLs; must audit and update them.
- Potential downtime if migration rewrites large tables; consider batching or incremental backfill.

### Dependencies & Integration Points
- `tools/db-schema.js` / `tools/db-query.js` for inspection and validation.
- Existing normalization guides in `docs/DATABASE_NORMALIZATION_PLAN.md`.
- DB adapters under `src/db/sqlite` and shared helpers under `src/db/sqlite/v1`.
- API/service layers in `src/services`, background processors in `src/background`.

### Focused Test Plan (Post-Implementation)
- Use temporary SQLite fixtures mirroring production schema to run migration scripts end-to-end.
- Targeted Jest suites for each adapter updated to use `url_id`.
- Add regression tests ensuring `urls` table remains authoritative (no stray string columns).

### Rollback Plan (Post-Implementation)
- Maintain pre-migration backup (SQLite file) and feature branch for code rollback.
- If migration fails mid-way, restore from backup and re-run after addressing issues; scripts should be idempotent when possible.


## Current Behavior
- Contributors rely on editor tooling or `apply_patch` for code edits; no repo-provided automation exists for syntax-aware transformations.
- Existing CLI helpers (e.g., `tools/*`) focus on data operations and reporting, not AST manipulation.
- There is no dependency on Babel/Recast/Tree-sitter today; the toolchain avoids native build requirements beyond better-sqlite3.

## Proposed Changes (SWC Track)
1. ✅ **Add SWC Dependency** — Introduce `@swc/core` to the workspace (document installation caveats for Windows/PowerShell) and capture any package-lock churn.
2. ✅ **Bootstrap `tools/dev/` Workspace** — Create `tools/dev/` for experimental-yet-safe developer CLIs that still follow the shared parser/formatter conventions; add README stub.
3. ✅ **Design `js-edit` CLI Skeleton** — Draft `tools/dev/js-edit.js` using `CliArgumentParser`/`CliFormatter`, enforcing dry-run by default and supporting basic commands (`--list-functions`, `--extract <name>`, `--replace <name> --with <file>`).
4. ✅ **Implement SWC AST Helpers** — Build a small helper module (e.g., `tools/dev/lib/swcAst.js`) that wraps `@swc/core` parse/print APIs, preserving formatting via SWC’s code generator and ensuring comments survive round-trips.
5. ✅ **Validation Harness** — Add focused tests/fixtures under `tests/tools/__tests__/` to verify extraction/replacement on representative large-file samples and ensure dry-run leaves files unchanged.
6. ⏳ **Performance Benchmarks** — Measure SWC parse + transform time on a large file (>1k LOC) using CLI `--benchmark` flag; record results in docs for future comparison.
7. ✅ **Operator UX & Safety** — Provide diff preview (`--emit-diff`) support and clear messaging about dry-run vs. `--fix`; document fallback guidance if SWC compilation fails on a machine.
8. ✅ **Context Retrieval Workflow** — Introduce commands that surface surrounding source for functions/variables with configurable padding so agents can inspect targets without leaving the CLI.

### Outstanding Items (as of 2025-11-03)
- Capture and document benchmark timings for representative small/medium/large files (Proposed Change 6 / Phase 8).
- Extend guard summaries and plan emission reporting for `--allow-multiple` batch workflows before closing Phase 4/5 follow-ups.
- Expand variable editing workflows so js-edit can safely replace destructured imports / top-level bindings without falling back to manual edits.
- Update release artifacts once the above land: CHANGELOG/docs audit, feedback guidance, and backlog capture (Phase 9).

-### Bug Fix Addendum — Context/Extract Off-by-One (Logged 2025-11-02, Active 2025-11-02)
- Detected leading-character truncation when extracting functions (e.g., `function` rendered as `unction`).
- **Tasks**:
	1. Introduce regression tests in `tests/tools/__tests__/js-edit.test.js` verifying `--extract` and context payloads preserve leading characters for both functions and variables.
	2. Audit span normalization in `tools/dev/lib/swcAst.js` and context builders to locate the off-by-one root cause; adjust calculations while keeping guardrails stable.
	3. Re-run focused Jest suite post-fix and validate CLI extracts on sample fixtures.
- **2025-11-02 Update**: Identified spans from SWC as 1-based byte offsets; ASCII slicing fails when non-ASCII glyphs appear before the target. Implementing byte-aware extraction (`Buffer.slice`) and byte-to-code-unit conversion helpers before resuming js-edit driven edits.
- Resume overview implementation once regression tests pass.

	- **2025-11-07 Update**: After introducing byte-aware spans, variable declarator extraction started truncating trailing characters (`cartoon;` → `cartoo`). Plan: (1) revisit `normalizeSpan` end calculations so byte-exclusive slices include the full declarator, (2) rerun focused Jest suite (`npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%`), and (3) verify CLI `--extract-variable` / `--replace-variable` flows complete without guard mismatches before resuming hash workflow enhancements.

> **Status Update — 2025-11-03:** js-edit enhancement work is **paused** so we can redirect development bandwidth to other backlog items. Outstanding js-edit tasks above remain recorded but are deferred until the compression utilities unification plan progresses.

### Next Focus After Pause
- Resume `docs/CHANGE_PLAN_COMPRESSION_UTILITIES.md` (Compression Utilities Unification) beginning with Step 1 (`CompressionFacade`) and Step 2 (facade integration in article/bucket utilities).

### Active Session Tracker — Compression Utilities
- **Branch:** `chore/compression-facade`
- **2025-11-03:** `CompressionFacade` rewritten with preset normalization, range guards, and helper exports (`compressWithPreset`, `resolvePresetName`, `getCompressionConfigPreset`). Next actions: switch `articleCompression`/`compressionBuckets` to the new facade helpers, prune duplicated option normalization, and add targeted tests before widening rollout.
- **2025-11-01:** Resuming Compression Utilities plan after js-edit enhancements. Verified facade helpers still align with config presets, confirmed article/bucket modules require cleanup to rely exclusively on facade stats + option normalization. Task list for this session: (1) finish integrating facade helpers into `compressionBuckets.js` (stats, preset defaults, validation), (2) audit `articleCompression.js` for remaining legacy paths, (3) extend targeted tests and rerun focused suites. js-edit will drive JavaScript edits; Markdown updates (this note) performed via standard editing since js-edit targets JS spans. Noted js-edit gap for top-level destructuring edits (imports); used a one-off direct edit while capturing this limitation for future tool improvement.

### Active Session Tracker — js-edit Diagnostics
- **Branch:** `chore/compression-facade`
- **2025-11-03:** User surfaced a regression where `node tools/dev/js-edit.js --list-functions` returns zero entries for Jest test files (e.g., `src/utils/__tests__/compressionBuckets.test.js`). Reproduced locally; issue stems from `collectFunctions` ignoring anonymous arrow/function expressions passed as call arguments (common in test suites). Next actions: update js-edit plan (resume Phase 2/3 work), extend `collectFunctions` to index anonymous callbacks with generated canonical identifiers, add regression coverage, and rerun focused Jest suite.
- **2025-11-04:** Callback indexing landed, but replacements against those synthesized callback records still reject with “not currently replaceable.” New scope: adjust js-edit guardrails so call-derived callbacks (Jest `describe`/`test`/hooks and similar) opt into controlled replacements, expose canonical `call:*` selectors in CLI outputs, and wire dedicated fixtures/tests (`tests/fixtures/tools/js-edit-jest-callbacks.js`) to prove locate/list/replace flows succeed. Deliverables include CLI guard updates, traversal metadata (`replaceable: true` when safe), documentation adjustments, and a focused Jest integration run once edits apply.
- **2025-11-05:** Operator requested js-edit support for rewriting destructured imports (top-level variable declarators). Plan: design `--replace-variable` flow targeting declarator spans, enrich variable records with declarator/declaration metadata + hashes, add CLI plumbing, extend guardrails/tests, and update docs. Working branch: `chore/plan-js-edit-variable` (spun off existing facade work to keep history contiguous).
- **2025-11-06:** Refactored CLI option normalization (`normalizeOptions`) to support the new variable selectors/operations, restoring guard validation coverage and slotting `--replace-variable` into the standard workflow. Next actions: wire the selector/operation handlers to use the new metadata, add focused Jest coverage, and update docs.
- **2025-11-06 (later):** Extend guard summaries for `--allow-multiple` workflows so locate/context commands surface aggregate span metrics in both CLI/table output and emitted plans. Plan emission now prefers expected spans when available, and CLI locate/context commands now report aggregate span/context ranges. Follow-up completed by extending `tests/tools/__tests__/js-edit.test.js` to exercise `--variable-target binding` and `--variable-target declaration`, including summary assertions and end-to-end replacement coverage with temp fixtures.
- **2025-11-06 (wrap-up):** All scoped js-edit enhancements on `chore/plan-js-edit-variable` are ready for merge. Aggregated span summaries now appear in emitted plans and CLI locate/context tables, and declaration/binding replacement flows have passing integration coverage. Focused validation command: `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%`.
- Audit remaining change plans for incomplete tasks (compression analytics consolidation, background-task telemetry) and queue them once the compression facade landings are stable.

---

## Detailed Roadmap: js-edit Locator & Guardrail Enhancements

### Phase 1 — Discovery & Requirements (Day 0–1)
1. **Baseline CLI Audit**
	- Enumerate current commands (`--list-functions`, `--extract`, `--replace`) and their outputs.
	- Capture limitations: shared names, lack of class scoping, no structural selectors, single-span validation only.
2. **Use-Case Inventory**
	- Interview task logs to identify recurring edit patterns: replace class method, rename export, patch nested helper.
	- Produce two representative fixtures: one with heavily nested classes/methods, one with mixed named exports and factory functions.
3. **Parser Capability Check**
	- Verify SWC node shapes for `ClassMethod`, `ClassProperty`, and `TS` nodes (even if TypeScript optional) to ensure future-proofing.
	- Note span behavior (start/end, leading keywords) to inform guardrail calculations.

### Phase 2 — Enhanced Node Indexing (Day 2)
1. **Scoped Naming**
	- Extend `collectFunctions` to build canonical labels: `alpha`, `MyClass#render`, `MyClass.static initialize`, `exports.default`, etc.
	- Attach `scopeChain` array (e.g., `['MyClass', '#render']`) for downstream selectors.
2. **Deterministic Path Signatures**
	- During traversal, accumulate a `nodePath` string that mirrors visitation order (`module.body[4].class.body[2].method`). Store on each record.
	- Expose helper to render friendly selectors (CSS-like) and machine selectors (array of indices).
3. **Token Hashing**
	- For each record, slice the raw source span and compute a stable hash (e.g., SHA-256). Persist on the record for guardrail comparison.

### Phase 3 — CLI Surface Expansion (Day 3)
1. **Introduce `--locate` Command**
	- Usage: `js-edit --file foo.js --locate alpha`.
	- Output: table/JSON containing `name`, `kind`, `scope`, `line:column`, `startOffset`, `endOffset`, `pathSignature`, `hash`, `replaceable`.
	- For ambiguous matches (>1), exit non-zero unless `--select` (see below) is provided.
2. **Support Qualified Queries**
	- Accept patterns `ClassName#method`, `ClassName.method`, `ClassName::method` (alias) and exact `pathSignature` via `--path`.
	- Implement argument normalization so `--extract`/`--replace` reuse the same resolution logic.
3. **Selection Flags**
	- Add `--select <index>` to pick nth match when duplicates remain (index order defined by source span).
	- Offer `--allow-multiple` (default off) to opt out of the uniqueness guard when intentionally targeting multiple matches.
4. **Expose Function Metrics**
	- Extend `--list-functions` payloads to include byte lengths (span width) and surface path signatures where helpful for rapid inspection workflows.
5. **Variable Inventory Mode**
	- Add `--list-variables` CLI option and supporting metadata collectors so operators can enumerate bindings (kind, scope, initializer) with byte lengths and path signatures for auditing large files.
6. **Context Retrieval Mode** *(Day 3.5)*
	- Implement CLI commands that retrieve surrounding source for functions or variables (default ±512 characters) leveraging existing selector resolution.
	- Allow overrides for leading/trailing context (e.g., `--context-before`, `--context-after`) so agents can widen focus when needed.
	- Emit JSON payloads that include span metadata, path signatures, and guard hashes to keep downstream validations intact.
	- Provide options to expand to enclosing structures (class bodies, parent functions) for higher-level inspection.
	- Harden substring math against multi-byte characters (emoji, astral code points) to avoid drift between SWC spans and JavaScript slicing.
	- Update `--help` output so the new context commands are discoverable, including defaults, selector guidance, and safety notes.

#### Active Implementation Tasks — Context Retrieval & Help Refresh
1. **Selector Infrastructure**
	- Extend function selectors (reused from locate) to context operations and build a parallel selector set for variables (name, scope chain, `path:`, `hash:` aliases).
2. **CLI Option Surface**
	- Add mutually exclusive options: `--context-function <selector>` and `--context-variable <selector>` plus optional `--context-before`, `--context-after`, and `--context-enclosing <mode>` (e.g., `exact`, `function`, `class`).
3. **Span-Safe Extraction**
	- Implement helpers that derive padded spans using code-unit math and guard against bounds; reuse `extractCode` for core span while slicing surrounding context without corrupting surrogate pairs.
4. **Context Rendering**
	- Provide formatted output (sections, code fences) and JSON payloads enumerating the base span, requested padding, and resulting hash so agents can re-validate.
5. **Enclosing Structure Expansion**
	- When `--context-enclosing class` or `--context-enclosing function` is requested, widen the span to include the corresponding parent structure; ensure metadata reflects the enlarged range.
6. **Help & Docs Refresh**
	- Update `parseCliArgs` descriptions so `--help` explicitly documents context commands, defaults (±512), and selector hints; sync documentation bullets under “Docs Impact.”
7. **Fixture & Test Coverage**
	- Enhance `tests/fixtures/tools/js-edit-sample.js` with emoji-containing declarations and nested classes.
	- Add Jest specs covering context retrieval for functions/variables, padding overrides, multi-match disambiguation, and multi-byte safety.
8. **CommonJS Compatibility**
	- Ensure collectors and selectors recognize `module.exports` / `exports.*` assignment patterns alongside ESM declarations so CLI commands work across mixed module styles (require/exports).
	- Verify canonical names and selector aliases include dot-form (`module.exports.handler`, `exports.helper`) and add focused tests/fixtures for CommonJS forms.

### Phase 4 — Guardrails & Verification (Day 4)
1. **Dual Verification**
	- During replacement, require both span match AND hash match (unless `--force` supplied).
	- Surface a CLI flag (e.g., `--expect-hash`) that agents can populate from a prior `--locate` run so drifted files fail fast.
	- After splicing, re-parse (already implemented) and ensure newly generated hash differs; log diff preview if unchanged.
2. **Selector Confirmation**
	- If `--path` provided, recompute path signature on fresh AST post-parse and confirm the targeted node still resolves there.
3. **Dry-Run Diagnostics**
	- Extend dry-run output with explicit guardrail summary: `Span OK`, `Hash OK`, `Path OK`, `Syntax OK`.
4. **Error Messaging**
	- Provide actionable failure reasons (e.g., “Hash mismatch: file changed since locate step. Re-run --locate and retry.”).

### Phase 5 — Token-Level Edits (Day 5)
1. **Sub-span Targeting**
	- ✅ Introduced `--replace-range start:end` for targeted edits (offsets relative to the located function) with bounds validation.
2. **Inline Mutation Helpers**
	- ✅ Added `--rename <newName>` convenience for renaming function identifiers when the declaration exposes a named identifier; limited to declaration renames for safety.
3. **JSON Patch Export**
  	- ✅ Implemented — `--emit-plan` now writes guard metadata (path signature, offsets, hash) for locate/extract/replace flows alongside CLI JSON payloads. Covered by integration tests.

### Phase 6 — Documentation & Examples (Day 6)
1. **Update `tools/dev/README.md`**
	- Add usage examples for `--locate`, qualified names, guardrail outputs, and ambiguity resolution.
2. **Add HOWTO Section**
	- Extend `docs/CLI_REFACTORING_QUICK_START.md` (or create referenced section) describing AST edits with js-edit, focusing on guardrail workflows.
3. **Workflow Recipes**
	- Document two sample flows: replacing a class method, renaming a default export. Include command sequence and expected output.

### Phase 7 — Testing & Validation (Day 7)
1. **Unit Tests**
	- Expand fixtures to include nested classes, overloaded method names, getters/setters.
	- Verify `collectFunctions` outputs scope chains, path signatures, and hashes correctly.
2. **CLI Integration Tests**
	- Use `child_process` to invoke `js-edit` with `--locate`, `--select`, `--replace` (dry-run). Assert JSON outputs and guardrail statuses.
3. **Regression Matrix**
	- Ensure guardrails prevent edits when file drifts, when replacement introduces syntax errors, and when selector mismatch occurs.

### Phase 8 — Performance Review (Day 8)
1. **Benchmark Variants**
	- Measure locate/replace performance on small (200 LOC), medium (1k LOC), large (5k LOC) files.
	- Compare runtime with and without optional reference checks (hash vs. path) to confirm overhead is acceptable.
2. **Optimization Opportunities**
	- If needed, memoize `pathSignature` computation per traversal; still no cross-invocation caching.
	- Confirm the CLI remains responsive (<500ms) for locate operations on medium files.

### Phase 9 — Rollout & Follow-Up (Day 9)
1. **Release Checklist**
	- Ensure CHANGELOG/docs updated, example commands verified, tests green.
2. **Feedback Loop**
	- Encourage early adopters to report edge cases; instrument CLI with optional `--debug` flag to log resolution details.
3. **Future Enhancements (Backlog)**
	- Explore AST query language integration (e.g., tsquery-like selectors).
	- Consider multi-edit batches (`--script plan.json`) once guardrails prove reliable.

> 📌 *Caching the AST between operations is intentionally deferred per operator guidance; all steps above assume fresh parsing per invocation.*

## Risks & Unknowns
- **Native Build Toolchain** — `@swc/core` ships prebuilt binaries, but PowerShell installs still require build tools fallback; document remediation if npm falls back to source builds.
- **Formatting Drift** — SWC’s code generator may reformat output; mitigate by isolating edits to targeted spans and optionally piping through prettier when needed.
- **Scope Creep** — Tool could become overly complex (multi-language, deep refactors) without clear guardrails.
- **Dependency Footprint** — Introducing SWC increases install size; ensure CI caches node_modules or note install time expectations.

## Integration Points
- `tools/` CLI conventions (`CliArgumentParser`, `CliFormatter`, dry-run defaults).
- Potential reuse of existing diff/report helpers for preview output.
- Tests executed via `npx jest --runTestsByPath` with custom fixtures.
- Documentation sync with `docs/CLI_REFACTORING_QUICK_START.md` and `.github/instructions` if guidelines change.

## Docs Impact
- Update `docs/CLI_REFACTORING_QUICK_START.md` with syntax-aware tooling guidance.
- Add a new HOWTO section (likely in `docs/tools/` or an existing CLI reference) describing usage, safety flags, and known limitations.
- If guidelines change, adjust `.github/instructions/GitHub Copilot.instructions.md` accordingly.
- Detailed execution steps now tracked in `docs/JS_EDIT_ENHANCEMENTS_PLAN.md`; keep both documents in sync as phases progress.
- Document context retrieval usage (function vs. variable selectors, padding overrides, full-structure expansion) so agents can adopt the workflow without guesswork.

## Focused Test Plan
- Unit tests hitting representative JS fixtures (default exports, named exports, nested functions) verifying extraction/replacement accuracy and dry-run behavior.
- Smoke test that a no-op run leaves files untouched.
- CLI integration tests covering error cases (missing function, parse failure, write without `--fix`).
- Optional benchmark script comparing parse times across parser choices (document results, not necessarily automated).
- Add a CLI test ensuring `--list-functions --json` returns byte length metadata for each record.
- Add a CLI test for `--list-variables --json` confirming bindings include scope, binding kind, and byte length metadata.
- Add CLI tests for the new context commands, covering default ±512 padding, custom overrides, multi-byte fixtures, and class-level expansion cases.
- ✅ Ran `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1` to cover plan emission, range replacements, and rename flows.

### Branch Closure Summary — `chore/plan-js-edit-variable` (2025-11-06)
- **Implemented:** Aggregate span summaries in locate/context CLI output and plan payloads, expanded variable replacement workflow with binding/declaration coverage, updated fixtures/docs (`tools/dev/README.md`, `docs/CLI_REFACTORING_QUICK_START.md`, `docs/JS_EDIT_ENHANCEMENTS_PLAN.md`), and refreshed compression facade/unit tests alongside js-edit enhancements.
- **Tests:** `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%`.
- **Follow-ups:** Performance benchmarks (Phase 8), multi-target guard summary polish, compression facade integration cleanups, and benchmarking/documentation tasks already tracked above.

## Rollback Plan
- Tool is additive; reverting entails removing the new CLI, dependencies, and docs.
- Ensure package-lock.json updates can be undone via `git restore` if parser selection proves problematic.
- Session Notes — 2025-11-01
	- Added context retrieval commands (function & variable) with configurable padding, class/function expansion, and JSON payloads.
	- Refreshed CLI help text to document new operations, selector guidance, and guardrail options.
	- Expanded fixtures with emoji/class samples and added Jest coverage for context workflows.
	- Extended SWC traversal to capture full enclosing context stacks (export, class, function) and wired `--context-enclosing function` to the nearest callable parent.
	- Context JSON now reports `enclosingContexts` plus `selectedEnclosingContext`; CLI output surfaces both the stack and the expanded target.
	- Added integration coverage for function-mode expansion (`countdown`) and variable context expansion (`sequence`) alongside existing emoji/class expectations.
	- Tests: `npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%`.
	- Follow-ups: explore batch context exports if operators request them.
	- Next: Extend collectors/selectors to cover CommonJS (`module.exports`, `exports.*`) so require-style modules get parity with ESM features.
	- Session Notes — 2025-11-02
		- Performing CommonJS support pass for collectors/selectors: add assignment capture, canonical naming, and scope handling for `module.exports` / `exports.*` chains.
		- Plan to expose new selector aliases (e.g., `module.exports.handler`, `exports.helper`) and ensure CLI lookup accepts them.
		- Add fixtures with `require`-style exports plus focused Jest coverage for locate/context flows.
		- Update docs (`tools/dev/README.md`, `docs/CLI_REFACTORING_QUICK_START.md`) once parity verified.
		- Tests to run: targeted Jest suite (`npx jest --config jest.careful.config.js --runTestsByPath tests/tools/__tests__/js-edit.test.js --bail=1 --maxWorkers=50%`).
		- ✅ Scope chains now capture `module.exports`/`exports.*` assignments; CLI selectors resolve new canonical names and context flows cover CommonJS fixtures.
		- ✅ Added CommonJS blocks to sample fixture, expanded Jest integration coverage, and refreshed docs with selector guidance.
		- ✅ Variable collector + selectors now surface `module.exports = {...}` and `exports.value = 42` style assignments in `--list-variables`, backed by fixtures, tests, and doc updates.
		- ✅ Guard hashes now use const-driven Base64 (8 char) digests with a hex fallback switch; tests/docs updated so shorter tokens remain compatible with path guardrails.
		- ✅ Added span guard input (`--expect-span start:end`) so replacements can assert exact offsets alongside hashes; guard summaries and plan payloads now record the expected span and Jest coverage exercises OK/mismatch/bypass flows.
		- 🔄 Next: extend plan emission tests for `--allow-multiple` workflows and evaluate whether guard summaries should highlight multi-target spans when batching is enabled.
	- Session Notes — 2025-11-03
		- Draft dedicated operations agent (“Careful js-edit Builder”) that bakes in js-edit workflows, stuck-state reporting, and improvement proposals queued behind operator approval.
		- Ensure agent instructions cover building/testing js-edit, safe usage patterns, and escalation path when guardrails block progress.
		- Pending confirmation: once agent baseline lands, evaluate backlog of potential js-edit enhancements surfaced by the workflow.
		- ⏳ Capture benchmark timings across representative file sizes so the performance review (Phase 8) can be marked complete.
		- ⏳ Extend guard summaries and plan emission reporting for `--allow-multiple` batch workflows before enabling multi-edit sessions.
		- ⏳ Prep rollout collateral (CHANGELOG/docs audit, feedback loop, backlog entry) after the remaining engineering tasks close.
		- ➖ Paused js-edit implementation work to pivot toward the Compression Utilities Unification effort; outstanding items stay logged above for future resumption.
