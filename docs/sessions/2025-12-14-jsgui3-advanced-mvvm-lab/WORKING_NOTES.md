# Working Notes – jsgui3 advanced MVVM lab

- 2025-12-14 — Session created via CLI. Add incremental notes here.

## 2025-12-14 — Experiment 023

### Implemented

- Added `src/ui/lab/experiments/023-advanced-mvvm-patterns/`
	- Staged edits via view-model `draft*` fields
	- Computed properties: `dataName`, `draftName`, `canApply`
	- “Safe” two-way binder for `count` <-> `countText` using `model.set()` (avoids silent failures when raw property assignment doesn’t emit `change`)

### Fixes during implementation

- Avoided reliance on `ctrl_fields` for DOM wiring by using `root.querySelector(...)` for critical elements (keeps the lab stable even when child controls activate as generic controls).
- Normalized Data_Object string values that arrive JSON-quoted (e.g. `"Ada"`) so UI displays `Ada` and comparisons work.

### Validation

- `node src/ui/lab/experiments/023-advanced-mvvm-patterns/check.js` — PASS
