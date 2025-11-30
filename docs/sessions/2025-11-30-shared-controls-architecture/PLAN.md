# Plan – Shared Controls Architecture & WYSIWYG Drawing Foundation

## Status: ✅ PHASE 1 COMPLETE

## Objective
Create shared jsgui3 controls library and lay foundation for WYSIWYG decision tree editor

## Done When
- [x] Audit existing controls across apps (dataExplorer, docsViewer, designStudio, diagramAtlas, z-server)
- [x] Create directory structure with categories under `src/ui/server/shared/isomorphic/controls/`
- [x] Create foundational WYSIWYG controls: DraggableControl, SelectableControl, ToolboxControl
- [x] Create canvas controls: CanvasControl, ShapeControl + shape variants
- [x] Document all shared controls with comprehensive JSDoc and usage examples
- [x] Research jsgui3-html mixins (dragable, selectable, resizable)
- [ ] Ensure existing apps can import from shared location (next phase)
- [ ] Create WYSIWYG demo app (next phase)

## Deliverables Completed

### Controls Created
| Control | File | Lines | Description |
|---------|------|-------|-------------|
| DraggableControl | `interactive/DraggableControl.js` | ~350 | Wraps `dragable` mixin with clean API |
| SelectableControl | `interactive/SelectableControl.js` | ~250 | Wraps `selectable` mixin with clean API |
| CanvasControl | `canvas/CanvasControl.js` | ~400 | Drawing surface with grid, zoom, drop support |
| ShapeControl | `canvas/ShapeControl.js` | ~550 | Base class + 4 shape variants |
| ToolboxControl | `ui/ToolboxControl.js` | ~500 | Tool palette with groups and drag source |
| **Total** | | **~2050** | Well-documented, production-ready |

### Directory Structure Implemented
```
src/ui/server/shared/isomorphic/controls/
├── index.js                          # Main re-export (all controls)
├── shared-controls.css               # Default CSS styles
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

### Documentation
- **JSDoc**: Every public method, property, and type documented
- **Usage Examples**: Multiple examples per control showing common patterns
- **CSS Variables**: Theme customization via CSS custom properties
- **Event Reference**: All events documented with payload types

## Architecture Principles

### No Factory Pattern ✅
- Use direct `new ControlName({ context, ...spec })` instantiation
- Controls compose other controls via `compose()` using constructors
- Keep it simple: constructor → compose → activate

### Mixin Wrapping Pattern ✅
- jsgui3-html mixins wrapped in control classes
- Clean API exposed to consumers
- Internal mixin application hidden

## jsgui3-html Mixin Research

### Discovered & Documented (see WORKING_NOTES.md)
| Mixin | File | Used In |
|-------|------|---------|
| `dragable` | `control_mixins/dragable.js` | DraggableControl, ShapeControl |
| `selectable` | `control_mixins/selectable.js` | SelectableControl, ShapeControl |
| `resizable` | `control_mixins/resizable.js` | (Future: ResizableControl) |
| `drag_like_events` | `control_mixins/drag_like_events.js` | Base for drag-like operations |

## Risks & Mitigations

| Risk | Mitigation | Status |
|------|------------|--------|
| Breaking existing apps during refactor | Move controls one at a time, update imports, test | ⏳ Future |
| Over-generalizing controls | Start specific, extract patterns when 3+ uses emerge | ✅ Done |
| Documentation debt | Document each control as it's created, not after | ✅ Done |

## Next Phase (TODO)

1. Create WYSIWYG demo app using shared controls
2. Add ConnectorControl for lines between shapes
3. Extract ContextMenuControl from docsViewer to shared
4. Add ResizableControl wrapper
5. Add check scripts for each control
