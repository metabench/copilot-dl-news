# Plan – UI bugs identification and plan

## Objective
Identify UI bugs across project and plan fixes

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- Session docs under `docs/sessions/2025-12-11-ui-bug-audit/`
- Likely UI controls under `src/ui/server/decisionTreeViewer/isomorphic/controls/`
- Potentially viewer/client glue `src/ui/server/decisionTreeViewer/client.js` or `DecisionTreeViewerControl`
- Other UI areas pending findings (data explorer, diagrams, etc.)

## Risks & Mitigations
- Scope creep across many UI surfaces; mitigate by focusing on high-confidence bugs with clear reproduction.
- Dynamic jsgui3 rendering nuances (server vs client attach); mitigate by reasoning about DOM binding and verifying via check scripts.
- Time cost of full test suite; mitigate by running targeted checks only.

## Tests / Validation
- Run relevant UI check scripts (e.g., `decisionTreeViewer.check.js`) before/after reasoning.
- For dynamic rendering fixes, ensure event wiring and SVG connections remain functional.
