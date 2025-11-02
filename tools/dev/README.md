# Developer Tooling Playground

This directory hosts experimental-but-safe developer CLIs that follow the shared `CliArgumentParser`/`CliFormatter` conventions and default to dry-run behavior. Each tool should:

- Parse arguments with `CliArgumentParser` and support `--help`/`--json`/`--quiet` patterns when relevant.
- Emit consistent output via `CliFormatter` (headers, sections, tables, stats).
- Guard writes behind explicit flags such as `--fix`, surface diff previews before mutating files, and re-parse updated source to block syntax errors before they ever hit disk.
- Include focused tests/fixtures when behavior grows beyond simple inspection utilities.

Tools promoted out of prototype stage can move into `tools/` once they stabilize.

---

## `js-edit` — Guarded JavaScript Function Surgery

`js-edit` is the flagship AST-aware utility in this workspace. It uses SWC to parse files on demand (no cached ASTs) and provides selectors, guardrails, and dry-run defaults tailored for refactor automation.

### Core Commands

- `--replace <selector> --rename <identifier>` — rename the located function without providing an external snippet (identifier must exist on the target).
- `--replace <selector> --with <file> --replace-range start:end` — swap only the specified character range (0-based, end-exclusive) within the located function using the supplied snippet.
- `--locate-variable <selector>` / `--extract-variable <selector>` / `--replace-variable <selector> --with <file>` — perform the same guarded locate/extract/replace workflow for variable bindings (including destructured declarators and CommonJS assignments). Combine with `--variable-target <binding|declarator|declaration>` to choose which span/hash/path guardrails to emit. Variable replacements require `--with <file>` and honour `--expect-hash` the same way function replacements do.

Locate/context tables and JSON payloads report both UTF-16 code-unit offsets and raw byte offsets. Each entry includes `charSpanRange` and `byteSpanRange` summaries so agents can reason about guardrails even when newline normalization or multi-byte glyphs change the byte footprint.

### Lightweight Discovery Helpers

- `--preview <selector>` / `--preview-variable <selector>` return concise snippets (default 240 chars) for functions or variables along with the same guard metadata you would capture from `--locate`. Adjust the window with `--preview-chars <n>` when you need a little more context without invoking the full context machinery.
- `--search-text <substring>` scans the file for plain-text matches, reporting each hit with line/column, a highlighted context window (default ±60 chars), and the guard hashes/path signatures of any enclosing function or variable. Use `--search-limit <n>` and `--search-context <n>` to tune result volume and surrounding context.
- All discovery commands honour `--json`, `--emit-plan`, and existing guardrail conventions so a quick preview or search can feed directly into downstream automation without a second locate pass.

Selectors accept optional disambiguation flags:

- `--select <index>` — choose the nth match in source order (1-based).
- `--select-path <signature>` — require an exact path signature.
- `--allow-multiple` — skip uniqueness enforcement for `--locate` when inspecting batches.

### Selector Coverage

- Canonical names cover both ESM (`export function alpha`) and CommonJS layouts such as `module.exports = function legacyEntry()` or `exports.worker = () => {}`.
- The CLI accepts selectors like `module.exports`, `module.exports.handler`, and `exports.utility`, and it resolves aliases (`hash:` / `path:`) for each record.
- CommonJS assignments populate scope chains so mixed modules (ESM + require) expose consistent selectors and context retrieval works without additional flags.
- `--list-variables` inventories CommonJS bindings as well, so exports like `module.exports = { ... }` or `exports.value = 42` appear alongside local declarations with hashes, scope chains, and initializer types.
- Variable selectors accept alias prefixes just like functions: `hash:<digest>` and `path:<signature>` bind directly to guard metadata, and destructured declarators expose canonical selectors for each binding inside the pattern.
- Recognised call-site callbacks (e.g., `describe`, `it`, `test`, `beforeEach`, `afterAll`) are emitted with canonical `call:*` selectors. These callbacks are now replaceable, so Jest/Mocha-style hooks can be patched safely through the same guardrail workflow as declarations.

### Variable Workflows

- Use `--locate-variable <selector> --json` to capture declarator/declaration metadata (hash/span/path) for bindings, destructured imports, and CommonJS assignments. The output reflects the requested `--variable-target` mode so you can guard the exact span you plan to edit.
- `--extract-variable <selector>` mirrors the function extractor and honours `--output`, `--emit-plan`, and context padding flags. Default mode (`declarator`) captures the full declarator (e.g., `{ ren, stimpy: renAlias } = cartoon;`), while `binding` limits the span to the specific identifier and `declaration` widens to the surrounding statement.
- `--replace-variable <selector> --with <file> --expect-hash <hash>` performs guarded substitutions on the chosen span. After applying the snippet (dry-run by default), js-edit re-parses the file, re-resolves the requested target, and verifies the hash/path guardrails just like function replacements. Hash mismatches, missing paths, or syntax errors abort unless `--force` is explicitly supplied.
- Variable plans created via `--emit-plan` include the resolved target mode, hash, span, and path so downstream automation can replay guardrails without recomputing metadata.

### Context Retrieval

- `--context-function <selector>` and `--context-variable <selector>` return padded source excerpts with hash metadata so you can review surrounding code before editing.
- `--context-before <n>` and `--context-after <n>` override the default ±512 character padding; values are clamped at file boundaries and handle multi-byte characters safely.
- `--context-enclosing <mode>` widens the snippet to structural parents: `exact` (default) limits to the record span, `class` wraps the nearest class, and the new `function` mode wraps the closest containing function or class method. When expanded, JSON output includes `selectedEnclosingContext` plus the full `enclosingContexts` stack for downstream tooling.
- Context JSON payloads surface both the base snippet hash and expanded context hash, enabling guardrails to confirm the review window matches expectations before applying changes.
- **Context operations support plan emission**: Use `--emit-plan <file>` with `--context-function` or `--context-variable` to capture guard metadata alongside context data. Plans include enhanced summary metadata (`matchCount`, `allowMultiple`, `spanRange`) plus context-specific details (`entity`, `padding`, `enclosingMode`) for batch editing workflows.

### Guardrail Workflow

- `--expect-hash <hash>` replays the content digest captured during `--locate`/`--emit-plan`; the CLI refuses to proceed if the live source hash differs (unless `--force` is set, in which case the guard marks the hash check as bypassed).
- `--expect-span start:end` optionally replays the byte offsets (0-based, end-exclusive) recorded earlier. When present, the guard verifies the located span still matches those offsets and records the expectation in both the summary table and JSON payloads.
- Guard summaries (ASCII + JSON) include span/hash/path/syntax/result checks so downstream automation can confirm each guard outcome before invoking `--fix`.
- Guard outputs display dual span metrics: character-based (UTF-16) offsets for selector ergonomics and byte offsets for hash/snippet replay. JSON payloads surface both representations, and plan summaries expose `charSpanRange` alongside `byteSpanRange` so newline conversions are always auditable.

### Fine-Grained & Identifier-Only Edits

- `--replace-range start:end` works with `--with <file>` to surgically replace a sub-span of the located function. Offsets are 0-based and relative to the function snippet returned by `--locate`. Guardrails still compare the full function hash before and after.
- `--rename <identifier>` changes the function’s declaration name without providing a replacement file. The target must have a named identifier (e.g., standard function declarations and named default exports). The helper edits only the declaration identifier; internal references remain untouched.
- `--replace-range` and `--rename` are mutually exclusive in a single invocation to keep guardrail math straightforward. If both body edits and renames are needed, perform them in separate passes.

1. **Locate** the target with `--locate <selector> --json` (optionally `--emit-plan plan.json`) to capture canonical path, span, and hash metadata.
2. **Dry-run replace** using `--replace … --expect-hash <hash-from-locate> [--expect-span start:end] --json` so the guard confirms the file has not drifted and the span still matches. Add `--emit-diff` for before/after snippets and `--emit-plan` if you want the guard metadata persisted alongside the CLI output.

During replacement the tool:

- Compares the stored content hash to the live source before modifications.
- Confirms the located span matches the expected offsets when `--expect-span` is provided.
- Re-parses the candidate output and aborts on syntax errors.
- Verifies the path signature still resolves to the same node post-edit.
- Computes the resulting hash so downstream automation can confirm the change.

Use `--force` sparingly to bypass hash/path checks when intentional drift is acceptable; combine it with `--expect-hash`/`--expect-span` so the guard summary records exactly which expectation was skipped.

### Guard Plans for Replayable Edits

- Pass `--emit-plan <file>` to any `--locate`, `--extract`, `--replace`, `--context-function`, or `--context-variable` command to write a JSON payload containing the selector you resolved plus guard metadata (`expectedHash`, `expectedSpan`, `pathSignature`, `span`, `file`).
- Context operations produce enhanced plan payloads with summary metadata (`matchCount`, `allowMultiple`, `spanRange`) and context-specific details (`entity`, `padding`, `enclosingMode`) to support batch editing workflows.
- The same data appears inside the CLI's `--json` output under `plan`, enabling automation to either capture stdout or use the written file.
- Plan files make it easy to hand guardrails to other agents or future runs: rerun the locate step later and compare the stored hash/path to detect drift before attempting mutations. Plans now include both `charSpanRange` and `byteSpanRange` aggregates so downstream tooling can reconcile any byte deltas introduced by newline normalization or multi-byte characters.
- Hashes in the CLI output are base64 digests truncated to eight characters by default. Toggle the encoding/length constants in `tools/dev/lib/swcAst.js` if a hex (base16) fallback is needed for downstream workflows.

### Example Session

```powershell
# Inspect functions with metadata
node tools/dev/js-edit.js --file src/example.js --list-functions --json

# Locate a class method with rich selectors and emit guard plan
node tools/dev/js-edit.js --file src/example.js --locate "exports.Widget > #render" --emit-plan tmp/locate-plan.json

# Get context with plan emission for batch editing workflows
node tools/dev/js-edit.js --file src/example.js --context-function "exports.Widget > #render" --allow-multiple --emit-plan tmp/context-plan.json --json

# Review context plan structure for multi-match scenarios
# Plan includes: summary.matchCount, summary.spanRange, entity, padding, enclosingMode
node tools/dev/js-edit.js --file src/example.js --context-function "*Widget*" --allow-multiple --emit-plan tmp/batch-plan.json

# Dry-run a replacement with guard hash/span and inspect guardrails + diff
node tools/dev/js-edit.js --file src/example.js --replace "exports.Widget > #render" --with tmp/render.js --expect-hash <hash-from-locate> --expect-span <start:end-from-locate> --emit-diff --json

# Apply after reviewing guard summary
node tools/dev/js-edit.js --file src/example.js --replace "exports.Widget > #render" --with tmp/render.js --expect-hash <hash-from-locate> --expect-span <start:end-from-locate> --emit-diff --fix

# Guarded variable replacement using declarator spans
node tools/dev/js-edit.js --file src/example.js --locate-variable "exports.settings" --variable-target declarator --json
node tools/dev/js-edit.js --file src/example.js --replace-variable "exports.settings" --with tmp/settings.snippet.js --expect-hash <hash-from-locate> --variable-target declarator --emit-diff --fix
```

Additional examples and guardrail details live in `docs/CLI_REFACTORING_QUICK_START.md`.
