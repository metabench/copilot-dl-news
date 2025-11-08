# Developer Tooling Playground

This directory hosts experimental-but-safe developer CLIs that follow the shared `CliArgumentParser`/`CliFormatter` conventions and default to dry-run behavior. Each tool should:

- Parse arguments with `CliArgumentParser` and support `--help`/`--json`/`--quiet` patterns when relevant.
- Emit consistent output via `CliFormatter` (headers, sections, tables, stats).
- Guard writes behind explicit flags such as `--fix`, surface diff previews before mutating files, and re-parse updated source to block syntax errors before they ever hit disk.
- Include focused tests/fixtures when behavior grows beyond simple inspection utilities.

Tools promoted out of prototype stage can move into `tools/` once they stabilize.

---

## `js-scan` — Multi-file JavaScript Discovery

`js-scan` complements `js-edit` by scanning entire directories, collecting function metadata with js-edit compatible hashes, and emitting dense search output for reconnaissance.

- `node tools/dev/js-scan.js --dir src --search planner telemetry` — multi-term search with star-ranked results, optional guidance, and JSON output.
- `node tools/dev/js-scan.js --dir src --search planner --lang zh --view summary` — render bilingual stats (`搜果`, `匹数`, `档总`) while keeping terse English guidance for mixed-language operators.
- `node tools/dev/js-scan.js --dir src --find-hash 6Z4U7cYZ` — resolve a js-edit hash across the workspace, detecting collisions.
- `node tools/dev/js-scan.js --dir src --build-index --limit 15` — summarize module stats (exports, functions, entry points) for the top files.
- `node tools/dev/js-scan.js --dir src --find-pattern "*Adapter" --exported --limit 30 --json` — glob/regex pattern discovery with export filters and machine-readable payloads.
- `node tools/dev/js-scan.js --dir deprecated-ui-root --deprecated-only --search carousel` — target deprecated bundles explicitly; deprecated directories stay excluded unless `--include-deprecated` or `--deprecated-only` is provided.
- `node tools/dev/js-scan.js --搜 planner --视 简` — lean on the Chinese aliases directly; the CLI auto-detects glyphs like `--搜`, `--视`, and `简`, switches into compact Chinese mode, and keeps guidance terse without needing `--lang zh`.
- `node tools/dev/js-scan.js --help --lang zh` — render the ultra-terse Chinese help grid (two-character tiles plus alias hints); combine with `--含径`, `--限`, or other Chinese aliases to surface targeted detail rows.
- `node tools/dev/js-scan.js --dir src/crawler --follow-deps --view terse --fields location,name,hash --搜 telemetry` — follow relative dependencies (use `--依` for Chinese alias) so helper modules outside the initial directory join the terse bilingual listings.
- `node tools/dev/js-scan.js --dir src --search planner --view terse --fields location,name,hash` — stream ultra-compact match lines (perfect for agents capturing hashes/paths); tweak `--fields` to control which columns appear in the terse view.
- `node tools/dev/js-scan.js --dir src --search planner --view summary` — collapse output to headline stats (match counts, limits, exported/async ratios) when you only need directional signal.

Use `--async`, `--generator`, `--kind`, `--include-path`, and `--exclude-path` to refine search results. Text output respects `--max-lines`, `--no-snippets`, and `--hashes-only` for concise listings, while JSON payloads include guidance hints when result sets overflow.

## `js-edit` — Guarded JavaScript Function Surgery

`js-edit` is the flagship AST-aware utility in this workspace. It uses SWC to parse files on demand (no cached ASTs) and provides selectors, guardrails, and dry-run defaults tailored for refactor automation.

**Bilingual shortcuts**
- `node tools/dev/js-edit.js --文 src/example.js --函列 --紧凑` — auto-detect Chinese aliases for file and list functions; output switches to terse Chinese headers without an explicit `--lang zh`.
- `node tools/dev/js-edit.js --助 --语 zh` — render the Chinese help grid (alias table plus examples) and keep alias hints visible even when relying exclusively on glyph-based flags.

### Internal Architecture

The js-edit CLI is modularized into three focused operation modules (November 2025):

- **`operations/discovery.js`** — Symbol inventory and pattern matching (`--list-functions`, `--list-variables`, `--list-constructors`, `--search-text`, `--snipe`, `--outline`). Handles `--match`/`--exclude` filtering, position-based lookups, and search result formatting.
- **`operations/context.js`** — Context retrieval and guard operations (`--context-function`, `--context-variable`, `--preview`). Manages padding, enclosing context modes, plan emission for context workflows, and guard summary rendering.
- **`operations/mutation.js`** — Locate, extract, and replace workflows with guardrail enforcement (`--locate`, `--extract`, `--replace`, `--replace-variable`). Handles hash/span verification, syntax validation, unified diff generation, and dry-run vs. fix execution.
- **`shared/`** — Common utilities and formatting constants (hash encoding, selector parsing, output formatting).

All operations use dependency injection initialized via `cli.js`, ensuring consistent access to the SWC parser, formatter utilities, and shared constants. The modular design enables focused testing and maintainability while preserving backward compatibility for all command-line interfaces.

### Core Commands

- `--replace <selector> --rename <identifier>` — rename the located function without providing an external snippet (identifier must exist on the target).
- `--replace <selector> --with <file> --replace-range start:end` — swap only the specified character range (0-based, end-exclusive) within the located function using the supplied snippet. Prefer `--with-file <relativePath>` when the replacement snippet lives alongside the target file; js-edit resolves the path relative to the target file’s directory.
- `--locate-variable <selector>` / `--extract-variable <selector>` / `--replace-variable <selector> --with <file>` — perform the same guarded locate/extract/replace workflow for variable bindings (including destructured declarators and CommonJS assignments). Combine with `--variable-target <binding|declarator|declaration>` to choose which span/hash/path guardrails to emit. Variable replacements require `--with <file>` and honour `--expect-hash` the same way function replacements do.

Locate/context tables and JSON payloads report both UTF-16 code-unit offsets and raw byte offsets. Each entry includes `charSpanRange` and `byteSpanRange` summaries so agents can reason about guardrails even when newline normalization or multi-byte glyphs change the byte footprint.

### Discovery Filters & Pattern Matching

- `--match <pattern>` / `--exclude <pattern>` filter discovery commands (`--list-functions`, `--list-variables`, `--list-constructors`) using glob patterns. Patterns support `*` (any chars), `?` (single char), and `**` (directory separator). Examples:
  - `--match "exports.*"` — show only exported symbols
  - `--match "*Widget*"` — match any name containing "Widget"
  - `--exclude "_*"` — hide names starting with underscore
  - Combine both: `--match "exports.*" --exclude "*internal*"`
- `--snipe <position>` quickly locates the nearest symbol at a specific position. Accepts line:column (e.g., `12:5`) or byte offset (e.g., `@450`). Returns minimal output with symbol type, name, kind, location, and guard hash. Useful for editor integrations or jumping to code at cursor position.
- `--outline` displays only top-level symbols (functions/variables not nested inside classes or other functions). Output shows compact table with type, name, kind, location, and byte size. Perfect for getting a high-level overview of a module's public API surface.

### Lightweight Discovery Helpers

- `--list-constructors --filter-text <substring>` inventories class constructors with export kind, `extends`/`implements` clauses, parameter summaries, and guard hashes; add `--include-paths` to surface path signatures alongside the table/JSON output. Supports `--match` and `--exclude` filters like other discovery commands, plus `--include-internals` to show non-exported classes without heritage or external references.
- `--preview <selector>` / `--preview-variable <selector>` return concise snippets (default 240 chars) for functions or variables along with the same guard metadata you would capture from `--locate`. Adjust the window with `--preview-chars <n>` when you need a little more context without invoking the full context machinery.
- `--search-text <substring>` scans the file for plain-text matches, reporting each hit with line/column, a highlighted context window (default ±60 chars), and the guard hashes/path signatures of any enclosing function or variable. Use `--search-limit <n>` and `--search-context <n>` to tune result volume and surrounding context. JSON payloads now include ready-to-run follow-up commands (`--locate`/`--locate-variable` with `--select hash:<value>`) so you can jump straight from a text match into a guarded locate phase.
- All discovery commands honour `--json`, `--emit-plan`, and existing guardrail conventions so a quick preview or search can feed directly into downstream automation without a second locate pass.

Selectors accept optional disambiguation flags:

- `--select <index>` — choose the nth match in source order (1-based).
- `--select hash:<value>` — resolve the selector by guard hash (combine with canonical names so ambiguous callbacks/class methods jump straight to a recorded digest).
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
- `--preview-edit` generates a unified diff preview before applying replacements. Shows before/after changes in standard diff format with context lines (default 3 lines before/after). Helps review changes before running `--fix`. Combine with `--emit-diff` to include the diff in JSON output.
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

# Filter discovery with glob patterns
node tools/dev/js-edit.js --file src/example.js --list-functions --match "exports.*" --exclude "*internal*"

# Get high-level module overview
node tools/dev/js-edit.js --file src/example.js --outline

# Find symbol at specific position (line:col or byte offset)
node tools/dev/js-edit.js --file src/example.js --snipe 42:10
node tools/dev/js-edit.js --file src/example.js --snipe @1250

# List constructors with filtering
node tools/dev/js-edit.js --file src/example.js --list-constructors --match "*Widget*" --list-output verbose
node tools/dev/js-edit.js --file src/example.js --list-constructors --include-internals --json

# Locate a class method with rich selectors and emit guard plan
node tools/dev/js-edit.js --file src/example.js --locate "exports.Widget > #render" --emit-plan tmp/locate-plan.json

# Get context with plan emission for batch editing workflows
node tools/dev/js-edit.js --file src/example.js --context-function "exports.Widget > #render" --allow-multiple --emit-plan tmp/context-plan.json --json

# Review context plan structure for multi-match scenarios
# Plan includes: summary.matchCount, summary.spanRange, entity, padding, enclosingMode
node tools/dev/js-edit.js --file src/example.js --context-function "*Widget*" --allow-multiple --emit-plan tmp/batch-plan.json

# Dry-run a replacement with unified diff preview
node tools/dev/js-edit.js --file src/example.js --replace "exports.Widget > #render" --with tmp/render.js --expect-hash <hash-from-locate> --preview-edit --json

# Dry-run with guard hash/span and inspect guardrails + diff
node tools/dev/js-edit.js --file src/example.js --replace "exports.Widget > #render" --with tmp/render.js --expect-hash <hash-from-locate> --expect-span <start:end-from-locate> --emit-diff --json

# Apply after reviewing guard summary
node tools/dev/js-edit.js --file src/example.js --replace "exports.Widget > #render" --with tmp/render.js --expect-hash <hash-from-locate> --expect-span <start:end-from-locate> --emit-diff --fix

# Guarded variable replacement using declarator spans
node tools/dev/js-edit.js --file src/example.js --locate-variable "exports.settings" --variable-target declarator --json
node tools/dev/js-edit.js --file src/example.js --replace-variable "exports.settings" --with tmp/settings.snippet.js --expect-hash <hash-from-locate> --variable-target declarator --emit-diff --fix
```

### Hash-Driven Selection & Relative Snippets

```powershell
# Capture guard hashes once, re-use them later (table output includes the digest too)
node tools/dev/js-edit.js --file src/example.js --list-functions --json > tmp/functions.json

# Jump straight to a recorded digest without retyping long selectors
node tools/dev/js-edit.js --file src/example.js --locate "exports.Widget > #render" --select hash:TsFu9ZSc --json

# Pivot from a text search into guarded commands via the suggestions payload
node tools/dev/js-edit.js --file src/example.js --search-text "dispatchAction" --json > tmp/search.json
# Each match contains suggestions[], e.g. "js-edit --file \"src/example.js\" --locate \"exports.Widget > #render\" --select hash:TsFu9ZSc"

# Apply an update using a snippet stored next to the target file
$tempDir = New-Item -ItemType Directory -Path (Join-Path $env:TEMP 'js-edit-demo')
$tempFile = Copy-Item src/example.js (Join-Path $tempDir.FullName 'example.js') -PassThru
Set-Content (Join-Path $tempDir.FullName 'render.patch.js') "export function render()\n{\n  return dispatchAction();\n}\n"
node tools/dev/js-edit.js --file $tempFile.FullName --replace exports.render --with-file render.patch.js --expect-hash TsFu9ZSc --emit-diff --json --fix
Remove-Item $tempDir.FullName -Recurse -Force
```

## `tmp-prune` — Scratch Directory Pruning

`tmp-prune` keeps the scratch directory manageable by retaining only the newest entries (default: ten per folder) while respecting sticky sentinels like `.gitkeep`. The CLI defaults to dry-run previews; supply `--fix` when you are ready to delete.

- `node tools/dev/tmp-prune.js` — preview deletions under `./tmp`, summarising which folders would lose older artifacts.
- `node tools/dev/tmp-prune.js --keep 5 --fix` — remove everything beyond the five most recent entries in every directory.
- `node tools/dev/tmp-prune.js --root tmp/js-edit --json` — emit a JSON summary for automation without touching the filesystem.
- `npm run tmp:prune` — run the dry-run preview via the package script for quick housekeeping.

The tool walks each directory breadth-first, skips `.gitkeep`, and reports any Windows locking errors so you can rerun once handles release.

## `md-scan` — Markdown Discovery

- `node tools/dev/md-scan.js --径 docs --搜 planner telemetry` — Chinese aliases (`--径`, `--搜`) auto-enable succinct Chinese summaries without explicitly setting `--lang zh`.
- `node tools/dev/md-scan.js --dir docs --search planner --lang zh` — bilingual search headers (`搜果`, `匹数`, `节`) plus compact section listings with Chinese labels.
- `node tools/dev/md-scan.js --助 --语 zh` — display the bilingual help table (English flags plus two-character aliases) to cross-reference `--链图`, `--优专`, and other terse flags.

## `md-edit` — Markdown Refactoring

- `node tools/dev/md-edit.js docs/AGENTS.md --节列 --紧凑` — use glyph-based flags to list sections with compact bilingual headings; the CLI stays in dry-run mode until `--改` (`--fix`) is supplied.
- `node tools/dev/md-edit.js docs/AGENTS.md --节列 --lang zh` — section inventories, stats, and search output now translate headings and summaries (`节`, `段`, `匹数`) while preserving JSON structures.
- `node tools/dev/md-edit.js --助 --语 zh` — render the Chinese alias grid highlighting `--搜题`, `--显节`, and `--替节` so Markdown plan/replacement workflows line up with the js-edit conventions.

Additional examples and guardrail details live in `docs/CLI_REFACTORING_QUICK_START.md`.
