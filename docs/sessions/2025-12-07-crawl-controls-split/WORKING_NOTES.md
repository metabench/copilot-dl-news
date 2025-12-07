# Working Notes – Split crawl widget controls into modules

- 2025-12-07 — Session created via CLI. Add incremental notes here.
 - 2025-12-07 — Split crawl widget controls into `crawl-widget/ui/controls/*` modules (title bar, type selector, URL selector, buttons, progress panel, log viewer) with shared `controlUtils.js`.
 - 2025-12-07 — Refactored `crawl-widget/ui/crawlWidgetControlsFactory.js` to import modular controls and keep only app wiring; preserved exports including `ProgressBarControl`.
 - 2025-12-07 — Rebuilt renderer bundle via `npx esbuild renderer.src.js --bundle --outfile=public/renderer.bundle.js --format=iife --platform=browser --external:electron` (cwd crawl-widget); build succeeded.
