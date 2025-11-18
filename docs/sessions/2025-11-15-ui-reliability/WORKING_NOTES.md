# Working Notes — 2025-11-15 UI Reliability

## Locale / CLI Mode
- js-scan: `node tools/dev/js-scan.js --search UrlFilterToggle --json --ai-mode`
- js-scan: `node tools/dev/js-scan.js --search UrlListingTable --json --ai-mode`
- js-scan: `node tools/dev/js-scan.js --search PagerButton --json --ai-mode`

## Findings
- 2025-11-15 URL filter sessions highlight recent runtime errors (`each_source_dest_pixels_resized_limited_further_info`) plus toggle refresh gaps. Need to ensure any reliability work keeps fixes aligned with those efforts.
- `client-controls-bundle` analysis focuses on esbuild entry completeness, indicating bundle composition is a known fragility area.
- `/api/urls` currently relies on Express' final error handler which always emits plain text 500 responses. `UrlFilterToggle` expects JSON and will throw cryptic parse errors instead of surfacing the actual server failure.
- API responses lack correlation IDs/timing metadata, making it hard to trace toggle fetches from browser logs back to server logs.
- `UrlFilterToggle` only logs errors to `console.error` and does not emit structured events or store diagnostics, so debugging refresh races/regressions is difficult.

## Plan Highlights
- Add request correlation + JSON error fallback to `dataExplorerServer` and surface requestId/duration headers for `/api/urls` responses.
- Teach `UrlFilterToggleControl` to capture those headers, dispatch `copilot:urlFilterToggle` events, and stash payloads on `window.__COPILOT_UI_DEBUG__`.
- Extend Jest + Puppeteer-friendly tests so new server + client diagnostics stay covered (SuperTest for API JSON, unit test for event emission).

## Implementation Notes
- Added `urlFilterDiagnostics` helper (window-backed ring buffer + CustomEvent emitter) and wired `UrlFilterToggleControl` to emit success/error telemetry, keep last diagnostics in-memory, and surface API failures with richer messages.
- Wrapped `/api/urls` with per-request IDs + duration headers and JSON error envelopes; updated Express error handler to respect API clients and stamped `x-copilot-error` for telemetry.
- Tests: `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`, `npm run test:by-path tests/ui/controls/urlFilterDiagnostics.test.js`.
- Client bundle rebuilt via `npm run ui:client-build` to include the new instrumentation.

## Follow-ups / Continuation Tokens
- TBC
