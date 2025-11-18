# Working Notes: 2025-11-15 Control Map Registration

## 2025-11-15
- Session created to document how client contexts learn about custom controls.
- Need to inspect vendor `page-context.js` for `update_Controls` implementation.
- Next: trace how `map_Controls` is consumed during hydration and where `src/ui/client/index.js` intercepts the flow.
- `vendor/jsgui3-client/client.js` defines `jsgui.update_standard_Controls(context)` which simply iterates `jsgui.controls` and calls `context.update_Controls(name, ControlSubclass)`.
- `Client_Page_Context` inherits the `update_Controls` implementation from `html-core/page-context.js`, storing constructors in `context.map_Controls[name]` (lowercase key) alongside an instance map `map_controls`.
- `src/ui/client/index.js` registers custom controls via `registerControlType`, mirrors vendor behavior by overriding `jsguiClient.update_standard_Controls`, and injects controls during `pre_activate` plus `Client_Page_Context` construction to ensure every new context has `map_Controls[key] = ControlClass` with lowercased keys.
- Captured the complete lifecycle (global registry → vendor activate → Copilot injection) in `CONTROL_MAP.md` so future agents know which objects hold constructors versus live instances.
