# Plan – Unified App: Sub-App Foundations (Keep Iframes)

## Objective
Introduce standardized sub-app components/contracts in unified app while retaining iframe embedding, laying groundwork for future panel-based rendering.

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/server/unifiedApp/components/SubAppFrame.js`
- `src/ui/server/unifiedApp/components/SubAppPlaceholder.js`
- `src/ui/server/unifiedApp/subApps/panelContract.js`
- `src/ui/server/unifiedApp/subApps/registry.js`
- `src/ui/server/unifiedApp/views/UnifiedShell.js`
- Session notes:
	- `docs/sessions/2026-01-01-unified-subapp-foundations/WORKING_NOTES.md`
	- `docs/sessions/2026-01-01-unified-subapp-foundations/SESSION_SUMMARY.md`

## Risks & Mitigations
- Risk: jsgui3 control rendering may differ subtly from raw HTML strings (attribute order/whitespace).
	- Mitigation: keep same classes/attributes and verify with existing Unified App check scripts.
- Risk: creating new `Page_Context()` per render could be surprising.
	- Mitigation: only used server-side for HTML string generation in `/api/apps/:appId/content`; revisit when introducing true embedded panels/activation.

## Tests / Validation
- `node src/ui/server/unifiedApp/checks/shell.check.js`
- `node src/ui/server/unifiedApp/checks/unified.server.check.js`
