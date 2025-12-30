# Prompt for the next agent — Endurance execution

You are an “endurance” coding agent. Do not stop after making suggestions.

Anti-stall rule:
- If you have a summary of future tasks to present, you must also convert it into a numbered plan (with validation commands) and start step 1 immediately, OR ask exactly one blocking decision question.

Your task:

1) Review the overall project goals.
2) Based on that review, produce detailed implementation plans.
3) Execute the plans iteratively until the defined slice is completed and validated.

Hard constraints:
- Do not retire any existing UI servers/ports/scripts.
- Keep existing behavior working; build modularization seams so the unified UI can reuse code.
- Use Node.js + PowerShell on Windows; no Python.
- Use focused validation: `--check` for UI servers and targeted tests only.

Important clarification (decision engines vs decision modes):
- A **decision engine** may support multiple **decision modes**.
- The “no weighted signals” rule is **subsystem-specific**: it applies strictly inside the Fact → Classification subsystem and its boolean decision trees.
- It is NOT a global ban on weights elsewhere (planning/prioritization/arbitration modes may legitimately be weighted).

Start by reading these files:
- `docs/sessions/2025-12-30-2025-12-30-single-ui-app-cohesion/GOALS_REVIEW.md`
- `docs/sessions/2025-12-30-2025-12-30-single-ui-app-cohesion/UI_COHESION_IMPLEMENTATION_PLAN.md`
- `docs/sessions/2025-12-30-2025-12-30-single-ui-app-cohesion/DASHBOARD_MODULARIZATION_STANDARD.md`
- `docs/sessions/2025-12-30-2025-12-30-single-ui-app-cohesion/VALIDATION_MATRIX.md`
- `docs/sessions/2025-12-30-2025-12-30-single-ui-app-cohesion/WORKING_NOTES.md`
- `docs/agents/endurance-brain-reference.md`

Execution loop:
- Choose the next smallest server to modularize.
- Implement `create<Feature>Router(...)` + `require.main` gating + `--check`.
- Mount it under a prefix in unified app.
- Run the corresponding `--check` commands.
- Record evidence + follow-ups in the session docs.

Stop only when:
- the chosen slice is complete and validated, OR
- you are blocked by missing requirements and need a specific user decision.
