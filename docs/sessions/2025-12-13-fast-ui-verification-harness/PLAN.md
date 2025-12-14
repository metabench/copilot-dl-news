# Plan – Fast UI verification harness (no repeated Puppeteer reloads)

## Objective
Invent and prototype a fast UI verification workflow using reusable browser sessions and richer control fixtures.

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- [x] Add a reusable Puppeteer scenario runner: `tools/dev/ui-scenario-suite.js`
- [x] Add a sample suite using a deterministic server+DB fixture: `scripts/ui/scenarios/url-filter-toggle.suite.js`
- [x] Update this session docs as the workflow stabilizes

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- Run the scenario suite locally:
	- `node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js`
- Compare with existing E2E for parity:
	- `npm run test:by-path tests/ui/e2e/url-filter-toggle.puppeteer.e2e.test.js`
