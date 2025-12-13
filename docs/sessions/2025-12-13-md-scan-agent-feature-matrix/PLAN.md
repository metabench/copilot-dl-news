# Plan – md-scan agent feature matrix + md-edit multi-file operations

## Objective
Design improvements to md-scan/md-edit for scanning agent capabilities and applying the same content across many agent files safely.

## Done When
- [ ] `md-scan` has a design for an **agent capability matrix** (frontmatter-aware) with filters + JSON output.
- [ ] `md-edit` has a design for **multi-file operations** (insert/replace sections/snippets across many files) with strong guardrails.
- [ ] A proposed “batch workflow” CLI (either extend md-edit or a thin wrapper tool) is specified, including dry-run UX and per-file diff reporting.
- [ ] Risks (idempotency, drift, missing frontmatter) and mitigation/guard strategies are explicit.
- [ ] Validation plan + minimal test plan is documented (even if not implemented yet).

## Change Set (initial sketch)
- Design-only in this session (no tool implementation unless separately approved):
	- `tools/dev/md-scan.js` (proposed changes)
	- `tools/dev/md-edit.js` (proposed changes)
	- Optional: new wrapper CLI `tools/dev/agent-matrix.js` or `tools/dev/agent-batch.js` (proposal)
	- Relevant docs: `tools/dev/README.md` (proposal update)

## Scope (what “agent capabilities” means)
- Primary source of truth: agent YAML frontmatter in `.github/agents/*.agent.md`.
- Extract:
	- `description`
	- `tools` list
	- optional structured metadata (future): `tags`, `domains`, `capabilities`.
- Derive:
	- convenience booleans (e.g., `supportsDocsMemory`, `supportsRunTests`, `supportsRunTasks`, `supportsSubagents`)
	- warnings (missing/invalid frontmatter, code-fence wrapper issues)

## Proposed CLI Designs

### A) Extend `md-scan` with frontmatter-aware modes
- `node tools/dev/md-scan.js --dir .github/agents --agents --json`
	- Reads YAML frontmatter when present.
	- Emits `agents[]` records with normalized tool names + derived features.
- Filters:
	- `--has-tool <tool>` / `--missing-tool <tool>`
	- `--has-feature <feature>` / `--missing-feature <feature>` (features are derived)
	- `--frontmatter required|optional` (default: optional)

### B) Add a dedicated “agent matrix” tool (thin wrapper)
- `node tools/dev/agent-matrix.js --dir .github/agents --json`
	- Focused on agent frontmatter + derived capabilities.
	- Outputs a matrix table and JSON manifest.
	- Internally can reuse the md-edit/md-scan libraries.

### C) Extend `md-edit` for multi-file operations
- `node tools/dev/md-edit.js --files ".github/agents/*.agent.md" --replace-section "Memory System Contract" --with tmp/contract.md --dry-run --json`
- `--insert-after <heading>` / `--insert-before <heading>`
- `--ensure-present` idempotency mode (no-op if exact snippet already exists).

### D) New “batch rollout” CLI for common workflows
- `node tools/dev/agent-batch.js --targets agents --filter hasTool:docs-memory/* --apply snippet:memory-contract.md --dry-run --json`
	- Designed for the specific multi-agent rollout use case.
	- Shows per-file diff previews and a summary table.

## Guardrails (non-negotiable)
- Default **dry-run**; require `--fix` to write.
- Emit per-file diffs and a machine-readable manifest:
	- `filesTouched[]`, `filesSkipped[]` (with reasons), `warnings[]`, `errors[]`.
- Guard hashes:
	- For multi-file replace operations, store per-file `expectedHash` of the target section (or whole file) in emitted plan JSON.
- Parsing safety:
	- re-parse edited markdown to ensure valid frontmatter + stable headings.

## Risks & Mitigations
- Missing frontmatter (or wrapped in code fences) → detect, warn, optionally auto-fix via explicit subcommand.
- Multiple matching headings across a file → require `--selector` disambiguation or refuse by default.
- Drift/idempotency (duplicate insertion) → `--ensure-present` + exact-match normalization strategy.
- Emoji/Unicode filenames → avoid PowerShell rename/edit footguns; rely on Node fs APIs.

## Tests / Validation
- Add a small fixture set under `tests/tools/fixtures/agents/` with:
	- valid frontmatter
	- missing frontmatter
	- wrapped frontmatter (```chatagent …)
	- duplicated headings
- Jest tests:
	- agent matrix extraction correctness
	- multi-file dry-run manifest correctness
	- idempotent insertion
	- guard-hash mismatch abort behavior

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- _Describe tests to run or evidence required before completion._
