# Working Notes – Decision engines vs modes boundary

## 2025-12-30 — Decision engines vs decision modes boundary

- Clarified terminology: a **decision engine** may support multiple **decision modes**.
- Clarified scope: “no weighted signals” is a **subsystem-specific invariant** for the Fact → Classification subsystem and its boolean decision trees.
- Clarified allowance: other subsystems (planning/prioritization/arbitration) may use weights, including dynamic tuning, as long as weights do not leak into the fact/classification layer.

Edits applied:
- Updated Endurance Brain agent + reference docs with the boundary.
- Updated the single-UI-app cohesion next-agent briefing/prompt with the boundary.

- 2025-12-30 — Session created via CLI. Add incremental notes here.
