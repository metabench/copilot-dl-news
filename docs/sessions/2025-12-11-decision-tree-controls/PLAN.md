# Plan – Polish decision tree controls UI

## Objective
Audit jsgui3 decision tree controls for presentation issues and SVG curves

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Approach
- Inspect decision tree viewer jsgui3 controls and public assets for layout/SVG output issues.
- Verify curves/edges rendering (bezier correctness, smoothness) and CSS presentation.
- Run/check existing decision tree viewer check script for visual regressions if available.
- Apply targeted fixes; prefer jsgui3 control updates over ad-hoc DOM tweaks.

## Change Set (initial sketch)
- `src/ui/server/decisionTreeViewer/isomorphic/controls/*`
- `src/ui/server/decisionTreeViewer/public/decision-tree.css`
- `src/ui/server/decisionTreeViewer/client.js` (bundle entry) and related build output as needed
- `src/ui/server/decisionTreeViewer/checks/decisionTreeViewer.check.js` (validation harness)
- Session docs under `docs/sessions/2025-12-11-decision-tree-controls/`

## Risks & Mitigations
- SVG curves/beziers may be generated in JS; need to ensure transformations align with viewBox—mitigate by inspecting computed path data and sample render via check script.
- jsgui3 control contracts could be brittle; mitigate by small, scoped changes and using existing helper utilities.
- CSS changes might affect bundled outputs; mitigate by rebuilding client bundle if source changes (use `build-client.js`).

## Tests / Validation
- Run `node src/ui/server/decisionTreeViewer/checks/decisionTreeViewer.check.js` and review output/preview artifacts.
- If bundle changes: rebuild via `node src/ui/server/decisionTreeViewer/build-client.js` or project task.
- Optional: manual visual check of generated HTML/SVG snippet from the check script.
