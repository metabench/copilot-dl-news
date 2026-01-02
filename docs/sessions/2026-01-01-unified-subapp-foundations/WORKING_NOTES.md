# Working Notes – Unified App: Sub-App Foundations (Keep Iframes)

- 2026-01-01 — Session created via CLI. Add incremental notes here.

## Goal

- Introduce standardized sub-app “components” so registry entries stop hand-writing iframe HTML.
- Keep iframe embedding behavior unchanged (still returns `<iframe class="app-embed" ...>`), but route content through jsgui3 controls.

## Changes

- Added standardized controls:
	- `src/ui/server/unifiedApp/components/SubAppFrame.js` (renders the iframe with `app-embed` class)
	- `src/ui/server/unifiedApp/components/SubAppPlaceholder.js` (renders standard placeholder blocks)
- Refactored `src/ui/server/unifiedApp/subApps/registry.js` to use:
	- `renderIframeApp('/path', 'Title')`
	- `renderPlaceholder(appId, 'Title', 'Subtitle')`

## Panel contract seam (started)

- Added a minimal “panel contract” wrapper so non-iframe sub-apps can request client-side activation without relying on `<script>` tags inside injected HTML:
	- `src/ui/server/unifiedApp/subApps/panelContract.js` exports `wrapPanelHtml({ appId, activationKey, html })`.
	- Home and placeholder-style apps are now wrapped in a `.unified-panel-root` with `data-unified-activate="..."`.
- Added a client-side activation hook in the unified shell:
	- `src/ui/server/unifiedApp/views/UnifiedShell.js` runs activation once after content injection (idempotent, keyed by `data-unified-activate`).
	- A small global registry exists at `window.UnifiedAppPanels.registerActivator(key, fn)` for future embedded panels.

## Content contract (polished)

- Unified content API now supports a structured payload so activation does not require parsing injected HTML:
	- `renderContent(req)` may return either a string, or `{ content, embed, activationKey }`.
	- `/api/apps/:appId/content` responds with `{ appId, content, embed?, activationKey? }`.
	- The unified shell stores `data-activation-key` / `data-embed` on the container and activates via `activationKey` (falls back to scanning for `data-unified-activate`).

## Proof panel (no iframe)

- Added a “Panel Demo” sub-app that is fully embedded (no iframe) and uses the activation seam to bind click handlers:
	- Registry entry: `id: 'panel-demo'`
	- Activation key: `panel-demo`
	- The activator updates counters + output text on click.

## Validation

- `node src/ui/server/unifiedApp/checks/shell.check.js` → ✅ 39/39 assertions passed
- `node src/ui/server/unifiedApp/checks/unified.server.check.js` → ✅ passed
- `npm run test:by-path tests/ui/unifiedApp.registry.test.js` → ✅ passed

## Notes / Next foundations

- This establishes a single “sub-app view surface” abstraction (controls) without changing navigation.
- Next step for a future iframe→panel migration: introduce a `SubAppPanel` control + a client-side activation contract so injected content can self-initialize (scripts don’t auto-run when inserted via `innerHTML`).
