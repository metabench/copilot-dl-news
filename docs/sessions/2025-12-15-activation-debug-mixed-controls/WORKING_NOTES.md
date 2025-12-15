# Working Notes – Activation debugging with mixed controls

- 2025-12-15 — Session created via CLI.

## Prior art reviewed

- docs/guides/JSGUI3_SHARED_CONTROLS_CATALOG.md (activation + registration expectations)
- docs/sessions/2025-12-14-jsgui3-server-activation-npm-update/WORKING_NOTES.md (interpreting map_Controls warnings)
- src/ui/lab/experiments/026-activation-contract-lab (structured report pattern)

## Implementation

- Added lab 029: mixed built-in + custom activation
	- Built-in: Color_Grid (from jsgui3-html)
	- Custom controls: mixed_activation_page / _panel / _leaf
	- Always-on structured report on window: __mixed_activation_report
	- Gated debug logs: window.__COPILOT_ACTIVATION_DEBUG__ / __COPILOT_ACTIVATION_DEBUG_VERBOSE__

## Validation

- Ran:
	- node src/ui/lab/experiments/029-mixed-builtins-custom-activation/check.js
- Result:
	- PASS
	- Contract ok + report invariants all satisfied
