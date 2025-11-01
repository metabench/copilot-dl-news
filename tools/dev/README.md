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

Selectors accept optional disambiguation flags:

- `--select <index>` — choose the nth match in source order (1-based).
- `--select-path <signature>` — require an exact path signature.
- `--allow-multiple` — skip uniqueness enforcement for `--locate` when inspecting batches.

### Guardrail Workflow

### Fine-Grained & Identifier-Only Edits

- `--replace-range start:end` works with `--with <file>` to surgically replace a sub-span of the located function. Offsets are 0-based and relative to the function snippet returned by `--locate`. Guardrails still compare the full function hash before and after.
- `--rename <identifier>` changes the function’s declaration name without providing a replacement file. The target must have a named identifier (e.g., standard function declarations and named default exports). The helper edits only the declaration identifier; internal references remain untouched.
- `--replace-range` and `--rename` are mutually exclusive in a single invocation to keep guardrail math straightforward. If both body edits and renames are needed, perform them in separate passes.

1. **Locate** the target with `--locate <selector> --json` (optionally `--emit-plan plan.json`) to capture canonical path, span, and hash metadata.
2. **Dry-run replace** using `--replace … --expect-hash <hash-from-locate> --json` so the guard confirms the file has not drifted. Add `--emit-diff` for before/after snippets and `--emit-plan` if you want the guard metadata persisted alongside the CLI output.

During replacement the tool:

- Compares the stored content hash to the live source before modifications.
- Re-parses the candidate output and aborts on syntax errors.
- Verifies the path signature still resolves to the same node post-edit.
- Computes the resulting hash so downstream automation can confirm the change.

Use `--force` sparingly to bypass hash/path checks when intentional drift is acceptable; combine it with `--expect-hash` so the guard summary records exactly which expectation was skipped.

### Guard Plans for Replayable Edits

- Pass `--emit-plan <file>` to any `--locate`, `--extract`, or `--replace` command to write a JSON payload containing the selector you resolved plus guard metadata (`expectedHash`, `pathSignature`, `span`, `file`).
- The same data appears inside the CLI’s `--json` output under `plan`, enabling automation to either capture stdout or use the written file.
- Plan files make it easy to hand guardrails to other agents or future runs: rerun the locate step later and compare the stored hash/path to detect drift before attempting mutations.

### Example Session

```powershell
# Inspect functions with metadata
node tools/dev/js-edit.js --file src/example.js --list-functions --json

# Locate a class method with rich selectors
node tools/dev/js-edit.js --file src/example.js --locate "exports.Widget > #render"

# Dry-run a replacement with guard hash and inspect guardrails + diff
node tools/dev/js-edit.js --file src/example.js --replace "exports.Widget > #render" --with tmp/render.js --expect-hash <hash-from-locate> --emit-diff --json

# Apply after reviewing guard summary
node tools/dev/js-edit.js --file src/example.js --replace "exports.Widget > #render" --with tmp/render.js --expect-hash <hash-from-locate> --emit-diff --fix
```

Additional examples and guardrail details live in `docs/CLI_REFACTORING_QUICK_START.md`.
