# Plan – Virtual Matrix Smoothness

## Objective
Use lab experiments to validate and improve VirtualMatrixControl smooth scrolling, pinning, and resize behavior.

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/ui/server/shared/isomorphic/controls/ui/VirtualMatrixControl.js (stabilize + smoothness improvements; already applied during this session)
- src/ui/lab/experiments/046-virtual-matrix-control-smoothness/check.js (new: production-control smoothness lab)
- src/ui/lab/experiments/046-virtual-matrix-control-smoothness/README.md (new: lab rationale + intended invariants)
- docs/sessions/2025-12-31-virtual-matrix-smoothness/* (evidence + handoff)

## Risks & Mitigations
- Risk: client-side init regressions only show up in browser (SSR still renders HTML).
	- Mitigation: Puppeteer checks that wait for `data-vm-ready=1` + log `pageerror` on failures.
- Risk: scroll/render churn causing jank for large matrices.
	- Mitigation: window-key caching (avoid rerender when window unchanged) + passive scroll listener + resize-triggered rerender.

## Tests / Validation
- Lab baseline: `node src/ui/lab/experiments/045-virtual-matrix-scroll/check.js`
- Production smoothness lab: `node src/ui/lab/experiments/046-virtual-matrix-control-smoothness/check.js`
- Place Hub Guessing (SSR): `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.check.js`
- Place Hub Guessing (Puppeteer): `node src/ui/server/placeHubGuessing/checks/placeHubGuessing.matrix.screenshot.check.js`
