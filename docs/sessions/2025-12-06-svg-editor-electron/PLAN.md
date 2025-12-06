# Plan: Interactive SVG Editor in Electron with jsgui3 Windows

## Objective
Build an Electron app where users can:
1. Load and view SVG diagrams
2. Click to select specific SVG elements (with visual highlighting)
3. Right-click to get a context menu with options
4. Request AI agent to generate new SVGs based on selections
5. Display generated SVGs in floating jsgui3 windows within the app

## Done When
- [ ] SVG elements are selectable with visual highlighting
- [ ] Context menu appears on right-click with relevant options
- [ ] "Generate new SVG" option triggers AI agent workflow
- [ ] New SVG displays in a draggable jsgui3 window inside the app
- [ ] Multiple windows can be open simultaneously

---

## Current State Assessment

### What We Have ✅

| Component | Location | Status |
|-----------|----------|--------|
| **Electron App (z-server)** | `z-server/` | Working - has jsgui3-client, IPC, dark theme |
| **SelectableControl** | `src/ui/server/shared/isomorphic/controls/interactive/SelectableControl.js` | Complete - wraps selectable mixin |
| **DraggableControl** | `src/ui/server/shared/isomorphic/controls/interactive/DraggableControl.js` | Complete - for window dragging |
| **SVG Renderer** | `src/ui/server/shared/utils/svgRenderer.js` | Parses SVG to jsgui3 controls |
| **Art Playground Canvas** | `src/ui/server/artPlayground/` | Has selection handles, SVG editing patterns |
| **Context Menu Pattern** | `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md:1322` | Documented pattern, not yet implemented |
| **jsgui3 Isomorphic Setup** | `src/ui/server/shared/isomorphic/` | Works server + client |

### What We Need to Build 🔨

| Component | Complexity | Description |
|-----------|------------|-------------|
| **SVGViewerControl** | Medium | Load SVG, make elements selectable |
| **ContextMenuControl** | Medium | Right-click menu with actions |
| **FloatingWindowControl** | Medium | Draggable, resizable container |
| **AI Generation Bridge** | High | IPC to request AI SVG generation |
| **SVG Editor App** | Medium | Main app orchestrating all pieces |

---

## Gap Analysis

### Gap 1: No ContextMenuControl Implementation
**Status**: Pattern documented but not implemented  
**Effort**: 2-3 hours  
**Solution**: Create isomorphic ContextMenuControl following the documented pattern

### Gap 2: ~~No FloatingWindowControl~~ ✅ SOLVED
**Status**: **jsgui3 has built-in `Window` control!**  
**Effort**: 0 hours  
**Solution**: Use `jsgui.Window` directly - it has:
- Draggable via title bar
- Resizable (bottom-right handle)  
- Minimize/Maximize/Close buttons
- Z-index management (`bring_to_front_z()`)
- Smooth animations (`glide_to_pos()`)
- Built-in CSS

**Documentation**: See [docs/guides/JSGUI3_WINDOW_CONTROL_GUIDE.md](../../guides/JSGUI3_WINDOW_CONTROL_GUIDE.md)

### Gap 3: SVG Element Selection Not Wired
**Status**: SelectableControl exists, not applied to SVG elements  
**Effort**: 3-4 hours  
**Solution**: Create SVGElementControl that:
- Wraps individual SVG elements (g, rect, text, path, etc.)
- Applies selectable mixin
- Emits selection events with element data
- Draws highlight overlay on selection

### Gap 4: AI Generation IPC Bridge
**Status**: Electron IPC exists, no AI integration  
**Effort**: 4-6 hours  
**Solution**: 
- Main process handler for AI requests
- Use MCP tools or spawn Copilot CLI
- Return generated SVG content

### Gap 5: New Electron App or Extend z-server
**Decision Needed**: Create new app or add to z-server?  
**Recommendation**: Create new Electron app `svg-studio/` for clean separation

---

## Implementation Phases

### Phase 1: Foundation (4-6 hours)
Build core controls without AI integration

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 1: Core Controls                                         │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  1.1 FloatingWindowControl                                     │
│      ├── Title bar (draggable handle)                          │
│      ├── Close button                                          │
│      ├── Content container                                     │
│      └── Optional resize handles                               │
│                                                                │
│  1.2 ContextMenuControl                                        │
│      ├── Menu items with icons                                 │
│      ├── Keyboard navigation                                   │
│      ├── Click-outside-to-close                                │
│      └── Position at cursor                                    │
│                                                                │
│  1.3 SelectableSVGElementControl                               │
│      ├── Wrap SVG <g> elements                                 │
│      ├── Selection highlight overlay                           │
│      ├── Emit 'element-selected' events                        │
│      └── Support multi-select with Ctrl                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Phase 2: SVG Viewer App (4-6 hours)
Electron app with SVG loading and selection

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 2: SVG Viewer Electron App                               │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  2.1 Create svg-studio/ directory structure                   │
│      ├── main.js (Electron main process)                       │
│      ├── preload.js (IPC bridge)                               │
│      ├── renderer.src.js (jsgui3-client entry)                 │
│      ├── index.html                                            │
│      └── ui/controls/                                          │
│                                                                │
│  2.2 SVGViewerControl                                          │
│      ├── Load SVG from file or URL                             │
│      ├── Parse to jsgui3 controls                              │
│      ├── Wrap top-level groups as SelectableSVGElements        │
│      └── Zoom/pan controls                                     │
│                                                                │
│  2.3 Wire Context Menu                                         │
│      ├── Right-click on selected element                       │
│      ├── Show menu with options                                │
│      └── Actions: Copy, Inspect, Generate New, Export          │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Phase 3: AI Integration (6-8 hours)
Connect to AI agent for SVG generation

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 3: AI Generation Pipeline                                │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  3.1 IPC Handler: generate-svg                                 │
│      ├── Receive: selected element data, prompt                │
│      ├── Call: AI agent (MCP/CLI/API)                          │
│      └── Return: generated SVG content                         │
│                                                                │
│  3.2 Generation Dialog                                         │
│      ├── Show prompt input                                     │
│      ├── Preview selected context                              │
│      └── Progress indicator                                    │
│                                                                │
│  3.3 Result Display                                            │
│      ├── Create FloatingWindow with new SVG                    │
│      ├── Allow saving to file                                  │
│      └── Allow inserting back into main canvas                 │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Phase 4: Polish & Multi-Window (4-6 hours)
Refine UX and enable multiple floating windows

```
┌────────────────────────────────────────────────────────────────┐
│ Phase 4: Polish & Multi-Window                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  4.1 Window Manager                                            │
│      ├── Track all open windows                                │
│      ├── Z-index management (bring to front)                   │
│      ├── Window snapping (optional)                            │
│      └── Minimize/restore                                      │
│                                                                │
│  4.2 Visual Polish                                             │
│      ├── Industrial Luxury Obsidian theme                      │
│      ├── Smooth animations (CSS transitions)                   │
│      └── Keyboard shortcuts                                    │
│                                                                │
│  4.3 Testing & Documentation                                   │
│      ├── E2E tests with Puppeteer                              │
│      ├── Update AGENTS.md with usage patterns                  │
│      └── Create user guide                                     │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Detailed Implementation Steps

### Step 1.1: FloatingWindowControl

**File**: `src/ui/server/shared/isomorphic/controls/ui/FloatingWindowControl.js`

```javascript
// Structure
class FloatingWindowControl extends Control {
  constructor(spec) {
    // Props: title, x, y, width, height, closable, resizable
  }
  
  compose() {
    // Create: container, titleBar, closeBtn, content
  }
  
  activate() {
    // Apply draggable mixin to titleBar
    // Bind close button
    // Optional: apply resizable
  }
  
  setContent(control) { }
  setPosition(x, y) { }
  bringToFront() { }
  close() { }
}
```

**CSS Classes**:
- `.floating-window` - main container
- `.floating-window__title-bar` - drag handle
- `.floating-window__title` - title text
- `.floating-window__close` - close button
- `.floating-window__content` - content area

### Step 1.2: ContextMenuControl

**File**: `src/ui/server/shared/isomorphic/controls/ui/ContextMenuControl.js`

```javascript
class ContextMenuControl extends Control {
  constructor(spec) {
    // Props: items [{label, icon, action, disabled}]
  }
  
  compose() {
    // Create menu container, items
  }
  
  activate() {
    // Keyboard nav (up/down/enter/escape)
    // Click outside to close
    // Item click handlers
  }
  
  show(x, y) { }
  hide() { }
  setItems(items) { }
}
```

### Step 1.3: SelectableSVGElementControl

**File**: `src/ui/server/shared/isomorphic/controls/canvas/SelectableSVGElementControl.js`

```javascript
class SelectableSVGElementControl extends SelectableControl {
  constructor(spec) {
    // Props: svgElement (the g/rect/text/etc element)
  }
  
  compose() {
    // Wrap SVG element
    // Add selection highlight layer
  }
  
  activate() {
    super.activate();
    // Additional: right-click handler
  }
  
  getElementData() {
    // Return: type, attributes, bounds, content
  }
  
  highlight(color) { }
  clearHighlight() { }
}
```

---

## Time Estimate

| Phase | Hours | Cumulative |
|-------|-------|------------|
| Phase 1: Foundation | 4-6 | 4-6 |
| Phase 2: Electron App | 4-6 | 8-12 |
| Phase 3: AI Integration | 6-8 | 14-20 |
| Phase 4: Polish | 4-6 | 18-26 |

**Total Estimate**: 18-26 hours of focused work

---

## Quick Win Path (MVP in 6-8 hours)

For fastest path to a working demo:

1. **Skip custom FloatingWindow** - use Electron's built-in `new BrowserWindow()` for new SVGs
2. **Minimal ContextMenu** - simple DOM-based menu (no full control)
3. **Manual AI trigger** - button instead of context menu integration
4. **Single SVG file** - hardcode the crawler-improvements.svg

This gets a working demo faster, then iterate to full solution.

---

## Decision Points

### Decision 1: New App vs Extend z-server
**Options**:
- A) Create `svg-studio/` - clean, focused, independent
- B) Add to `z-server/` - leverages existing infrastructure

**Recommendation**: Option A - new app provides cleaner architecture and focused purpose

### Decision 2: AI Integration Method
**Options**:
- A) MCP Server - already have tools, cleanest integration
- B) Spawn Copilot CLI - external dependency
- C) Direct API calls - requires API key management
- D) IPC to parent process - if running inside VS Code

**Recommendation**: Option A (MCP) with Option D fallback

### Decision 3: Window Implementation
**Options**:
- A) jsgui3 FloatingWindowControl - fully integrated, single-window app
- B) Electron BrowserWindow - native, multi-window, separate processes
- C) Hybrid - main canvas in one window, results in native windows

**Recommendation**: Option A for MVP, migrate to C for polish phase

---

## Files to Create

```
svg-studio/
├── main.js                          # Electron main process
├── preload.js                       # IPC bridge
├── renderer.src.js                  # jsgui3-client entry
├── index.html                       # Shell HTML
├── package.json                     # Dependencies
├── esbuild.config.js                # Bundle config
├── ui/
│   └── controls/
│       ├── index.js                 # Factory export
│       ├── SVGStudioAppControl.js   # Main app
│       ├── SVGViewerControl.js      # SVG display + selection
│       └── GenerationDialogControl.js
├── styles/
│   └── svg-studio.css               # Styles
└── tests/
    └── e2e/
        └── svg-studio.e2e.test.js
```

Plus shared controls in:
```
src/ui/server/shared/isomorphic/controls/
├── ui/
│   ├── FloatingWindowControl.js     # NEW
│   ├── ContextMenuControl.js        # NEW
│   └── index.js                     # Export both
└── canvas/
    └── SelectableSVGElementControl.js  # NEW
```

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| jsgui3 SVG selection complexity | High | Start with simple <g> groups, not individual paths |
| AI response latency | Medium | Show progress indicator, allow cancel |
| Multi-window z-index conflicts | Medium | Implement proper window manager |
| Electron IPC overhead | Low | Batch operations, use efficient serialization |

## Tests / Validation

- [ ] Unit tests for FloatingWindowControl, ContextMenuControl
- [ ] Integration test: select element → right-click → menu appears
- [ ] E2E test: full flow from selection to new window
- [ ] Visual regression: screenshot comparison for SVG rendering

---

## Next Action

**Immediate**: Start with Phase 1, Step 1.1 - FloatingWindowControl

This provides the most reusable piece that will benefit the entire UI system, not just this feature.
