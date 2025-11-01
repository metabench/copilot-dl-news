# js-edit Enhancements Implementation Plan

## Purpose
This document captures the detailed execution plan for expanding `tools/dev/js-edit.js` beyond simple function extraction and replacement. The goal is to deliver precise function location, structural guardrails, and safe mutation helpers without relying on cached AST state. Each phase below lists goals, concrete tasks, outputs, validation steps, and ownership notes so agents can execute autonomously while maintaining traceability.

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
