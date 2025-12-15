# Session Summary – jsgui3 Data_Model server→client bridge labs (MVC + MVVM)

## Accomplishments
- Created **Experiment 021** (MVC): demonstrates Data_Object encoded state crossing SSR→client activation, with controller→view updates via `change` events
- Created **Experiment 022** (MVVM): extends MVC with `data.model` → `view.data.model` binding layer using `ensure_control_models`
- Both experiments pass deterministic Puppeteer checks (9/9 and 10/10 assertions ✅)
- Added both experiments to `src/ui/lab/manifest.json`
- Documented lessons in memory system (LESSONS.md) and added a reusable pattern (PATTERNS.md)

## Metrics / Evidence
- `node src/ui/lab/experiments/021-data-model-mvc/check.js` — 9/9 ✅
- `node src/ui/lab/experiments/022-data-model-mvvm/check.js` — 10/10 ✅

## Decisions
- Used `data-jsgui-fields` as the SSR bridge (same mechanism as experiment 020)
- Used `Data_Object.toJSON()` encoding (produces `"Data_Object({...})"` wrapper)
- Called `ensure_control_models` in `activate()` rather than creating a custom base class

## Next Steps
- Investigate "&&& no corresponding control" warnings to understand why some controls don't register in `context.map_controls`
- Consider upstream PR to have `Data_Model_View_Model_Control.pre_activate` call `ensure_control_models` unconditionally
- Explore using `ModelBinder` class directly instead of manual event wiring for more declarative bindings
