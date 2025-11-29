# Plan – Fix Design Studio client errors

## Objective
Resolve Design Studio console errors and hydrate controls

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- `src/ui/server/designStudio/client.js` (bootstrap/activation logic)
- `src/ui/server/designStudio/isomorphic/jsgui.js` (shared resolver, if needed)
- `scripts/ui/designStudio/build-client.js` or esbuild config (if bundle adjustments required)
- Session docs under `docs/sessions/2025-11-29-design-studio-console/`

## Risks & Mitigations
- **Esbuild bundle globals** — adjusting globals incorrectly could break other dashboards; verify differences vs. docs viewer implementation before changing shared files.
- **jsgui activation coupling** — creating duplicate contexts may double-activate controls; follow established pattern (Docs Viewer/Data Explorer) and test carefully.

## Tests / Validation
- Rebuild Design Studio client bundle and load page to confirm no console errors.
- Run any existing Design Studio check scripts (if available) or add quick smoke check.
- Document manual verification (screenshots/logs) in `WORKING_NOTES.md`.
