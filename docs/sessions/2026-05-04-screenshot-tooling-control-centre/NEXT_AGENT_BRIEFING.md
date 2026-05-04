# Next Agent Briefing: Screenshot Tooling Control Centre

The reusable screenshot tooling and Control Center viewer are implemented and validated.

Start here:
- `scripts/ui/lib/screenshotCapture.js` for helper APIs.
- `scripts/ui/capture-unified-crawl-display.js` for a route-set example.
- `/?app=screenshot-review` for the in-app viewer.
- `SCREENSHOT_COMMENTS.md` for user review comments.

Before editing the viewer, run:

```powershell
node checks/screenshot-capture-helper.check.js
node src/ui/controls/checks/ScreenshotReviewPanelControl.check.js
node src/ui/server/unifiedApp/checks/unified.server.check.js
```

Use `C:\nvm4w\nodejs\node.exe` if `node` is not on PATH.