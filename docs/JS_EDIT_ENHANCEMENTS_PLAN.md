# js-edit Enhancements Implementation Plan

## Purpose
This document captures the detailed execution plan for expanding `tools/dev/js-edit.js` beyond simple function extraction and replacement. The goal is to deliver precise function location, structural guardrails, and safe mutation helpers without relying on cached AST state. Each phase below lists goals, concrete tasks, outputs, validation steps, and ownership notes so agents can execute autonomously while maintaining traceability.

> **Status — Re-activated (2025-11-03):** js-edit work has resumed to address a regression where anonymous Jest callbacks are missing from `--list-functions` output. Focus first on restoring callback detection, then continue with the outstanding enhancements captured below.

## Guiding Principles
- **Fresh Parse Per Operation:** All tooling will parse the target file on demand; no persistent AST cache will be introduced.
- **Deterministic Identification:** Every locate or edit action must rely on reproducible metadata (scope chains, path signatures, start/end offsets, hashes).
- **Fail Fast:** Guardrails (hash checks, path checks, syntax re-parse) should abort risky updates before disk writes.
- **CLI Consistency:** Continue using `CliArgumentParser`/`CliFormatter`, dry-run defaults, and JSON output for automation.
- **Incremental Delivery:** Each phase should end with runnable code, tests, and documentation updates to avoid long-lived branches.

---

## Phase 1 — Discovery & Requirements (Day 0–1)
**Objective:** Document current behavior and gather requirements for enhanced location and safety features.

### Tasks
1. **CLI Capability Survey**
   - Run `node tools/dev/js-edit.js --help` and capture existing commands.
   - Record shortcomings: ambiguous names, missing class context, single-guard span validation, lack of selectors.
2. **Usage Pattern Analysis**
   - Review recent task logs and agent feedback to enumerate common edits (renaming class methods, patching default exports, editing nested helpers).
   - Produce a short list of user stories (e.g., “Replace `NewsSummary#render` body in-place”).
3. **Fixture Expansion Blueprint**
   - Sketch additional fixture files representing nested classes, static methods, getters/setters, overloaded names.
   - Note location and naming conventions for new fixtures under `tests/fixtures/tools/`.
4. **SWC Node Shape Audit**
   - Inspect AST nodes for `ClassMethod`, `ClassProperty`, `FunctionExpression`, `ExportDefaultDeclaration`, and arrow functions using console scripts.
   - Record property names (`key`, `identifier`, `span`, `body`) and anomalies (e.g., `decl` vs `declaration`).

### Deliverables
- Requirements log (append to `CHANGE_PLAN.md` or inline comments in this doc).
- Fixture design notes.
- Verified AST node reference output saved in `tmp/` (optional but helpful for future debugging).

### Validation
- Ensure requirements cover both locate and edit workflows.
- Confirm no caching assumptions appear in requirements.

#### Findings — 2025-11-01
- **CLI Inventory:** `node tools/dev/js-edit.js --help` currently exposes `--list-functions`, `--extract`, `--replace`, `--with`, `--emit-diff`, `--benchmark`, and JSON/quiet toggles. Operations are mutually exclusive and keyed solely by function name, so shared identifiers immediately raise the “Multiple matches” error with no scoped selector escape hatch.
- **Current Usage Stories:** Reviewing the existing Jest spec (`tests/tools/__tests__/js-edit.test.js`) shows the tool is relied upon for (1) extracting/exporting named functions, (2) replacing default export declarations, and (3) validating syntax failures. Real-world needs surfaced in task logs include replacing class methods (`NewsSummary#render`), updating default handlers without altering surrounding scaffolding, and patching nested helper closures.
- **Fixture Expansion Plan:** New fixtures will live beside `tests/fixtures/tools/js-edit-sample.js`. Draft file names: `js-edit-nested-classes.js` (class with instance/static/getter methods), `js-edit-mixed-exports.js` (interleaved named/default exports plus factory returns), and `js-edit-overloaded-names.js` (duplicate helper names in different scopes). Each will capture edge cases for selectors and guardrails.
- **SWC Node Shape Notes:** Direct inspection of a class snippet confirms `ClassDeclaration` nodes expose `body` as an array of `ClassMethod` entries with `key`, `function`, `kind`, and `isStatic` flags. Individual spans use `{ start, end }` offsets (1-based start) aligning with our `normalizeSpan` adjustment, and getter methods surface `kind: "getter"` so scope metadata must preserve that detail. These observations feed Phase 2’s scope chain and path signature design.

---

## Phase 2 — Enhanced Node Indexing (Day 2)
**Objective:** Enrich `collectFunctions` results with scoped names, deterministic paths, and token hashes.

### Tasks
1. **Scope Chain Capture**
   - Extend traversal to maintain `context.scopeChain` including class names and flags (instance `#method`, static `.method`).
   - Store `scopeChain` on each function record and add a computed `canonicalName` (e.g., `MyClass#render`).
2. **Path Signature Generation**
   - Build a `pathSignature` string during traversal (e.g., `module.body[3].ClassDeclaration.body[1].ClassMethod`).
   - Provide helper utilities to serialize both human-readable (`MyClass.body[method#render]`) and machine forms (array of indices).
3. **Token Hashing**
   - Extract code for each function span and compute SHA-256 hash using Node’s `crypto` module.
   - Include hash in the function record for later guardrail checks.
4. **Line/Column Accuracy Review**
   - Double-check `offsetToPosition` logic after span adjustments to ensure line/column mapping matches editor behavior.

### Deliverables
- Updated `tools/dev/lib/swcAst.js` returning enriched records.
- New helper tests verifying canonical names, scope chains, path signatures, and hashes.

### Validation
- Jest unit tests covering scenarios with nested classes and duplicate function names.
- Manual CLI run `--list-functions` to confirm new metadata appears in JSON output.

#### Status — 2025-11-01
- `collectFunctions` now enriches each entry with `canonicalName`, `scopeChain`, `pathSignature`, and SHA-256 content hashes while preserving span ordering.
- Added traversal support for exported classes and class methods (instance/static/getter) with scoped naming such as `exports.NewsSummary > #render`.
- New fixture `tests/fixtures/tools/js-edit-nested-classes.js` exercises nested class scenarios; updated Jest spec asserts metadata for exports, class methods, and nested helpers.
- CLI `--list-functions` JSON output now surfaces the new metadata fields to unblock later locator work.
- **2025-11-03 Follow-up:** Detected gap for anonymous callbacks (e.g., Jest `test` blocks) which never hit `recordFunction`. Need to augment traversal to assign stable identifiers (via call-site context + path signature) so callback spans appear in listings and can be guarded like named functions.
- **2025-11-04 Follow-up:** Callback records now surface in listings, but replacement attempts still fail because call-context entries are flagged `replaceable: false`. Next increment: introduce a guarded whitelist so recognised call-site callbacks (Jest `describe`/`it`/`test`/hook patterns and similar) are emitted as replaceable, adjust CLI validation to honour the whitelist, and ensure plan emission includes the canonical `call:*` scope chain for replay.

---

## Phase 3 — CLI Surface Expansion (Day 3)
**Objective:** Expose new lookup capabilities and normalization logic in the js-edit CLI.

### Tasks
1. **`--locate` Command**
   - Implement `--locate <selector>` to return matching nodes. Support ASCII and JSON formats.
   - Output fields: `name`, `canonicalName`, `kind`, `scopeChain`, `line`, `column`, `startOffset`, `endOffset`, `pathSignature`, `hash`, `replaceable`.
2. **Qualified Selector Parsing**
   - Allow selectors in forms `name`, `ClassName#method`, `ClassName.method`, and `path:<pathSignature>`.
   - Normalize selectors so `--extract`/`--replace` reuse the same resolution logic.
3. **Ambiguity Controls**
   - Introduce `--require-unique` (default true). When multiple matches exist, abort with clear guidance.
   - Add `--select <index>` and `--select-path <pathSignature>` to override default behavior.
4. **CLI Output Improvements**
   - Enhance ASCII and JSON outputs with clarity for ambiguous cases (e.g., list candidate scopes and line numbers).

### Deliverables
- Updated CLI with new flags and normalized resolution path.
- Documentation snippet in `tools/dev/README.md` covering `--locate` usage.

### Validation
- Integration tests invoking CLI with different selectors (top-level function, class method, duplicate names).
- Manual spot-check to ensure `--locate` respects `--json`/`--quiet` options.

#### Status — 2025-11-03
- Implemented guard plan export (`--emit-plan <file>`) so locate/extract/replace and the context commands emit replayable metadata via stdout and optional plan files.
- Added `--replace-range start:end` for sub-span updates and `--rename <identifier>` for identifier-only edits. Range offsets are validated against the function span and remain mutually exclusive with rename for predictable guardrails.
- Extended Jest integration coverage to exercise plan emission, range replacements, rename flows, and context-plan metadata (`tests/tools/__tests__/js-edit.test.js`).
- Guardrail enforcement shipped during Phase 4 and the documentation refresh landed in Phase 6, so Phase 3 deliverables are complete.
- **2025-11-06:** Expanded the CLI surface for variable bindings. New commands (`--locate-variable`, `--extract-variable`, `--replace-variable`, `--variable-target`) mirror the function workflow, emit guard plans keyed to binding/declarator/declaration spans, and ship with integration coverage plus README/quick-start documentation updates. This unlocks guarded edits for destructured imports, CommonJS assignments, and other declarator-style changes without falling back to manual edits.

---

## Phase 4 — Guardrails & Verification (Day 4)
**Objective:** Strengthen replacement safety by validating spans, hashes, paths, and syntax.

### Tasks
1. **Dual Guard Checks**
   - During replacement, verify the stored hash matches the current source before applying edits (unless `--force` set).
   - After substitution, recompute hash and log changes.
2. **Path Signature Validation**
   - When a `pathSignature` is provided, re-parse the file and ensure the same path still resolves to the target node post-edit.
   - Abort if the path points to a different node.
3. **Dry-Run Diagnostics**
   - Expand dry-run output to include a guardrail summary (`Span OK`, `Hash OK`, `Path OK`, `Syntax OK`).
4. **Error Handling**
   - Provide actionable messages for guardrail failures (e.g., hashed mismatch due to upstream edits).

### Deliverables
- Enhanced replacement flow with additional checks.
- Extended unit tests covering guardrail enforcement and failure paths.

### Validation
- Jest tests mocking drifted files to ensure guardrails stop the operation.
- Manual dry-run verifying guardrail summary appears and matches expectations.

#### Status — 2025-11-02
- Replacement flow now enforces guardrails: hash verification uses `--expect-hash` inputs before mutation, path signatures are revalidated post-edit, and syntax reparse failures abort immediately.
- Introduced `--force` override for intentional guard bypass; guard summaries mark bypassed checks explicitly and preserve the expected hash for auditing.
- ASCII output renders a guardrail table, and JSON payloads embed detailed guard status and hashes for automation. Documentation highlights the guard workflow in both `tools/dev/README.md` and `docs/CLI_REFACTORING_QUICK_START.md`.
- Added optional span expectation guard (`--expect-span start:end`) so replayed plans confirm offsets alongside hashes; guard summaries and plan payloads now capture the expected span, and Jest integration verifies OK/mismatch/bypass flows.
- Next: expand guard summaries for `--allow-multiple` scenarios so batch locate/context operations surface combined span information before edits proceed.
- **2025-11-06:** Variable replacements now ride the same guard stack—hash/path validation occurs against the requested `--variable-target` span, syntax checks re-parse the updated file, and guard summaries output the resolved mode so automation can reason about binding/declarator/declaration edits. Integration tests (`tests/tools/__tests__/js-edit.test.js`) cover locate/extract/replace flows and validate guard behaviour end-to-end.

---

## Phase 5 — Token-Level Mutation Helpers (Day 5)
**Objective:** Support finer-grained edits within located functions.

### Tasks
1. **Sub-span Replacement**
   - Add optional `--replace-range <start:end>` flag to restrict updates to a subset of the located span.
   - Confirm the requested range resides inside the located function; otherwise reject.
2. **Identifier Renaming Helper**
   - Offer `--rename <newName>` which updates the function’s identifier where safe (function declarations, class methods).
   - For function expressions, ensure scope updates are correct or explicitly limit support.
3. **Plan Export**
   - Implement `--emit-plan <file>` to serialize the resolved metadata (name, scope, path, hash, span) so other agents can replay the edit with consistent guardrails.

### Deliverables
- CLI updates supporting sub-span editing and rename helper.
- Tests verifying rename behavior and plan export contents.

### Validation
- Unit tests for rename and sub-span logic (success and failure cases).
- CLI integration test producing a plan file and reusing it in a subsequent run.

#### Status — 2025-11-03
- Sub-span replacement (`--replace-range`) and identifier renaming (`--rename`) are live and covered by integration tests against the expanded fixtures.
- Plan emission now spans locate/extract/replace plus both context commands, producing replayable metadata consumed in tests.
- Follow-up: add aggregated guard summaries when `--allow-multiple` batches edits so operators can review combined spans before applying changes (tracked alongside the guard-summary work in Phase 4).

---

## Phase 6 — Documentation & Examples (Day 6)
**Objective:** Provide operator-facing guidance for new capabilities.

### Tasks
1. **README Updates**
   - Expand `tools/dev/README.md` with command examples (`--locate`, `--select`, `--rename`, `--emit-plan`).
2. **Workflow Recipes**
   - Document end-to-end flows (locate -> dry-run replace -> apply) for class methods and default exports.
3. **Reference Integration**
   - Update `docs/CLI_REFACTORING_QUICK_START.md` (or another existing guide) to reference js-edit workflows and guardrail options.

### Deliverables
- Updated documentation with examples and guardrail explanations.

### Validation
- Internal review to ensure examples run as written.

#### Status — 2025-11-02
- Added developer-facing documentation: `tools/dev/README.md` now outlines selectors, guardrails, and end-to-end usage; `docs/CLI_REFACTORING_QUICK_START.md` includes a dedicated `js-edit` workflow case study.
- Remaining docs work: publish a workflow recipe covering multi-file batches once batch mode lands (future phase).

---

## Phase 7 — Testing & Regression Suite (Day 7)
**Objective:** Expand automated coverage to catch regressions early.

### Tasks
1. **Fixture Expansion**
   - Add new fixture files covering nested classes, static methods, overloaded names, arrow functions inside objects.
2. **Unit Tests**
   - Ensure `collectFunctions` returns expected metadata for all fixture scenarios.
   - Add tests for guardrail enforcement (span/hash/path) and new CLI helpers.
3. **Integration Tests**
   - Use `child_process.execFile` to run CLI commands for locate, rename, replace (dry-run) and assert JSON outputs.

### Deliverables
- Comprehensive Jest suite under `tests/tools/__tests__/`.
- Updated fixtures under `tests/fixtures/tools/`.

### Validation
- `npx jest --runTestsByPath …` focused runs plus `npm run test:file "js-edit"` style command for quick iteration.

#### Status — 2025-11-02
- Added CLI integration coverage in `tests/tools/__tests__/js-edit.test.js`, exercising path mismatch handling, hash guard enforcement via `--expect-hash`, syntax failure handling, and `--force` overrides.
- Future coverage: add scenarios for batch edits once additional fixtures exist.

---

## Phase 8 — Performance Review (Day 8)
**Objective:** Ensure new features remain responsive without caching.

### Tasks
1. **Benchmark Harness**
   - Extend CLI `--benchmark` flag to measure locate/replace latency on sample files (e.g., 200 LOC, 1k LOC, 5k LOC).
   - Record results in `docs/JS_EDIT_ENHANCEMENTS_PLAN.md` or CHANGE_PLAN notes.
2. **Optimization Check**
   - If locate operations exceed 500ms on medium files, inspect hotspots (e.g., redundant string slicing) and optimize.
   - Memoize path signature calculations per traversal when safe, respecting no cross-run caching.

### Deliverables
- Benchmark results and, if necessary, optimization notes.

### Validation
- Manual runs verifying CLI remains responsive.

#### Status — 2025-11-03
- `--benchmark` exists on the CLI, but comparative measurements across the planned file-size tiers have not been recorded yet. Pending action: capture timings for small/medium/large fixtures and document results here and in CHANGE_PLAN notes.
- No optimisation or memoisation work has started because baseline measurements are still outstanding.

---

## Phase 9 — Rollout & Monitoring (Day 9)
**Objective:** Finalize release artifacts and define follow-up work.

### Tasks
1. **Release Checklist**
   - Update CHANGELOG (if applicable), ensure docs reflect final behavior, confirm tests pass.
2. **Feedback Process**
   - Add guidance for reporting issues via project communication channels.
   - Optionally instrument CLI with `--debug` to log resolution details for troubleshooting.
3. **Backlog Seeds**
   - Capture future enhancements (AST query language integration, batch edit scripts) in CHANGE_PLAN or project backlog.

### Deliverables
- Ready-to-ship js-edit with enhanced locate and guardrail features.
- Documented feedback loop and backlog notes.

### Validation
- Final regression test pass and smoke tests on sample repositories.

#### Status — 2025-11-03
- Rollout tasks remain pending: CHANGELOG/docs audit, feedback-channel guidance, and backlog capture will follow once performance data and guard-summary enhancements land.
- Ensure the outstanding `--allow-multiple` guard-summary improvement is documented before closing this phase.

---

## Success Metrics
- **Accuracy:** Zero guardrail bypasses during integration tests; duplicates caught before edits proceed.
- **Usability:** Operators can locate and edit a class method using canonical name + dry-run workflow within two commands.
- **Safety:** Attempted edits on drifted files fail with actionable messages.
- **Performance:** Locate operations complete in <500ms on ~1k LOC files without caching.

## Rollback Strategy
If the enhancements introduce instability:
- Remove or flag new CLI commands (`--locate`, `--rename`) temporarily.
- Retain guardrail helpers but disable strict enforcement via feature flag if necessary.
- Revert documentation updates referencing disabled features.

## Open Questions
- Should we expand beyond functions to cover property assignments or export lists? (Out of scope initially.)
- Do we need cross-file refactoring support? (Future investigation.)
- Is there value in supporting scripted batches (plan replay) more fully? (See backlog in Phase 9.)

---

### Pause Note
The js-edit enhancement roadmap above remains the source of truth for outstanding work. Implementation is paused as of 2025-11-03; revisit Phase 8 benchmarks and Phase 9 rollout tasks once compression utility priorities are addressed.
