# Working Notes – z-server UI auto-rebuild + build status

## Guardrail

- The `🧠 Memory pull (for this task) — ...` line is transparency only and must not end execution. Always follow it with `Back to the task: ...` and continue immediately after memory retrieval unless explicitly asked to stop or genuinely blocked.

- 2025-12-14 — Session created via CLI. Add incremental notes here.

## Implementation notes

- Added a shared `getClientBundleStatus()` helper so z-server can detect whether `public/assets/ui-client.js` is stale.
- z-server main process now exposes IPC for ui-client status + rebuild, and can optionally ensure the ui-client bundle before launching a UI server.
- z-server UI now shows:
	- `\ud83d\udd28 Rebuild UI` button (enabled only when stale)
	- `Auto rebuild UI on start` toggle (persisted via localStorage)

## Validation

- Ran `npm run test:by-path tests/ui/server/ensureClientBundleStatus.test.js` (passed).

- 2025-12-14 05:40 — 
## 2025-12-14 — Data_Model bridge experiments implemented

### Experiment 021 (MVC) — PASS ✅
- Created `src/ui/lab/experiments/021-data-model-mvc/`
- Demonstrates:
  - Server encodes `Data_Object` via `toJSON()` → `"Data_Object({...})"` string
  - String shipped in `data-jsgui-fields` (SSR bridge)
  - Client decodes persisted fields and populates live `Data_Object`
  - Controller (button click) mutates `data.model.set("count", n)`
  - View listens to model `change` event and updates DOM
- All 9 assertions pass

### Experiment 022 (MVVM) — PASS ✅
- Created `src/ui/lab/experiments/022-data-model-mvvm/`
- Demonstrates:
  - Same encoded Data_Object SSR bridge as MVC
  - Uses `ensure_control_models(this, {})` to create `data.model` + `view.data.model`
  - Binding: `data.model.count` → `view.data.model.displayCount`
  - View model → DOM rendering via `change` event
- Key finding: **must call `ensure_control_models` in activate()** because client-side reconstruction doesn't run the constructor server path
- Key finding: **`model.set(key, value, true)` suppresses change events** — the third arg is "silent"; remove it to fire events

### Low-level hypotheses / upstream fix candidates

1. **`ensure_control_models` not called on client-side activation**
   - When a control is reconstructed from DOM (`spec.el` present), the constructor skips `ensure_control_models`
   - Workaround: call `ensure_control_models(this, {})` in `activate()`
   - Potential upstream fix: have `Data_Model_View_Model_Control` call it in `pre_activate` unconditionally

2. **`model.set(key, value, silent=true)` suppresses change events**
   - This is by design but easy to forget
   - The third arg is "silent" — when true, no `change` event fires
   - Best practice: only use silent=true for initial population, not for user-triggered updates

3. **"Missing context.map_Controls" warnings**
   - Generic HTML tags like `style`, `main`, `span` don't have registered control classes
   - These fall back to generic Control — this is noise but not harmful
   - Potential upstream fix: suppress logging for known HTML tags or add them to a whitelist

4. **"&&& no corresponding control" warnings**
   - Appear during pre_activate when child controls aren't found by id
   - Root cause: some controls emit `data-jsgui-id` but don't register in `context.map_controls`
   - This is a candidate for deeper investigation

### Manifest updated
- Added experiments 021 and 022 to `src/ui/lab/manifest.json`
