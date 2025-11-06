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

## Maintenance Rules

- Update canonical docs when new patterns or lessons apply to the wider project.
- Avoid duplicating information: extend specialized docs instead of repeating content.
- Keep `AGENTS.md` slim—move sustained guidance into topical docs.
- When major initiatives complete, archive detailed retrospectives outside of the hub but preserve the lessons in canonical docs.

## Anti-Patterns to Avoid

- Do not read large numbers of docs without purpose—use the index to target only the two or three most relevant documents.
- Do not create sprawling documents for simple fixes or one-off tasks.
- Do not ignore existing documentation—search first, enhance or cross-link second.

## Communication Standards

- Chat summaries stay concise (1–2 sentences covering action + result).
- Routine work does not require standalone summary documents; update canonical docs only when guidance changes for future agents.
- When instructions change, update the specialized doc instead of expanding `AGENTS.md`.
