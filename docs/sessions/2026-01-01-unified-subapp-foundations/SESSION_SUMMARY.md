# Session Summary – Unified App: Sub-App Foundations (Keep Iframes)

## Outcome

Standardized the Unified App sub-app rendering surface by introducing small jsgui3 controls for iframe embeds and placeholders, then refactored the sub-app registry to use these helpers. Behavior remains iframe-based for existing embedded apps, and we’ve now started—and proven—the key seam for iframe→panel migration: a lightweight “panel contract” wrapper plus a unified-shell activation hook, exercised by a fully embedded “Panel Demo” sub-app (no iframe).

## Changes

- Added `SubAppFrame` control: `src/ui/server/unifiedApp/components/SubAppFrame.js`
- Added `SubAppPlaceholder` control: `src/ui/server/unifiedApp/components/SubAppPlaceholder.js`
- Added `wrapPanelHtml` panel contract helper: `src/ui/server/unifiedApp/subApps/panelContract.js`
- Refactored sub-app registry to use helpers: `src/ui/server/unifiedApp/subApps/registry.js`
- Added post-inject panel activation hook + registry: `src/ui/server/unifiedApp/views/UnifiedShell.js`
- Added an embedded proof sub-app (no iframe): `panel-demo` entry in `src/ui/server/unifiedApp/subApps/registry.js`

## Validation

- `node src/ui/server/unifiedApp/checks/shell.check.js` (39/39 assertions)
- `node src/ui/server/unifiedApp/checks/unified.server.check.js` (server start/probe/stop)
- `npm run test:by-path tests/ui/unifiedApp.registry.test.js`

## Next Steps

- Introduce an embedded-panel contract (`renderPanel` + `activatePanel` + optional assets) so sub-app HTML injected into the unified shell can self-initialize.
- Add a client hook after `loadAppContent(appId)` to call panel activation when present.
- Migrate one low-risk sub-app end-to-end as the reference implementation before converting the rest.

## Accomplishments
- _Fill in key deliverables and outcomes._

## Metrics / Evidence
- _Link to tests, benchmarks, or telemetry supporting the results._

## Decisions
- _Reference entries inside `DECISIONS.md`._

## Next Steps
- _Summarize remaining work or follow-ups._
