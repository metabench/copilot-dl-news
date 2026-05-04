# Session: Churn Control Salvage

## Objective
Identify churn-type UI files, remove disposable sources, and salvage genuinely reusable controls into the shared jsgui3 controls path with focused render checks.

## Done When
- Churn directories/files are inventoried and categorized.
- Reusable control definitions are either moved/promoted to shared controls or explicitly left behind with rationale.
- Shared controls are versatile enough for multiple UIs, not tied to deleted app-specific runtime state.
- Fast render checks/tests cover the promoted controls with reusable scaffolding.
- Cleanup decisions, commands, and residual follow-ups are documented.

## Change Set
- Expected code: `src/ui/controls/**`, focused checks under `src/ui/controls/checks/**`, and deletion/cleanup of churn files if they are still present.
- Expected docs: this session folder and relevant shared-control docs if new controls are promoted.

## Risks And Assumptions
- The worktree already contains substantial unrelated deletions and modifications; do not restore or revert unrelated user changes.
- Deleted churn sources may still be inspectable from `HEAD` for salvage review.
- Promote controls only when they are generic, dependency-light, and useful beyond one throwaway app.

## Tests And Checks
- Focused Node render checks for promoted controls.
- `node --check` on new/changed control and check files.
- Existing relevant jsgui3 shared-control checks where touched.
