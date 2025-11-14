# jsgui Data-Binding Simplification Plan

**Date:** 2025-11-19  
**Author:** GitHub Copilot (GPT-5.1-Codex Preview)  
**Scope:** Document a concrete approach for simplifying `jsgui3-html` bindings based on static analysis of the current MVVM stack and recent work on `PagerButtonControl`.

## 1. Current Binding Surface (Static Analysis Summary)
- `html-core/Data_Model_View_Model_Control.js` now ships a `BindingManager`, but the constructor only logs `change` events for `data.model` and `view.data.model`. No synchronization happens unless a control explicitly calls `this.bind(...)`, so most legacy controls never populate their view models.
- `html-core/ModelBinder.js` already implements bidirectional bindings (transform/reverse hooks, conditional guards, computed properties, property watchers). Nothing in the renderer serializes bindings or guarantees DOM attributes point back to models, so `data-jsgui-data-model`/`data-jsgui-view-model` are often missing on the client side.
- `Control_Data` and `Control_View` are lightweight wrappers that make `data.model` / `view.data.model` available, but they never unwrap `Data_Value` instances coming from `lang-tools`. Callers must remember to do this manually (e.g., `src/ui/controls/PagerButton.js` added a custom `unwrapModelValue` helper to fix disabled toggles).
- Static search (`node tools/dev/js-scan.js --dir node_modules/jsgui3-html --search Data_Value --limit 50 --json`) returned zero matches, confirming that `Data_Value` is only declared in `lang-tools` and never specialized here. That means any binding fix must either (a) augment `lang-tools` itself or (b) add thin adapters inside `jsgui3-html` before emitting DOM.

## 2. Pain Points We Encountered
1. **Manual unwrapping everywhere:** `Data_Object` emits `Data_Value` wrappers for primitives. Without a shared helper, every control repeats the logic we added in `PagerButtonControl#_handleModelChange` to coerce `evt.value.value()` back into booleans/strings.
2. **Bindings lost after SSR:** When the server renders controls without `data-jsgui-data-model` / `data-jsgui-view-model` attributes, the client-side `pre_activate` logic cannot reattach existing models. Any bindings configured in the constructor are effectively discarded once the HTML leaves the process.
3. **Verbose one-off wiring:** `this.bind({ ... })` is powerful but wordy. For simple use-cases (e.g., map `data.model.value` → `view.data.model.disabled`), authors still reach for manual event listeners because the binding DSL lives three levels deep.

## 3. Proposed Simplifications
### 3.1 Auto-bind `value` ↔ `disabled` / `text` shorthands
- **Location:** `html-core/Data_Model_View_Model_Control.js`
- **Change:** Extend the constructor to inspect `spec.bindingHints` (or default heuristics) and call `this.bind(...)` automatically for common pairings:
  - `data.model.value` → `view.data.model.value`
  - `data.model.enabled` ⇄ `view.data.model.disabled`
  - `data.model.kind` → `view.data.model.kind`
- **Benefit:** Simple controls (buttons, labels, toggles) get working bindings without extra boilerplate.

### 3.2 Centralize Data_Value unwrapping
- **Location:** `lang-tools` (preferred) or `jsgui3-html/html-core/ModelBinder.js`
- **Change:** Add `normalizeBindingValue(value)` that returns primitives for `Data_Value` instances, arrays, or nested objects. Call it in `_setupBinding` before emitting to the target model.
- **Benefit:** Eliminates duplicate helpers such as `unwrapModelValue` and prevents bugs when toggling booleans.

### 3.3 Persist bindings via DOM attributes
- **Location:** `control-enh.js` + `html-core/pre_activate`
- **Change:** When a control registers a binding, append a serialized description to `this.dom.attributes['data-jsgui-bindings']`. During `pre_activate`, parse that JSON and recreate `BindingManager` instances before `activate()` fires.
- **Benefit:** Server-rendered pages retain their binding graph on the client, so we no longer lose state when navigating or refreshing.

### 3.4 Provide a thin `Control.bindToAttributes()` helper
- **Location:** New helper in `html-core/Data_Model_View_Model_Control.js`
- **Shape:**
  ```javascript
  this.autoBindAttributes({
    disabled: { attr: 'aria-disabled', invert: true },
    kind: { attr: 'data-kind' },
    href: { attr: 'href', guard: (v) => typeof v === 'string' }
  });
  ```
- **Behavior:** Registers watchers on `view.data.model` and updates DOM attributes/classes without hand-written listeners.
- **Benefit:** Pager buttons and similar controls move from custom `on('change')` blocks to declarative metadata.

## 4. Implementation Plan
| Step | Owner | Description |
| --- | --- | --- |
| 1 | jsgui core | Add `bindingHints` support + default value/kind/disabled bindings inside the `Data_Model_View_Model_Control` constructor. |
| 2 | lang-tools | Export `Data_Value.normalize(value)` and use it inside `ModelBinder` + event payloads. |
| 3 | jsgui core | Extend `Control` serialization so controls emit `data-jsgui-bindings` metadata and `pre_activate` restores bindings. |
| 4 | copilot-dl-news UI | Refactor `PagerButtonControl` to rely on `autoBindAttributes` once upstream pieces exist, removing bespoke listeners/tests. |
| 5 | Docs | Update `docs/ui` with migration guidance (this file) and add a short recipe to `docs/AGENT_REFACTORING_PLAYBOOK.md` once the helpers land. |

## 5. Risks & Mitigations
- **Risk:** Serialized binding metadata could bloat HTML. *Mitigation:* Store only binding IDs in DOM and keep full definitions inside the shared `context.map_bindings` table (similar to controls).
- **Risk:** Auto-binding might clash with complex controls that already wire models manually. *Mitigation:* Support `spec.disableAutoBinding` or require explicit `bindingHints:false` to opt out.
- **Risk:** `lang-tools` changes affect other packages. *Mitigation:* Introduce `Data_Value.normalize` as a purely additive helper and keep existing APIs untouched.

## 6. Next Steps for This Repo
1. Track upstream changes (jsgui3-html + lang-tools) and upgrade package versions once helpers ship.
2. Remove custom `unwrapModelValue` logic from `src/ui/controls/PagerButton.js` and replace it with the shared normalizer.
3. Add regression coverage to `src/ui/test/pager-button-state.js` for the new declarative binding path.
4. Document binding expectations in `docs/sessions/2025-11-19-jsgui-binding-report/FOLLOW_UPS.md` once upstream merges complete.

## 7. Stopgap Plugin (Implemented Here)
- **Location:** `src/ui/jsgui/bindingPlugin.js` installs at runtime via `installBindingPlugin(jsgui)`, extending the existing prototypes without touching `node_modules/`.
- **Capabilities:**
  - `Control.prototype.ensureBindingViewModel()` / `ensureBindingDataModel()` to provision `Data_Object` instances and wire `data-jsgui-*` attributes automatically.
  - `Control.prototype.bindDataToView()` wraps `this.bind()` so the default `data.model → view.data.model` sync lives outside upstream code.
  - `Control.prototype.bindViewToAttributes()` declaratively maps view-model props to DOM attributes/classes with optional callbacks (used by `PagerButtonControl`).
  - Built-in `normalizeValue`, boolean helpers, and lifecycle-aware watcher cleanup (hooks `destroy`).
- **Consumers:** `src/ui/controls/PagerButton.js` now demonstrates how to install the plugin and rely entirely on the shared helpers.
- **Tests:** `tests/ui/binding-plugin.test.js` covers the helper surface plus PagerButton integration; run with `npm run test:by-path tests/ui/binding-plugin.test.js`.
