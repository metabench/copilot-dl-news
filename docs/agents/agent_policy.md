---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: docs-indexer
---

> **Research-First Preflight**  
> 1) Open `docs/INDEX.md`. 2) Navigate to relevant topics. 3) Read the linked docs.  
> Do **not** rely on prompt snippets. If it’s not in the prompt but is in the docs, the docs win.

# Agent Policy

## Requirements
- Review the canonical index at [../INDEX.md](../INDEX.md) before taking action.
- Follow the workflow guidance in [../workflows/doc_extraction_playbook.md](../workflows/doc_extraction_playbook.md) and [../workflows/planning_review_loop.md](../workflows/planning_review_loop.md).

## Documentation Strategy for Agents

AI agents must treat the repository documentation as the primary source of truth.

- Start every session by reviewing the Topic Index in `docs/INDEX.md`.
- Identify the minimum set of docs that apply to the current task and read them in priority order (⭐ first, then context-specific).
- Cross-reference related docs as you work and add discoveries back to canonical docs when they apply project-wide.

## Cross-Tool Instruction Canonicalization

To prevent instruction drift across IDE/agent ecosystems, use this repo policy:

1. **Canonical source**: `AGENTS.md` (root) remains the project-level source of truth for shared behavioral policy.
2. **Tool-native mirrors**: maintain equivalent guidance in tool-native files where required.
3. **No silent divergence**: when one instruction surface changes, update all applicable mirrors in the same task.
4. **Precedence-aware authoring**: write broad rules at higher scope, narrow overrides near the working path.

### Supported instruction surfaces

- **VS Code / Copilot**
	- `AGENTS.md` (project convention)
	- `.github/instructions/*.instructions.md` (tool-native instruction routing)
	- `.github/copilot-instructions.md` (always-on copilot instructions)
- **Path-local subsystem guidance**
	- `<path>/AGENT.md` files (local workflow and gotchas)
- **Codex-style AGENTS chain compatibility**
	- `AGENTS.md` + `AGENTS.override.md` (where used)
- **Other ecosystems referenced by contributors (Cursor/Cline/Claude Code)**
	- Keep compatibility notes in docs, but do not introduce new root instruction systems without explicit approval.

### Update protocol (mandatory)

When changing instruction behavior that affects operations (for example V4 incident loops):

1. Update `AGENTS.md` (global policy).
2. Update the relevant tool-native file(s) under `.github/instructions/`.
3. Update path-local `AGENT.md` where execution actually occurs (for crawl work: `tools/crawl/AGENT.md`).
4. Record the change in the active session `WORKING_NOTES.md`.

### Minimal parity checklist

- Same intent across global + tool-native + path-local files.
- Explicit read order for workflow-critical tasks.
- Explicit branch selection when workflows fork (e.g., healthy-measurement vs outage-classification).
- No contradictory language between instruction surfaces.

## Evidence Trust Policy (Repo-Wide)

Trustworthy guidance is not limited to official sources. Agents must use a mixed evidence model:

1. **Tier A — Canonical/Official**
	- Vendor docs, maintainer docs, and source-of-truth repository guidance.
2. **Tier B — Field-Proven Community Practice**
	- Repeated workflow patterns from public operator writeups/repos (including Reddit/Hacker News references) when outcomes are measurable.
3. **Tier C — Local Reproducible Evidence**
	- This repository’s own logs, benchmarks, run reports, and regression outcomes.

### Promotion rule (before standardizing)

A community practice can be promoted into canonical project policy only when all are true:
- **Repeatability**: independently observed in multiple sources/runs.
- **Mechanistic fit**: consistent with known system behavior.
- **Local verification**: reproduced in a bounded local or fleet loop with metrics.

### Decision rule

- Do not reject an approach solely because it is non-official.
- Do not adopt an approach solely because it is popular.
- Prefer: official baseline + field pattern + local verification.

## Maintenance Rules

- Update canonical docs when new patterns or lessons apply to the wider project.
- Avoid duplicating information: extend specialized docs instead of repeating content.
- Keep `AGENTS.md` slim—move sustained guidance into topical docs.
- When major initiatives complete, archive detailed retrospectives outside of the hub but preserve the lessons in canonical docs.
- For instruction changes, treat `AGENTS.md` + `.github/instructions/*` + path-local `AGENT.md` as a synchronized set.

## Anti-Patterns to Avoid

- Do not read large numbers of docs without purpose—use the index to target only the two or three most relevant documents.
- Do not create sprawling documents for simple fixes or one-off tasks.
- Do not ignore existing documentation—search first, enhance or cross-link second.

## Communication Standards

- Chat summaries stay concise (1–2 sentences covering action + result).
- Routine work does not require standalone summary documents; update canonical docs only when guidance changes for future agents.
- When instructions change, update the specialized doc instead of expanding `AGENTS.md`.
