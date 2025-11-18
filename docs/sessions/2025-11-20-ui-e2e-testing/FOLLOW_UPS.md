# Follow Ups: 2025-11-20 UI E2E Testing

| Status | Item | Owner | Notes |
| --- | --- | --- | --- |
| ⏳ | Stabilize toggle test using `copilot:urlFilterToggle` event | UI Automation | Replace DOM polling with `page.waitForEvent` so Puppeteer waits on emitted diagnostics instead of 10s timeout |
| ⏳ | Extract shared SQLite fixture helper for UI e2e | UI Automation | Move `buildInMemoryDb` + `seedUrlData` into `tests/ui/e2e/helpers/db.js` for reuse across future flows |
| ⏳ | Add pagination + home card e2e scenarios | UI Automation | Drive pager buttons and validate home card diagnostics once helper + event hook are ready |
| ⏳ | Document troubleshooting + runner steps in `src/ui/README.md` | UI Docs | Expand README with Puppeteer command, event-wait guidance, and tips for refreshing Chromium/cache |
