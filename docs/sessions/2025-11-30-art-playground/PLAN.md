# Plan – Art Playground - Interactive SVG Component Editor

## Objective
Build an interactive SVG component editor with click-to-select, resize handles, and drag-to-move as a stepping stone toward the decision tree editor.

## Done When
- [x] Server renders the page correctly (no errors)
- [x] Client activates without errors (verified via console capture)
- [x] Click on a component selects it (shows resize handles)
- [x] Drag a selected component moves it
- [x] Resize handles work to resize components ✅ **FIXED - 248 tests passing**
- [x] Toolbar buttons add new components (Rectangle, Ellipse, Text)
- [x] Delete button removes selected component
- [ ] App appears in z-server scan

## Architecture

### Key Insight from Working Examples
The Design Studio and Docs Viewer follow this pattern:

1. **Isomorphic jsgui resolver** - `isomorphic/jsgui.js` uses `require("../../shared/isomorphic/jsgui")` which returns:
   - Server: `jsgui3-html`
   - Client: `jsgui3-client` (detected via `typeof window !== "undefined"`)

2. **Controls check for `spec.el`** - If `el` is passed, skip `compose()`:
   ```javascript
   constructor(spec = {}) {
     super({ ...spec, tagName: "div" });
     this.add_class("my-control");
     this.dom.attributes["data-jsgui-control"] = "my_control";
     
     if (!spec.el) {
       this.compose();  // Only on server
     }
   }
   ```

3. **Client uses `data-jsgui-control` attribute** to find and activate controls:
   ```javascript
   const elements = document.querySelectorAll("[data-jsgui-control]");
   elements.forEach(el => {
     const ControlClass = CONTROL_TYPES[el.getAttribute("data-jsgui-control")];
     const control = new ControlClass({ context, el });
     control.dom.el = el;
     control.activate();
   });
   ```

4. **Build script** uses esbuild with:
   - `platform: "browser"`
   - `format: "iife"`
   - `alias` for htmlparser shim
   - Output to `public/` folder

### Art Playground Structure

```
src/ui/server/artPlayground/
├── server.js                    # Express server (port 4950)
├── client.js                    # Client entry point (esbuild bundles this)
├── public/
│   ├── art-playground.css       # Styles
│   └── art-playground-client.js # Bundled client (output)
├── shims/
│   └── htmlparser-shim.js       # Browser shim for htmlparser
└── isomorphic/
    ├── jsgui.js                 # Points to shared resolver
    └── controls/
        ├── index.js
        ├── ArtPlaygroundAppControl.js   # Main app layout
        ├── ToolbarControl.js            # Tool buttons
        ├── CanvasControl.js             # SVG editing surface
        ├── SelectionHandlesControl.js   # Resize handles
        └── ComponentControl.js          # Base for visual components
```

### Control Architecture

| Control | `data-jsgui-control` | Purpose |
|---------|---------------------|---------|
| ArtPlaygroundAppControl | `art_app` | Main layout (toolbar + canvas) |
| ToolbarControl | `art_toolbar` | Tool/action buttons |
| CanvasControl | `art_canvas` | SVG editing surface, handles selection/drag |
| SelectionHandlesControl | `art_selection` | 8 resize handles around selected element |

### Key Patterns to Follow

1. **Use `add_class()` not `_dom.className`** - jsgui3-html API
2. **Use `this.dom.attributes["key"] = val`** - for HTML attributes
3. **Use `new jsgui.String_Control({ text: "..." })`** - for text content
4. **Mark controls with `data-jsgui-control`** - for client activation
5. **Check `if (!spec.el)` before compose** - skip on client hydration

### Canvas Interaction Model

The Canvas control handles all mouse interaction:
- `mousedown` on component → select + start drag
- `mousedown` on empty space → deselect
- `mousemove` during drag → update position
- `mouseup` → end drag

Selection handles emit events that Canvas listens to:
- `resize-start` → record original bounds
- `resize-move` → compute new bounds from delta
- `resize-end` → finalize

### Data Model

Components stored in a Map inside CanvasControl:
```javascript
this._components = new Map(); // id -> { type, el, x, y, width, height, fill, ... }
```

SVG elements are created dynamically with `document.createElementNS()` on client activation.

## Change Set
- `src/ui/server/artPlayground/isomorphic/jsgui.js` - Point to shared resolver
- `src/ui/server/artPlayground/isomorphic/controls/*.js` - Use correct jsgui3 API
- `src/ui/server/artPlayground/client.js` - Follow Design Studio pattern
- `src/ui/server/artPlayground/server.js` - Fix paths
- `scripts/build-art-playground-client.js` - Match Design Studio's config

## Risks & Mitigations
- SVG manipulation happens client-side only (components created after activation)
- Server renders empty SVG container; client populates it
- No persistence yet (components reset on page reload)

## Tests / Validation
- Console capture tool: `node tools/dev/ui-console-capture.js --url="http://localhost:4950"`
- Manual testing of click, drag, resize, add, delete
