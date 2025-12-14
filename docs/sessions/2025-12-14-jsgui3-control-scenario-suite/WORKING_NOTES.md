# Working Notes – jsgui3 Control Scenario Suite

- 2025-12-14 — Session created via CLI. Add incremental notes here.

- 2025-12-14 — Build control harness client bundle:
	- `node scripts/build-control-harness-client.js`
	- Result: ✅ bundle written to `src/ui/server/controlHarness/public/control-harness-client.js`

- 2025-12-14 — Validate scenario suite runner against the harness:
	- `node tools/dev/ui-scenario-suite.js --suite=scripts/ui/scenarios/control-harness-counter.suite.js --timeout=20000`
	- Result: ✅ 3/3 scenarios passed

- 2025-12-14 — Server startup self-check:
	- `node src/ui/server/controlHarness/server.js --check --port 4976`
	- Result: ✅ startup check passed
