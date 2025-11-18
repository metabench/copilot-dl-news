# Plan: js-improvements

**Objective**: Implement the pending js-scan/js-edit improvements starting with the critical Gap 3 regression fix, then chart execution steps for the remaining backlog (TypeScript enablement, structured plans, advanced batching, etc.).

**Done when**
- [x] Improvement 6 (`--changes --dry-run` ingestion) is fixed with automated tests.
- [ ] Remaining improvements are broken into actionable deliverables with owners/next steps.
- [x] Session notes capture commands, findings, and blockers; summary documents progress.

**Change set**
- tools/dev/js-edit.js
- tools/dev/js-edit/BatchDryRunner.js (if needed)
- tests/tools/js-edit/**
- docs/sessions/2025-11-16-js-improvements/WORKING_NOTES.md
- docs/sessions/2025-11-16-js-improvements/SESSION_SUMMARY.md

**Risks / Assumptions**
- Fixing Improvement 6 may touch shared BatchDryRunner behavior; ensure no regressions to plan/recipe flows.
- Later improvements (TypeScript, structured plans) may require coordinated doc/test updates.

**Tests / Checks**
- `npm run test:by-path tests/tools/js-edit/batch-dry-run.test.js`
- `npm run test:by-path tests/tools/__tests__/js-edit.test.js`

**Docs to update**
- Session docs listed above
- Any relevant tooling guides once fixes land
