# Plan – Improve ui-pick Electron picker

## Objective
Enhance ui-pick UX/output and agent usability

## Done When
- [ ] ui-pick accepts normalized option objects (label/value/description) and emits a clean JSON mode (`--json`).
- [ ] CLI usage/help is clear (help flag + README updates) and cancellation/exit codes are documented.
- [ ] Validation notes captured in WORKING_NOTES; session summary updated when finished.

## Change Set (initial sketch)
- tools/dev/ui-pick.js
- tools/dev/README.md
- docs/sessions/2025-12-06-ui-pick-improve/WORKING_NOTES.md

## Risks & Mitigations
- Electron picker output format mismatch → keep backward-compatible plain selection output; add JSON only when requested.
- Bad option shapes → normalize strings to {label,value} and validate objects before writing temp file.
- Windows path issues → continue using npm start in pickerDir with shell=true.

## Tests / Validation
- Manual: `node tools/dev/ui-pick.js "One" "Two"` returns selection string; cancel exits 1.
- Manual: `node tools/dev/ui-pick.js --json "One" "Two"` returns JSON with selection/cancelled and proper exit codes.
- Manual: `node tools/dev/ui-pick.js --options '[{"label":"A","value":"a"}]' --json` returns JSON selection.
