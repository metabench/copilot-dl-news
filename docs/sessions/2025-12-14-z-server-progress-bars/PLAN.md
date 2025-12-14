# Plan – z-server Main-Area Progress Bars

## Objective
Ensure z-server shows green progress bars during scan, and renders them in the main area when nothing else is displayed.

## Done When
- [x] `ScanningIndicatorControl` is implemented with green progress bar styles.
- [x] `ContentAreaControl` includes `ScanningIndicatorControl` and manages its visibility.
- [x] `ZServerAppControl` triggers scanning state during initialization.
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.

## Change Set
- `z-server/ui/controls/scanningIndicatorControl.js`: Implements the UI for the scanning indicator.
- `z-server/ui/controls/contentAreaControl.js`: Integrates the indicator into the main content area.
- `z-server/ui/controls/zServerAppControl.js`: Manages the scanning state.
- `z-server/styles.css`: Adds styles for the green progress bar.

## Risks & Mitigations
- **Risk**: Progress bar might not update if IPC events are not received.
  - **Mitigation**: `ZServerAppControl` listens to `onScanProgress` and updates the UI.

## Tests / Validation
- Code review of `z-server/ui/controls/*.js` and `z-server/styles.css` confirms the implementation matches the requirements.
