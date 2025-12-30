# Endurance Brain — Reference (templates, checklists, anti-stall rules)

## Purpose
This reference exists to make the Endurance Brain agent *mechanically reliable*.
If you catch yourself writing “here are some ideas” and then pausing, stop and follow the templates below.

## Anti-stall rule (the one that matters)
When you have a summary of future tasks to present to the user, you MUST also do one of:
- (A) convert it into a concrete, numbered plan with acceptance criteria + validation commands **and start Step 1 immediately**, OR
- (B) explicitly ask a single blocking decision question (if and only if progress is impossible without it).

Never end on “suggestions” alone.

## Standard deliverables (when user asks for plans + goals + plans)
1) **Goals review** (`GOALS_REVIEW.md`)
2) **Plan docs** (one or more)
3) **Validation matrix** (`VALIDATION_MATRIX.md`)
4) **Next-agent briefing + prompt**
5) **Agent file upgrade** (bake in the workflow)

## Template: Goals Review
Create `GOALS_REVIEW.md` in the active session folder.

Sections:
- Sources consulted
- Primary product goals
- Engineering goals / constraints
- Gap analysis (what blocks goals today)
- Items implied by the review (actionable list)
- Non-goals (explicitly defer scope)

## Template: Detailed Implementation Plan
Create `IMPLEMENTATION_PLAN.md` (or multiple plan docs) in the session folder.

For each workstream:
- Objective
- Done when (3–7 checkable bullets)
- Change set (files to touch)
- Risks/assumptions
- Validation commands (exact commands)
- Slice order (start with the smallest)

## Template: “Next slice” plan (the one you execute immediately)
Create `SLICE_<slug>.md` in the session folder.

- Slice objective: 1 sentence
- Scope: 1–2 components only
- Acceptance criteria:
  - `--check` exits 0 for affected servers
  - unified app mounting works under prefix
- Implementation steps (numbered)
- Validation steps (exact commands)
- Evidence log: command output summary + timestamps

## UI cohesion specific rules (this repo)
- No-retirement: legacy servers remain runnable on original ports.
- Prefer “app-as-module, server-as-runner”.
- Standard export: `create<Feature>Router(options) -> { router, close }`.
- Prefer DB injection (`getDbRW` / `getDbHandle`) over opening DB per dashboard.
- Prefer `--check` as the first validation layer.

## Decision engines vs decision modes (weights boundary)

Terminology:
- **Decision engine**: orchestration layer that may support multiple decision modes.
- **Decision mode**: a specific framework (boolean rules/trees vs weighted scoring, etc.).

Important: The “no weighted signals” rule is **subsystem-specific**.
- Apply it strictly inside the Fact → Classification subsystem and its boolean decision trees.
- It is NOT a global ban on weights elsewhere (planning/prioritization/arbitration may legitimately be weighted).

Pointers:
- `docs/designs/FACT_BASED_CLASSIFICATION_SYSTEM.md`
- `docs/ADVANCED_PLANNING_SUITE.md`

## Common failure modes + countermeasures

### Failure: Agent proposes work then stops
Countermeasure:
- Add/refresh session docs immediately.
- Implement the first slice without asking for permission unless a true decision is required.

### Failure: Too many tasks listed
Countermeasure:
- Pick the smallest slice; define it precisely; do it.

### Failure: Validation missing
Countermeasure:
- Every change must include at least one executed validation command.

## “One question maximum” policy
If you must ask the user something, ask only one question, and make it binary/selectable.
Example: “Should unifiedApp remain the canonical root (yes/no)?”

## Recording evidence
Always append to the active session `WORKING_NOTES.md`:
- commands run
- exit codes
- failures and fixes
- what you will do next
