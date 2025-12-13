# Control Registration Flow (`map_Controls`)

Canonical reference: the consolidated “activation” workflow and registry distinctions live in [docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md](../../guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md#client-side-activation-flow-critical). This session note preserves the deep dive and historical debugging context.

This note explains how jsgui3 client contexts discover control constructors and why our bundle hooks into that pipeline. The goal is to show how new controls (UrlListingTable, UrlFilterToggle, PagerButton, etc.) make their way into `context.map_Controls` so hydration and Puppeteer tests can construct them.

## 1. Global constructor registry (`jsgui.controls` and `jsgui.map_Controls`)
- Every control module calls `registerControlType(typeName, ControlClass, { jsguiInstance })`.
- That helper sets `ControlClass.prototype.__type_name` (if needed), stores the constructor inside `jsgui.controls[typeName]`, mirrors it into `jsgui.map_Controls[typeName]`, and exposes it as a direct property (e.g., `jsgui.url_listing_table`).
- Our `src/ui/client/index.js` imports each custom control and invokes `registerControlType`, ensuring the constructors live inside the vendor client instance **before** any page context exists.

## 2. Vendor activation copies globals into each page context
`vendor/jsgui3-client/client.js` owns the browser bootstrap. When `window.onload` fires it:
1. Creates a `page_context` via `new jsgui.Client_Page_Context({ document })`.
2. Calls `jsgui.update_standard_Controls(page_context)`.

`update_standard_Controls` simply loops `jsgui.controls` and passes every `[name, ControlClass]` pair to `page_context.update_Controls(name, ControlClass)`:
```js
jsgui.update_standard_Controls = (page_context) => {
  each(jsgui.controls, (Control_Subclass, name) => {
    page_context.update_Controls(name, Control_Subclass);
  });
};
```

## 3. `page_context.update_Controls` populates `map_Controls`
`Client_Page_Context` inherits `Page_Context` (`vendor/jsgui3-client/node_modules/jsgui3-html/html-core/page-context.js`). Its `update_Controls` implementation:
- Lowercases the provided type name.
- Writes the constructor into `context.map_Controls[name]`.
- Maintains a separate `context.map_controls` object that tracks instantiated controls by id (hydration uses this to wire up server-rendered DOM nodes).

As a result, every new browser context receives a private constructor map keyed by lowercase type names. Hydration relies on `map_Controls` to resolve `__type_name` attributes found in server markup.

## 4. Copilot bundle hooks (bridging gaps)
The raw vendor flow only knows about controls that shipped inside `vendor/jsgui3-client`. Our bundle layers on top to ensure custom controls are registered everywhere the vendor expects them:

- **`ensureClientControlsRegistered()`** imports UrlListingTable/FilterToggle/PagerButton and calls `registerControlType` once per constructor. This seeds `jsguiClient.controls` and `jsguiClient.map_Controls` just like upstream controls.
- **`seedContextControlMap(context)`** clones all keys from `jsguiClient.map_Controls` and `jsguiClient.controls` into `context.map_Controls` the first time we touch that context. This guarantees parity even if the vendor never ran `update_standard_Controls` yet.
- **`injectControlsIntoContext(context)`** calls `seedContextControlMap` and then explicitly adds each custom control (safely lowercased). If `context.update_Controls` exists we delegate to it so any future vendor behavior stays consistent.
- **Lifecycle hooks**
  - `wrapPreActivate` ensures our injection runs before anyone else’s `jsgui.pre_activate` logic.
  - We wrap `jsguiClient.update_standard_Controls` to inject controls before the vendor loops globals.
  - We subclass `Client_Page_Context` so `injectControlsIntoContext` runs directly after the base constructor.

These hooks mean any path that creates a `Client_Page_Context` (vendor activate, tests creating contexts manually, etc.) receives the same constructor map as server-rendered pages.

## 5. Usage guidance
1. **When adding a new control**
   - Export it from `src/ui/controls/...`.
   - Import and add it to `CLIENT_CONTROLS` in `src/ui/client/index.js`.
   - The shared helper registers it with the vendor instance and ensures all contexts see it.
2. **During debugging**
   - Check `context.map_Controls` in the browser console; it should include your lowercase type name.
   - Remember `map_controls` (lowercase) stores instances, not constructors. Missing constructors point to registration issues; missing instances typically mean hydration never ran for that DOM node.
3. **Testing**
   - Rebuild `ui-client.js` after changing the control list (`npm run build:ui-client`).
   - Puppeteer tests rely on the bundle logging `[copilot] context.map_Controls keys` the first time injection runs, which makes it easy to confirm the registry contains the custom controls.

With this pipeline documented, future UI agents can extend the control set (or the binding plugin) without guessing where constructors must be registered.
