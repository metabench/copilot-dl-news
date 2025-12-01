# Plan – Art Playground Layout Improvement

## Objective
Transform Art Playground from minimal 2-region layout to professional 5-region layout using layout primitives methodology.

## Done When
- [ ] Layout matches target mockup (art-playground-ideal.svg)
- [ ] Left panel (60px) shows tool icons vertically
- [ ] Right panel (160px) shows properties for selected element
- [ ] Status bar (24px) shows selection info and zoom
- [ ] All existing functionality preserved (drag, resize, create, delete)
- [ ] E2E tests pass
- [ ] Check scripts pass
- [ ] Follow-ups are recorded in `FOLLOW_UPS.md`.

---

## Current State vs Target State

```
CURRENT:                              TARGET:
┌─────────────────────┐              ┌─────────────────────────────┐
│      Toolbar        │              │         Toolbar             │
├─────────────────────┤              ├──────┬──────────────┬───────┤
│                     │              │ Tool │              │ Props │
│                     │              │ 60px │   Canvas     │ 160px │
│      Canvas         │              │      │  (flex)      │       │
│                     │              ├──────┴──────────────┴───────┤
│                     │              │       Status Bar  24px      │
└─────────────────────┘              └─────────────────────────────┘
```

---

## Change Set

### Phase 1: CSS Foundation (tokens + primitives)
| File | Action | Purpose |
|------|--------|---------|
| `public/art-playground.css` | Modify | Add tokens + layout primitives |

### Phase 2: New Controls
| File | Action | Purpose |
|------|--------|---------|
| `isomorphic/controls/ToolPanelControl.js` | Create | Left 60px tool panel |
| `isomorphic/controls/PropertiesPanelControl.js` | Create | Right 160px properties |
| `isomorphic/controls/StatusBarControl.js` | Create | Bottom 24px status |
| `isomorphic/controls/index.js` | Modify | Export new controls |

### Phase 3: Layout Refactor
| File | Action | Purpose |
|------|--------|---------|
| `isomorphic/controls/ArtPlaygroundAppControl.js` | Modify | New 5-region layout |
| `isomorphic/controls/ToolbarControl.js` | Modify | Simplify (tools move to panel) |

### Phase 4: Event Wiring & Validation
| File | Action | Purpose |
|------|--------|---------|
| `checks/art-playground.check.js` | Modify | Validate new layout |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing resize/selection | Medium | High | Keep CanvasControl unchanged initially |
| CSS specificity conflicts | Low | Medium | Use ap- prefix consistently |
| Client activation issues | Medium | High | Test hydration after each phase |
| Performance (more controls) | Low | Low | Controls are lightweight |

---

## Tests / Validation

1. **Unit check**: `node src/ui/server/artPlayground/checks/art-playground.check.js`
2. **E2E test**: `npm run test:by-path tests/ui/e2e/art-playground-resize.puppeteer.e2e.test.js`
3. **Visual**: Screenshot comparison with target SVG
4. **Manual**: Start server, verify layout in browser

---

## Implementation Order

| Step | Task | Dependencies | Status |
|------|------|--------------|--------|
| 1 | CSS tokens + primitives | None | ✅ |
| 2 | StatusBarControl | CSS | ✅ |
| 3 | ToolPanelControl | CSS | ✅ |
| 4 | PropertiesPanelControl | CSS | ✅ |
| 5 | App layout refactor | Steps 2-4 | ✅ |
| 6 | Toolbar simplification | Step 5 | ✅ |
| 7 | Event wiring | Step 5 | ✅ |
| 8 | Validation & cleanup | All | ✅ |

---

## Detailed Specifications

### CSS Design Tokens
```css
:root {
  /* Spacing scale */
  --ap-space-xs: 4px;
  --ap-space-s: 8px;
  --ap-space-m: 16px;
  --ap-space-l: 24px;
  
  /* Panel sizes */
  --ap-panel-narrow: 60px;
  --ap-panel-medium: 160px;
  
  /* Heights */
  --ap-toolbar-height: 40px;
  --ap-statusbar-height: 24px;
}
```

### Layout Primitive Classes
```css
.ap-cover { display: flex; flex-direction: column; height: 100vh; }
.ap-sidebar-layout { display: flex; flex: 1; overflow: hidden; }
.ap-panel-narrow { width: var(--ap-panel-narrow); flex-shrink: 0; }
.ap-panel-medium { width: var(--ap-panel-medium); flex-shrink: 0; }
.ap-flex-grow { flex-grow: 1; min-width: 0; }
```

### New ArtPlaygroundAppControl.compose()
```javascript
compose() {
  this.add_class("ap-cover");
  
  // Toolbar (simplified)
  this.add(this._toolbar = new ToolbarControl({ context: ctx }));
  
  // Workspace (sidebar layout)
  const workspace = new Control({ context: ctx, tagName: "main" });
  workspace.add_class("ap-sidebar-layout");
  
  workspace.add(this._toolPanel = new ToolPanelControl({ context: ctx }));
  
  const canvasWrapper = new Control({ context: ctx });
  canvasWrapper.add_class("ap-flex-grow");
  canvasWrapper.add(this._canvas = new CanvasControl({ context: ctx }));
  workspace.add(canvasWrapper);
  
  workspace.add(this._propertiesPanel = new PropertiesPanelControl({ context: ctx }));
  
  this.add(workspace);
  this.add(this._statusBar = new StatusBarControl({ context: ctx }));
}
```

---

## Reference Documents

- [UI_DEVELOPMENT_METHODOLOGY_RESEARCH.md](../../research/UI_DEVELOPMENT_METHODOLOGY_RESEARCH.md)
- [RAPID_UI_DEVELOPMENT_CHECKLIST.md](../../research/RAPID_UI_DEVELOPMENT_CHECKLIST.md)
- [art-playground-ideal.svg](../../workflows/layout-patterns/art-playground-ideal.svg)
