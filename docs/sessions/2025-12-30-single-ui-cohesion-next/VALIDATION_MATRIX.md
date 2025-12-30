# Validation Matrix — Single UI App Cohesion

| Check | Command | Expected | Evidence / Artifact |
| --- | --- | --- | --- |
| Schema drift stable on Windows | `npm run schema:check` | Exit 0, “in sync” | Console output (WORKING_NOTES) |
| Diagram check deterministic | `npm run diagram:check` | Exit 0 quickly | `diagram-atlas.check.html` |
| Unified shell startup check | `node src/ui/server/unifiedApp/server.js --check --port 3055` | Exit 0 | Console output |
| Ops Hub startup check | `node src/ui/server/opsHub/server.js --check --port 3056` | Exit 0 | Console output |
| Quality dashboard startup check | `node src/ui/server/qualityDashboard/server.js --check --port 3057 --db-path data/news.db` | Exit 0 | Console output |
| Regression tests | `npm run test:by-path tests/tools/__tests__/schema-sync.line-endings.test.js tests/ui/unifiedApp.registry.test.js` | Exit 0 | Jest output |
