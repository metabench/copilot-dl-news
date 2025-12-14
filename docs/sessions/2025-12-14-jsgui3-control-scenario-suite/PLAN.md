# Plan – jsgui3 Control Scenario Suite

## Objective
Add a second Puppeteer scenario suite for a pure jsgui3 control and wire it into lab experimentation practices.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- Add minimal server-backed jsgui3 control harness:
	- `src/ui/server/controlHarness/server.js`
	- `src/ui/server/controlHarness/isomorphic/jsgui.js`
	- `src/ui/server/controlHarness/isomorphic/controls/CounterControl.js`
	- `src/ui/server/controlHarness/client/index.js`
	- `src/ui/server/controlHarness/public/control-harness.css`
	- `scripts/build-control-harness-client.js`

- Add a Puppeteer scenario suite for the harness:
	- `scripts/ui/scenarios/control-harness-counter.suite.js`

- Wire into lab experimentation practices:
	- `docs/agi/skills/jsgui3-lab-experimentation/SKILL.md`

## Risks & Mitigations
- Risk: activation flake (DOM not ready / bundle missing).
	- Mitigation: suite gates on explicit `window.__COPILOT_CONTROL_HARNESS_READY__` + control registry flag; suite auto-builds client bundle if missing.

- Risk: hanging server/browser.
	- Mitigation: scenario suite runner owns browser lifecycle; harness server started in-process and closed per-suite `shutdown()`.

## Tests / Validation
- Build the harness client bundle:
	- `node scripts/build-control-harness-client.js`

- Run the scenario suite:
	- `node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/control-harness-counter.suite.js`
