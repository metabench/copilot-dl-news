# Validation Matrix: Screenshot Tooling Control Centre

| Check | Command | Result | Evidence |
| --- | --- | --- | --- |
| Screenshot review control render | `node src/ui/controls/checks/ScreenshotReviewPanelControl.check.js` | Pass | Required control markers present. |
| Shared helper/store | `node checks/screenshot-capture-helper.check.js` | Pass | Argument parsing, skip capture, route export, fixture run discovery, asset resolution, and comment append verified. |
| Unified shell SSR | `node src/ui/server/unifiedApp/checks/shell.check.js` | Pass | 46/46 assertions, including screenshot app and activator. |
| Unified server check mode | `node src/ui/server/unifiedApp/checks/unified.server.check.js` | Pass | Screenshot app content, runs API, comments API, and POST comment behavior verified. |
| Browser screenshot capture | `C:\nvm4w\nodejs\node.exe scripts/ui/capture-unified-crawl-display.js --output docs/sessions/2026-05-04-screenshot-tooling-control-centre/screenshots --save-screenshots --save-dom-snapshots` | Pass | `screenshots/analysis.json` has `ok=true` for eight route/viewport entries with DOM snapshots. |

Residual risk: direct human pixel review still depends on opening the saved PNGs or Control Center gallery; automated evidence now covers desktop/mobile overflow, readiness, screenshot bytes, DOM snapshots, and browser events.