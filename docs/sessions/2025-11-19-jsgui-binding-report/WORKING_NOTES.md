# Working Notes — 2025-11-19 jsgui Binding Report

## TODO
- [x] Inventory existing binding helpers inside `node_modules/jsgui3-html`
- [x] Map how `Data_Value` objects propagate through controls and render output
- [x] Identify friction points we hit when wiring pager buttons
- [x] Draft concise recommendations + upgrade path

## Findings
- `node tools/dev/js-scan.js --dir node_modules/jsgui3-html --search Data_Value --limit 50 --json` returned zero matches, so the `Data_Value` class is only exposed through `lang-tools` and not defined inside this package. Any inspection has to look at `lang-tools` directly if we need class internals.
- `html-core/Data_Model_View_Model_Control.js` wires both `data.model` and `view.data.model` but only logs `change` events; no default sync happens unless a control author calls `this.bind(...)`. Controls that forget to call `bind` end up with inert data models.
- `ModelBinder.js` already implements bidirectional binding (transform + reverse hooks, conditional guards, computed properties, property watchers), but nothing automatically attaches DOM attributes or serializes binding definitions. This is the place to hook simplified helpers.
- `Control_Data` and `Control_View` are thin wrappers that just ensure `data.model` / `view.data.model` exist. They do not standardize value unwrapping, so downstream code receives `Data_Value` objects and must unwrap manually (the source of the pager-button toggle bug).
- Implemented a stopgap plugin (`src/ui/jsgui/bindingPlugin.js`) that installs new helpers (`ensureBindingViewModel`, `bindDataToView`, `bindViewToAttributes`, etc.) without touching upstream packages; `PagerButtonControl` is now the first consumer.

## Open Questions
- How do we serialize `BindingManager` metadata without bloating `data-*` attributes? (Maybe store tokens and look up definitions in `context`.)
- Should `lang-tools` expose `Data_Value.normalize` or should `jsgui3-html` shim it locally to avoid cross-package releases?
