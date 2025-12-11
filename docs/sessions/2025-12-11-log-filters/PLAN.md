# Plan – Log filter toggles popup

## Objective
Add popup checkboxes to toggle log types and use existing log color scheme

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- src/ui/controls/GeoImportDashboard.js (LiveLog UI tweaks + filter controls)
- src/ui/server/geoImport/styles.css (styling for log filter popup and chips)
- docs/sessions/2025-12-11-log-filters/WORKING_NOTES.md (capture validation)

## Risks & Mitigations
- CSS source vs built asset drift; prefer editing source styles and keep selectors scoped to LiveLog to avoid regressions.
- Missing client activation might leave toggles inert; rely on CSS-only filtering with sibling selectors to avoid extra JS.
- Log levels beyond the known set could appear; default checkbox state to ON and fall back to showing unknown levels.

## Tests / Validation
- Manual: run geo import dashboard page and toggle filters to confirm entries hide/show per level and popup opens/closes cleanly.
- Visual: verify toggle chip colors match log line colors.
