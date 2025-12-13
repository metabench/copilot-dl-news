# Working Notes – md-scan agent feature matrix + md-edit multi-file operations

- 2025-12-13 — Session created via CLI. Add incremental notes here.

## Discovery hook results (repo facts)

### Existing prior art (docs)
- `docs/agi/TOOLS.md` already positions `md-scan` as a Tier-1 discovery tool alongside `js-scan`.
- `docs/agi/LESSONS.md` explicitly calls out “roll memory-first + error-reporting contract into key agent persona files” and mentions the frontmatter gap.
- `docs/sessions/2025-12-12-fix-agi-orchestrator-agent/` documents real-world pitfalls:
  - agent YAML frontmatter is a dependency for automation
  - PowerShell redirect can produce UTF-16LE output files (surprising JSON consumers)
- `docs/sessions/2025-11-16-typescript-support-copy-functions/BATCH_IMPROVEMENTS.md` contains a mature “batch plan + dry-run + apply” model for tooling.

### What’s missing (inference)
- There’s no purpose-built “agent capability matrix” output that:
  - treats `.github/agents/*.agent.md` as structured data
  - supports filtering (has/missing tools)
  - emits a machine-readable manifest for rollouts
- There’s no safe multi-file Markdown edit workflow with idempotency + per-file guardrails comparable to `js-edit`.

## Design options (diverge → converge)

| Option | Impact | Effort | Risk | Domains |
| --- | --- | --- | --- | --- |
| A. Extend `md-scan` with `--agents` mode | One command inventories agent tools/features; enables rollouts | M | Medium: scope creep into “md parser + frontmatter” | Tooling |
| B. New `agent-matrix` CLI (thin wrapper) | Fast path to capability matrix without disrupting md-scan | S-M | Low: isolated surface; can reuse libs | Tooling |
| C. Extend `md-edit` with `--files` multi-edit + section ops | Unlocks safe bulk edits with dry-run + manifest | M-L | Medium: markdown edge cases, idempotency | Tooling |
| D. New `agent-batch` rollout CLI (scan+filter+apply) | End-to-end “roll out contract” workflow | M | Medium: duplicates md-edit/md-scan features | Tooling / Ops |

### Recommendation (ranked)
1) **B + C**: ship `agent-matrix` first (unblocks visibility), then add multi-file ops to `md-edit`.
2) If you want fewer binaries: **A + C** (keep everything in md-scan/md-edit).
3) If you want “one-button rollouts”: add **D** after B/C stabilize.

## Proposed data model (agent matrix JSON)

Each record should include both raw + derived fields so downstream automation doesn’t re-parse:
- `file`: repo-relative path
- `frontmatter`: `{ present, valid, description, tools: string[] }`
- `derived`: `{ supportsDocsMemory: boolean, supportsJsEdit: boolean, supportsMdScan: boolean, supportsSubagent: boolean }`
- `warnings`: string[] (missing frontmatter, wrapped frontmatter, duplicate headings)

Top-level manifest:
- `summary`: counts (files scanned, valid frontmatter, missing frontmatter, tool coverage histogram)
- `agents`: AgentRecord[]

## Proposed multi-file edit semantics (md-edit)

Core operations (all dry-run by default):
- Replace section by heading: `--replace-section "<Heading>" --with <snippet.md>`
- Insert snippet relative to heading: `--insert-after "<Heading>" --with <snippet.md>`
- Ensure snippet present (idempotent): `--ensure-present` (skip when exact normalized snippet exists)

Guardrails:
- Emit per-file diff previews and a JSON manifest of actions (changed/skipped/errors).
- Optional `--emit-plan <file>` storing per-file `expectedHash` for the targeted span.

## Risks / unknowns

- Markdown variability: headings repeated, headings absent, multiple frontmatter formats.
- Unicode/emoji filenames: avoid shell quirks; use Node fs APIs.
- Output capture: avoid PowerShell redirection pitfalls for JSON artifacts; prefer tool-level `--output`.

## Suggested experiments (small spikes)

1) Agent-matrix spike:
	- Parse YAML frontmatter from `.github/agents/*.agent.md` and produce a `tools` coverage table + JSON.
2) md-edit multi-file dry-run spike:
	- Implement `--files` glob expansion + “insert-after heading” operation with per-file diff generation.
3) Idempotency spike:
	- Normalize snippet comparisons (trim trailing whitespace + normalize CRLF/LF) and prove no duplicate inserts.

## Ownership / handoff

- Implementation should be owned by `🌟📐 CLI Toolsmith 📐🌟` or `🔧 CLI Tool Singularity 🔧`.
- Validation tests should be owned by `AGI-QA-Tests`.

## Coverage checklist
- [ ] UI
- [x] Data
- [x] Tooling
- [x] Operations
