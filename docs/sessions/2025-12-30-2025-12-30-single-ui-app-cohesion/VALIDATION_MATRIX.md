# Validation Matrix — UI servers (draft)

## Purpose
A quick, executable checklist of commands that should succeed after refactors.

## How to use
- Run the command.
- Record results in `WORKING_NOTES.md` (pass/fail + any stack traces).

## Canonical `--check` commands

> Note: This is a draft list derived from `src/ui/server/**/server.js` inventory.

| Feature | Entry | Expected | Notes |
| --- | --- | --- | --- |
| unifiedApp | `node src/ui/server/unifiedApp/server.js --check` | exit 0 | Root UI server |
| rateLimitDashboard | `node src/ui/server/rateLimitDashboard/server.js --check` | exit 0 | Modularized |
| webhookDashboard | `node src/ui/server/webhookDashboard/server.js --check` | exit 0 | Modularized |
| pluginDashboard | `node src/ui/server/pluginDashboard/server.js --check` | exit 0 | Modularized |
| analyticsHub | `node src/ui/server/analyticsHub/server.js --check` | exit 0 | Modularized |
| qualityDashboard | `node src/ui/server/qualityDashboard/server.js --check` | exit 0 | Modularized |
| queryTelemetry | `node src/ui/server/queryTelemetry/server.js --check` | exit 0 | Modularized |
| crawlerMonitor | `node src/ui/server/crawlerMonitor/server.js --check` | exit 0 | Modularized |
| crawlObserver | `node src/ui/server/crawlObserver/server.js --check` | exit 0 | Modularized |
| templateTeacher | `node src/ui/server/templateTeacher/server.js --check` | exit 0 | Modularized |
| adminDashboard | `node src/ui/server/adminDashboard/server.js --check` | exit 0 | May require modularization |
| opsHub | `node src/ui/server/opsHub/server.js --check` | exit 0 | May require modularization |
| docsViewer | `node src/ui/server/docsViewer/server.js --check` | exit 0 | May require modularization |
| goalsExplorer | `node src/ui/server/goalsExplorer/server.js --check` | exit 0 | May require modularization |
| decisionTreeViewer | `node src/ui/server/decisionTreeViewer/server.js --check` | exit 0 | Likely needs router factory |
| designStudio | `node src/ui/server/designStudio/server.js --check` | exit 0 | Likely needs router factory |
| testStudio | `node src/ui/server/testStudio/server.js --check` | exit 0 | Likely needs router factory |
| controlHarness | `node src/ui/server/controlHarness/server.js --check` | exit 0 | Has server factory; may need `--check` |
| artPlayground | `node src/ui/server/artPlayground/server.js --check` | exit 0 | Likely needs router factory |
| visualDiff | `node src/ui/server/visualDiff/server.js --check` | exit 0 | Has `createApp`; likely needs standard router contract |
| wysiwyg-demo | `node src/ui/server/wysiwyg-demo/server.js --check` | exit 0 | Likely needs router factory |

## Optional UI smoke checks
- Start unified UI and verify navigation renders:
  - `npm run ui:unified`
- If Puppeteer capture is needed:
  - `node tools/dev/ui-console-capture.js --server="src/ui/server/unifiedApp/server.js" --url="http://localhost:3000"`
