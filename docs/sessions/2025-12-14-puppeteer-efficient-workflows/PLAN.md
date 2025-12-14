# Plan – Puppeteer Efficient UI Workflow Docs

## Objective
Document repeatable single-browser Puppeteer workflows and fixtures for UI verification

## Done When
- [x] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [x] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [x] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- [x] Add durable guide: `docs/guides/PUPPETEER_SCENARIO_SUITES.md`
- [x] Add Skill: `docs/agi/skills/puppeteer-efficient-ui-verification/SKILL.md`
- [x] Wire discovery links:
	- `docs/agi/SKILLS.md`
	- `docs/INDEX.md`
	- `docs/guides/PUPPETEER_UI_WORKFLOW.md`
	- `docs/agi/skills/targeted-testing/SKILL.md`
	- `docs/agi/skills/jsgui3-activation-debug/SKILL.md`

## Risks & Mitigations
- _Note potential risks and how to mitigate them._

## Tests / Validation
- Run at least one scenario-suite command to confirm runner still works and exits cleanly:
	- `node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js --scenario=001 --quiet`
