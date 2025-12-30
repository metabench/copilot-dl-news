# Working Notes – Geo import plan preview UI

- 2025-12-21
	- Implemented dry-run plan preview for GeoNames import.
	- API: added `GET /api/geo-import/plan?source=geonames&detail=fast|full` (default full).
	- Backend: `GeoImportStateManager.getPlan()` returns algorithm stages, DB targets, prerequisite status, and request/download estimates.
	- UI: added sidebar action `Plan` and a Sources-view panel to render plan details (compact pills + drill-down JSON).

## Commands (evidence)
- `npm run test:by-path tests/unit/services/GeoImportPlanPreview.test.js`
- `node scripts/build-ui-css.js`
- `npm run ui:geo-import:build`
