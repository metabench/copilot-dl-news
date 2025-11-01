# CHANGE_PLAN.md — AST Editing Tool Investigation

## Goal
- Assess and, if feasible, prototype a repository-friendly code transformation CLI that can safely extract and replace JavaScript functions in very large files without manual `apply_patch` edits.
- Determine whether adopting a high-performance parser (possibly via a native Node.js add-on) measurably improves turnaround time and correctness for bulk refactors.

## Current Behavior
- Contributors rely on editor tooling or `apply_patch` for code edits; no repo-provided automation exists for syntax-aware transformations.
- Existing CLI helpers (e.g., `tools/*`) focus on data operations and reporting, not AST manipulation.
- There is no dependency on Babel/Recast/Tree-sitter today; the toolchain avoids native build requirements beyond better-sqlite3.

## Proposed Changes (SWC Track)
1. **Add SWC Dependency** — Introduce `@swc/core` to the workspace (document installation caveats for Windows/PowerShell) and capture any package-lock churn.
2. **Bootstrap `tools/dev/` Workspace** — Create `tools/dev/` for experimental-yet-safe developer CLIs that still follow the shared parser/formatter conventions; add README stub.
3. **Design `js-edit` CLI Skeleton** — Draft `tools/dev/js-edit.js` using `CliArgumentParser`/`CliFormatter`, enforcing dry-run by default and supporting basic commands (`--list-functions`, `--extract <name>`, `--replace <name> --with <file>`).
4. **Implement SWC AST Helpers** — Build a small helper module (e.g., `tools/dev/lib/swcAst.js`) that wraps `@swc/core` parse/print APIs, preserving formatting via SWC’s code generator and ensuring comments survive round-trips.
5. **Validation Harness** — Add focused tests/fixtures under `tests/tools/__tests__/` to verify extraction/replacement on representative large-file samples and ensure dry-run leaves files unchanged.
6. **Performance Benchmarks** — Measure SWC parse + transform time on a large file (>1k LOC) using CLI `--benchmark` flag; record results in docs for future comparison.
7. **Operator UX & Safety** — Provide diff preview (`--emit-diff`) support and clear messaging about dry-run vs. `--fix`; document fallback guidance if SWC compilation fails on a machine.
8. **Context Retrieval Workflow** — Introduce commands that surface surrounding source for functions/variables with configurable padding so agents can inspect targets without leaving the CLI.

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
