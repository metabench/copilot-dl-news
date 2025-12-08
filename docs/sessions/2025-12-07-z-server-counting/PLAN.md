# Plan – Z-server scan counting

## Objective
Expose counting progress and messaging in z-server scan UI

## Done When
- [ ] Key deliverables are complete and documented in `SESSION_SUMMARY.md`.
- [ ] Tests and validations (if any) are captured in `WORKING_NOTES.md`.
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

## Change Set (initial sketch)
- z-server/ui/controls/scanningIndicatorControl.js
- z-server/ui/controls/contentAreaControl.js
- z-server/ui/controls/zServerAppControl.js
- tools/dev/js-server-scan.js (already emitting counting events)
- z-server/main.js (forwarding new IPC events)

## Risks & Mitigations
- UI drift if counting/progress events race — keep counting state explicit and reset on total receipt.
- Electron UI not refreshed — ensure DOM refs set before updates.

## Tests / Validation
- Manual: run z-server scan and verify counting phase shows progress, then determinate progress bar fills.
- Optional: run existing diagram atlas/UI checks to ensure no breakage once available.
