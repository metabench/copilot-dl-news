# Working Notes – Audit crawl-widget for decision tree viewer

- 2025-12-20 — Session created via CLI. Add incremental notes here.

- 2025-12-20 23:54 — ## Findings (code audit)
- crawl-widget is a compact Electron controller widget (not a general dashboard). It starts the crawl CLI (`crawl.js`) and exposes progress via IPC + an internal telemetry SSE server.
- No first-party code references to decision trees / Decision Tree Viewer / Data Explorer URLs or port 4600.
- `shell` is imported in `crawl-widget/main.js` but not used; no IPC handler exists to open external URLs.

## Key files inspected
- crawl-widget/main.js: telemetry SSE server on 127.0.0.1:3099, crawl process lifecycle, IPC handlers (crawl control, telemetry info, news sources).
- crawl-widget/preload.js: exposes IPC APIs; no “open viewer” API.
- crawl-widget/ui/crawlWidgetControlsFactory.js: UI is title bar + crawl type + URL + start/pause/stop + progress + log.
- crawl-widget/ui/controls/WidgetTitleBarControl.js and CrawlControlButtonsControl.js: only widget/window + crawl control.
