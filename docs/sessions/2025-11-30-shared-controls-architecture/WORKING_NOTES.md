# Working Notes – Shared Controls Architecture & WYSIWYG Drawing Foundation

- 2025-11-30 — Session created via CLI. Add incremental notes here.

## Implementation Complete ✅

### Controls Created

| Control | Location | Status |
|---------|----------|--------|
| `DraggableControl` | `interactive/DraggableControl.js` | ✅ Complete |
| `SelectableControl` | `interactive/SelectableControl.js` | ✅ Complete |
| `CanvasControl` | `canvas/CanvasControl.js` | ✅ Complete |
| `ShapeControl` + shapes | `canvas/ShapeControl.js` | ✅ Complete |
| `ToolboxControl` | `ui/ToolboxControl.js` | ✅ Complete |

### Directory Structure Implemented

```
src/ui/server/shared/isomorphic/controls/
├── index.js                          # Main re-export
├── ResizableSplitLayoutControl.js    # Existing (unchanged)
├── interactive/
│   ├── index.js
│   ├── DraggableControl.js           # Wraps dragable mixin
│   └── SelectableControl.js          # Wraps selectable mixin
├── canvas/
│   ├── index.js
│   ├── CanvasControl.js              # Drawing surface
│   └── ShapeControl.js               # Base + Diamond/Rectangle/Ellipse/Parallelogram
├── ui/
│   ├── index.js
│   └── ToolboxControl.js             # Tool palette
└── layout/
    └── index.js                      # Re-exports ResizableSplitLayoutControl
```

---

## jsgui3-html Mixin Research (CRITICAL KNOWLEDGE)

### Location
**Path:** `jsgui3-html/control_mixins/`

### Available Mixins

| Mixin | File | Purpose |
|-------|------|---------|
| `dragable` | `dragable.js` | Drag-and-drop functionality |
| `selectable` | `selectable.js` | Selection with single/multi/toggle modes |
| `resizable` | `resizable.js` | Resize handles |
| `drag_like_events` | `drag_like_events.js` | Base for drag-like operations |
| `coverable` | `coverable.js` | Cover/overlay behavior |
| `deletable` | `deletable.js` | Delete key handling |
| `popup` | `popup.js` | Popup positioning |
| `display-modes` | `display-modes.js` | Display state management |
| `press-events` | `press-events.js` | Click/press event handling |

### Dragable Mixin Deep Dive

```javascript
// Import
const dragable = require('jsgui3-html/control_mixins/dragable');

// Usage
dragable(ctrl, opts);

// Options
{
  mode: 'translate' | 'within-parent' | 'x',  // Default: 'translate'
  bounds: Control,           // Constrain to this control's bounds
  handle: Control,           // Only drag from this handle
  start_distance: number,    // Min pixels before drag starts (default: 0)
  start_action: string[],    // Events: ['touchstart', 'mousedown']
  condition: () => boolean   // Function to check before starting drag
}
```

**Modes Explained:**
- `translate` - Uses CSS `transform: translate3d()` - best performance, no layout thrashing
- `within-parent` - Uses `position: absolute; left/top` - element stays in document flow bounds
- `x` - Horizontal only with `translateX()`

**Events Emitted:**
- `dragstart` - When drag begins
- `dragend` - When drag ends, includes `movement_offset: [deltaX, deltaY]`

**Key Implementation Details:**
- Touch support built-in with `touchstart`/`touchmove`/`touchend`
- Uses `bcr()` (bounding client rect) for position calculations
- Server-side safe - checks for `document` before binding
- Stores mixin info in `ctrl.view.data.model.mixins` for SSR

### Selectable Mixin Deep Dive

```javascript
// Import
const selectable = require('jsgui3-html/control_mixins/selectable');

// Usage
selectable(ctrl, handle?, opts);

// Options
{
  toggle: boolean,           // Click toggles selection
  multi: boolean,            // Ctrl/Cmd+click for multi-select
  single: boolean,           // Force single selection
  selection_action: string[] | string,  // Default: ['mousedown', 'touchstart']
  condition: () => boolean,  // Check before selection
  preventDefault: boolean,   // Default: true
  handle: Control            // Click target
}
```

**State:**
- `ctrl.selectable` - Boolean, whether selection is enabled
- `ctrl.selected` - Boolean, current selection state

**Events:**
- `select` - When selected
- `deselect` - When deselected
- `change` - With `{ name: 'selected', value: boolean }`

**Selection Scope:**
- Works with `find_selection_scope()` to locate parent selection manager
- Supports `action_select_only()`, `action_select_toggle()`, `select()`, `deselect()`

---

## Design Decisions

### 1. No Factory Controls ✅
**Decision:** Use direct `new ControlClass({ context, ...spec })` instantiation
**Rationale:** 
- Simpler, more explicit
- Easier to understand control relationships
- `compose()` method naturally handles child creation
- Factories add unnecessary indirection for this use case

### 2. Wrap Mixins in Control Classes ✅
**Decision:** Create control classes that apply mixins internally
**Rationale:**
- Cleaner API for consumers
- Encapsulates mixin configuration
- Provides type safety via JSDoc
- Allows additional functionality (events, state)

**Example:**
```javascript
// Instead of manually applying mixin:
dragable(myCtrl, { mode: 'translate', bounds: parent });

// Use the wrapper:
const draggable = new DraggableControl({
  context,
  dragMode: 'translate',
  constrainToParent: true
});
```

### 3. Data Attributes for Hydration ✅
All shared controls store config in `_fields` for server-pre-render event, enabling client hydration from server-rendered HTML.

---

## Audit Findings (Original)

### Existing Shared Controls Location
**Found at:** `src/ui/server/shared/isomorphic/controls/`

This is the canonical location for repo-wide shared isomorphic controls. Currently contains:
- `ResizableSplitLayoutControl.js` - Excellent example of well-documented, properly structured control

### Pattern Analysis

**ResizableSplitLayoutControl** demonstrates the ideal pattern:
```javascript
// Constructor pattern - NO factories
class MyControl extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: "div", __type_name: "my_control" });
    // Store config
    // Set attributes for hydration
    if (!spec.el) {
      this.compose();
    }
  }
  
  compose() {
    // Build child controls using direct constructors
    const child = new jsgui.Control({ context: this.context, tagName: "div" });
    this.add(child);
  }
  
  activate() {
    // Client-side event binding
  }
}
```

### Current Control Locations Audit

| Location | Control | Shareable? | Notes |
|----------|---------|------------|-------|
| `src/ui/server/shared/isomorphic/controls/` | ResizableSplitLayoutControl | ✅ Already shared | Well documented |
| `src/ui/server/docsViewer/isomorphic/controls/` | ContextMenuControl | ✅ Should share | Generic context menu |
| `src/ui/server/docsViewer/isomorphic/controls/` | TreeControl (DocNavControl) | ⚠️ Partially | Tree rendering is generic |
| `src/ui/server/docsViewer/isomorphic/controls/` | DocsThemeToggleControl | ⚠️ Partially | Theme toggle pattern |
| `src/ui/controls/` | Table.js | ✅ Should share | Generic table |
| `src/ui/controls/` | PagerButton.js | ✅ Should share | Pagination |
| `src/ui/controls/` | Sparkline.js | ✅ Should share | Data viz |
| `src/ui/controls/` | UrlFilterToggle.js | ❌ App-specific | URL domain logic |
| `src/ui/controls/` | DiagramAtlasControls.js | ❌ App-specific | Diagram-specific |
| `z-server/ui/controls/` | zServerControlsFactory.js | ❌ Uses factory pattern | Should refactor |

---

## Follow-ups / TODO

1. ☐ Create CSS file for shared controls styling (`shared-controls.css`)
2. ☐ Build simple WYSIWYG demo app using these controls
3. ☐ Add ConnectorControl for lines between shapes (decision tree specific)
4. ☐ Extract ContextMenuControl from docsViewer to shared
5. ☐ Consider adding ResizableControl wrapper for resizable mixin

