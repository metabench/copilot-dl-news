# Plan – Data Explorer WLILO Theme + Shared Controls

## Objective
Improve Data Explorer presentation using WLILO theming abstractions and extract reusable jsgui3 controls.

## Done When
- [x] Reusable controls extracted into shared location.
- [x] Data Explorer styling uses theme tokens (no ad-hoc inline styles for shared UI pieces).
- [x] WLILO theme works with mixed surface contrast (page bg vs panels/cards).
- [x] Evidence commands captured in `WORKING_NOTES.md`.
- [x] Key deliverables and outcomes documented in `SESSION_SUMMARY.md`.
- [x] Follow-ups captured in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- Added:
	- `src/ui/controls/SearchFormControl.js`
	- `src/ui/controls/MetricCardControl.js`
- Updated:
	- `src/ui/controls/index.js`
	- `src/ui/render-url-table.js`
	- `src/ui/server/services/themeService.js`
	- `src/ui/styles/dataExplorerCss.js`
	- `src/ui/server/dataExplorer/controls/ExplorerHomeCardControl.js`
	- `src/ui/server/dataExplorerServer.js`
	- `src/ui/server/checks/dataExplorer.check.js`
- Memory/docs:
	- `docs/agi/PATTERNS.md`
	- `docs/sessions/2025-12-13-data-explorer-wlilo-theme/*`

## Risks & Mitigations
- Risk: Mixed-surface contrast can drift (light bg + dark panels).
	- Mitigation: Use dual-surface tokens (`--theme-surface-text*`) anywhere a surface background is used.
- Risk: Theme selection becomes inconsistent across SSR vs checks.
	- Mitigation: Resolve theme in server rendering and inject `themeConfig` into preview checks.
- Risk: Refactoring controls breaks legacy CSS hooks.
	- Mitigation: Preserve existing class hooks (e.g., keep `data-explorer__card` while reusing shared control styling).

## Tests / Validation
- Evidence scripts:
	- `node src/ui/server/checks/dataExplorer.check.js`
- Focused Jest suites:
	- `npm run test:by-path tests/ui/server/dataExplorerServer.test.js`
	- `npm run test:by-path tests/ui/server/dataExplorerServer.production.test.js`
