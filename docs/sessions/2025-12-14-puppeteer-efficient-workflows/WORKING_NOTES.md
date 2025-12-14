# Working Notes – Puppeteer Efficient UI Workflow Docs

- 2025-12-14 — Session created via CLI. Add incremental notes here.

- Promoted the scenario-suite runner workflow into durable docs:
	- Guide: `docs/guides/PUPPETEER_SCENARIO_SUITES.md`
	- Skill: `docs/agi/skills/puppeteer-efficient-ui-verification/SKILL.md`

- Planned validation:
	- `node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js --scenario=001 --quiet`

- Validation run:
	- `node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/url-filter-toggle.suite.js --scenario=001 --quiet` → All scenarios passed (1).
