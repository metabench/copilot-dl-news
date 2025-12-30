# Validation Matrix — Single UI App Cohesion

| Check | Command | Expected | Evidence / Artifact |
| --- | --- | --- | --- |
| Schema drift stable on Windows | `npm run schema:check` | Exit 0, “in sync” | Console output (WORKING_NOTES) |
| Diagram check deterministic | `npm run diagram:check` | Exit 0 quickly | `diagram-atlas.check.html` |
| Unified shell startup check | `node src/ui/server/unifiedApp/server.js --check --port 3055` | Exit 0 | Console output |
| Ops Hub startup check | `node src/ui/server/opsHub/server.js --check --port 3056` | Exit 0 | Console output |
| Quality dashboard startup check | `node src/ui/server/qualityDashboard/server.js --check --port 3057 --db-path data/news.db` | Exit 0 | Console output |
| Rate limit dashboard module check | `node src/ui/server/rateLimitDashboard/checks/rateLimitDashboard.check.js` | Exit 0 | Console output |
| Webhook dashboard module check | `node src/ui/server/webhookDashboard/checks/webhookDashboard.check.js` | Exit 0 | Console output |
| Plugin dashboard module check | `node src/ui/server/pluginDashboard/checks/pluginDashboard.check.js` | Exit 0 | Console output |
| Docs Viewer client build | `npm run ui:docs:build` | Exit 0 | `src/ui/server/docsViewer/public/docs-viewer-client.js` updated |
| Docs Viewer startup check | `node src/ui/server/docsViewer/checks/docsViewer.check.js` | Exit 0 | Console output |
| Regression tests | `npm run test:by-path tests/tools/__tests__/schema-sync.line-endings.test.js tests/ui/unifiedApp.registry.test.js tests/ui/docsViewer.mountPath.test.js` | Exit 0 | Jest output |
