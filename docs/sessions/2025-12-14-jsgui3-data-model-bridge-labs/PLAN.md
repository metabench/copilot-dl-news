# Plan – jsgui3 Data_Model server→client bridge labs (MVC + MVVM)

## Objective
Build two lab experiments showing how Data_Model-encoded state crosses SSR→client activation and drives a view via MVC and MVVM.

## Done When
- [x] Experiment 021 (MVC): SSR encodes Data_Object, client decodes and binds controller→view
- [x] Experiment 022 (MVVM): Same + data.model→view.data.model binding layer
- [x] Both pass deterministic Puppeteer checks
- [x] Labs added to `src/ui/lab/manifest.json`
- [x] Lessons recorded in memory system

## Change Set
- `src/ui/lab/experiments/021-data-model-mvc/` (README, client.js, check.js)
- `src/ui/lab/experiments/022-data-model-mvvm/` (README, client.js, check.js)
- `src/ui/lab/manifest.json` — added entries for 021/022

## Risks & Mitigations
- **Client-side model stacks not initialized**: mitigated by calling `ensure_control_models(this, {})` in `activate()`
- **Silent flag suppressing events**: documented in lessons; use `set(k, v)` not `set(k, v, true)` for reactive updates

## Tests / Validation
- `node src/ui/lab/experiments/021-data-model-mvc/check.js` — 9/9 ✅
- `node src/ui/lab/experiments/022-data-model-mvvm/check.js` — 10/10 ✅
