# Working Notes – jsgui3 Data_Model server→client bridge labs (MVC + MVVM)

- 2025-12-14 — Session created via CLI.

## Experiment 021 (MVC) — PASS ✅

Created `src/ui/lab/experiments/021-data-model-mvc/`

**Demonstrates:**
- Server encodes `Data_Object` via `toJSON()` → `"Data_Object({...})"` string
- String shipped in `data-jsgui-fields` (SSR bridge)
- Client decodes persisted fields and populates live `Data_Object`
- Controller (button click) mutates `data.model.set("count", n)`
- View listens to model `change` event and updates DOM

All 9 assertions pass.

## Experiment 022 (MVVM) — PASS ✅

Created `src/ui/lab/experiments/022-data-model-mvvm/`

**Demonstrates:**
- Same encoded Data_Object SSR bridge as MVC
- Uses `ensure_control_models(this, {})` to create `data.model` + `view.data.model`
- Binding: `data.model.count` → `view.data.model.displayCount`
- View model → DOM rendering via `change` event

**Key findings:**
- Must call `ensure_control_models` in `activate()` because client-side reconstruction doesn't run the constructor server path
- `model.set(key, value, true)` uses silent=true which suppresses change events—remove third arg for reactive updates

All 10 assertions pass.

## Low-level hypotheses / upstream fix candidates

1. **`ensure_control_models` not called on client-side activation**
   - When a control is reconstructed from DOM (`spec.el` present), the constructor skips `ensure_control_models`
   - Workaround: call `ensure_control_models(this, {})` in `activate()`
   - Potential upstream fix: have `Data_Model_View_Model_Control` call it in `pre_activate` unconditionally

2. **`model.set(key, value, silent=true)` suppresses change events**
   - This is by design but easy to forget
   - Best practice: only use silent=true for initial population, not for user-triggered updates

3. **"Missing context.map_Controls" warnings** — noise but not harmful; generic HTML tags fall back to generic Control

4. **"&&& no corresponding control" warnings** — some controls emit `data-jsgui-id` but don't register in `context.map_controls`; candidate for deeper investigation
