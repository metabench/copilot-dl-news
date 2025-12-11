# Working Notes – jsgui3 platform helpers via lab

- 2025-12-11 — Session created via CLI.
- 2025-12-11 — Ran lab check for platform helpers (`node src/ui/lab/experiments/002-platform-helpers/check.js`); all 7 assertions passed after adding `hasAttribute` to the stub element. Verified:
	- style proxy coerces `size` values to px and applies background color
	- `comp` arrays create children and `_ctrl_fields` entries
	- `register_this_and_subcontrols()` populates `context.map_controls`
	- `data-jsgui-fields` on `el` hydrates `_persisted_fields`
- 2025-12-11 — Updated jsgui3 Research agent file with experiment workflow upgrades (integration vs frontier) and a lab console UI concept for managing experiments/checks.
- 2025-12-11 — Implemented LabConsoleControl with manifest-driven cards plus check script; `node src/ui/lab/checks/labConsole.check.js` passes (2 experiments rendered, actions present). Added manifest.json and README updates.
- 2025-12-11 — Added experiment 003 (mixin composition) to lab manifest; baseline server-path check passes (`node src/ui/lab/experiments/003-mixin-composition/check.js`) using mixins object stub to verify dragable+resizable composition without DOM.
