# Next Agent Briefing — Single UI app cohesion (endurance workflow)

## Situation
The repo is evolving toward a cohesive “single UI app” while preserving all legacy servers and ports.

Recent work has established a working pattern:
- “app-as-module, server-as-runner”
- direct router mounting in the unified app
- `--check` as the primary regression detector

## Non-negotiable constraints
- Do not retire existing servers/ports/scripts.
- Do not break route semantics.
- Prefer small, verifiable refactors.

## Decision engines vs decision modes (weights boundary)
- A **decision engine** may support multiple **decision modes**.
- The “no weighted signals” rule is **local** to the Fact → Classification subsystem and its boolean decision trees.
- Other subsystems may legitimately use weights (e.g., planning/prioritization/arbitration) as long as the boundary stays explicit.

## What you should do next (high-level)
1) Use the modularization standard and finish converting the remaining UI servers.
2) Keep `unifiedApp` as the canonical entry and mount everything under stable prefixes.
3) Improve the operator experience (nav, theme consistency, activation) after modularization coverage is complete.

## Where the plan lives
Endurance rules + templates:
- `docs/agents/endurance-brain-reference.md`
- Do not stop after suggesting an approach.
- Always convert the suggestion into:
  1) a concrete todo
  2) a concrete file change
  3) a concrete validation run
  4) a short evidence note in `WORKING_NOTES.md`

## Immediate first slice (suggested)
- Pick 1–2 remaining servers with low coupling (e.g., `goalsExplorer`, `docsViewer`, `opsHub`).
- Implement router factory + `--check`.
- Mount them in unified app under stable prefixes.
- Run the validation matrix rows you touched.
