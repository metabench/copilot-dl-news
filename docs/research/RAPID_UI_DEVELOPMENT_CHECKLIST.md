# Rapid UI Development Checklist

> **Purpose**: Step-by-step checklist for building high-quality jsgui3 UIs quickly.
> Based on research in [UI_DEVELOPMENT_METHODOLOGY_RESEARCH.md](UI_DEVELOPMENT_METHODOLOGY_RESEARCH.md)

---

## 🚀 Quick Start: New UI Project

### Step 1: Choose Layout Pattern (2 min)

| If your app needs... | Use this pattern |
|---------------------|------------------|
| Tools + workspace | **Sidebar Layout** (fixed + fluid) |
| Cards/items | **Grid Layout** (auto-fit columns) |
| Long content | **Center Layout** (max-width centered) |
| Full-screen app | **Cover Layout** (viewport height) |
| Stacked sections | **Stack Layout** (vertical rhythm) |

### Step 2: Sketch the Structure (5 min)

```
┌──────────────────────────────────────┐
│ Header/Toolbar (fixed height)        │
├──────────┬───────────────────────────┤
│ Side     │                           │
│ Panel    │ Main Content              │
│ (fixed   │ (fluid)                   │
│  width)  │                           │
├──────────┴───────────────────────────┤
│ Footer/Status (fixed height)         │
└──────────────────────────────────────┘

Annotate: fixed heights (px), fixed widths (px), fluid (flex-grow)
```

### Step 3: Map to Controls (5 min)

| Region | Control Class | Key Props |
|--------|---------------|-----------|
| Root | `AppControl` | Layout classes |
| Header | `ToolbarControl` | Items array |
| Sidebar | `PanelControl` | Width token |
| Content | Domain-specific | `flex-grow` |
| Footer | `StatusBarControl` | Status items |

### Step 4: Apply Tokens (2 min)

| Decision | Token | Value |
|----------|-------|-------|
| Panel width (narrow) | `--panel-narrow` | 60px |
| Panel width (medium) | `--panel-medium` | 160px |
| Toolbar height | `--toolbar-height` | 40px |
| Content gap | `--space-m` | 16px |
| Item gap | `--space-s` | 8px |

---

## 📦 Layout Primitive CSS Classes

Copy into your stylesheet:

```css
/* Foundation: Design Tokens */
:root {
  /* Spacing scale */
  --space-xs: 4px;
  --space-s: 8px;
  --space-m: 16px;
  --space-l: 24px;
  --space-xl: 32px;
  
  /* Panel sizes */
  --panel-narrow: 60px;
  --panel-medium: 160px;
  --panel-wide: 240px;
  
  /* Heights */
  --toolbar-height: 40px;
  --statusbar-height: 24px;
}

/* Primitive: Stack (vertical) */
.stack {
  display: flex;
  flex-direction: column;
}
.stack > * + * {
  margin-top: var(--space-m);
}

/* Primitive: Cluster (horizontal, wrapping) */
.cluster {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-s);
  align-items: center;
}

/* Primitive: Sidebar (fixed + fluid) */
.sidebar-layout {
  display: flex;
  flex-wrap: wrap;
}
.sidebar-layout > :first-child {
  flex-basis: var(--panel-narrow);
  flex-shrink: 0;
}
.sidebar-layout > :last-child {
  flex-grow: 1;
  min-width: 50%;
}

/* Primitive: Cover (full viewport) */
.cover {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.cover > * {
  flex-shrink: 0;
}
.cover > .cover-main {
  flex-grow: 1;
}

/* Primitive: Grid (auto-fit) */
.auto-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--space-m);
}

/* Utility: Gaps */
.gap-s { gap: var(--space-s); }
.gap-m { gap: var(--space-m); }
.gap-l { gap: var(--space-l); }

/* Utility: Padding */
.pad-s { padding: var(--space-s); }
.pad-m { padding: var(--space-m); }
.pad-l { padding: var(--space-l); }

/* Utility: Flex */
.flex-grow { flex-grow: 1; }
.flex-shrink-0 { flex-shrink: 0; }

/* Utility: Sizing */
.w-narrow { width: var(--panel-narrow); }
.w-medium { width: var(--panel-medium); }
.w-wide { width: var(--panel-wide); }
.h-toolbar { height: var(--toolbar-height); }
```

---

## 🎨 Control Composition Patterns

### Pattern A: App Shell

```javascript
class MyAppControl extends Control {
  compose() {
    this.add_class('cover');  // Full viewport height
    
    // Header (fixed)
    this.add(new ToolbarControl({ context: this.context }));
    
    // Main area (grows)
    const main = new Control({ context: this.context });
    main.add_class('cover-main');
    main.add_class('sidebar-layout');
    
    // Sidebar (fixed width)
    const sidebar = new PanelControl({ context: this.context });
    sidebar.add_class('w-narrow');
    main.add(sidebar);
    
    // Content (grows)
    const content = new Control({ context: this.context });
    content.add_class('flex-grow');
    content.add_class('pad-m');
    main.add(content);
    
    this.add(main);
    
    // Footer (fixed)
    this.add(new StatusBarControl({ context: this.context }));
  }
}
```

### Pattern B: Card Grid

```javascript
class DashboardControl extends Control {
  compose() {
    this.add_class('pad-m');
    
    const grid = new Control({ context: this.context });
    grid.add_class('auto-grid');
    
    this.items.forEach(item => {
      grid.add(new CardControl({ context: this.context, data: item }));
    });
    
    this.add(grid);
  }
}
```

### Pattern C: Toolbar

```javascript
class ToolbarControl extends Control {
  compose() {
    this.dom.tagName = 'header';
    this.add_class('cluster');
    this.add_class('h-toolbar');
    this.add_class('pad-s');
    
    // Left group
    const left = new Control({ context: this.context });
    left.add_class('cluster');
    this.tools.forEach(tool => {
      left.add(new ToolButtonControl({ context: this.context, tool }));
    });
    this.add(left);
    
    // Spacer
    const spacer = new Control({ context: this.context });
    spacer.add_class('flex-grow');
    this.add(spacer);
    
    // Right group
    const right = new Control({ context: this.context });
    right.add_class('cluster');
    right.add(new SearchControl({ context: this.context }));
    this.add(right);
  }
}
```

---

## ✅ Pre-Flight Checklist

Before shipping any UI:

### Structure
- [ ] Uses layout primitives (not custom flexbox everywhere)
- [ ] Fixed elements have explicit size tokens
- [ ] Fluid elements use `flex-grow`
- [ ] Gaps use spacing tokens

### Responsiveness
- [ ] No hardcoded widths on fluid areas
- [ ] Minimum widths prevent content squishing
- [ ] Grid uses `auto-fit` or `auto-fill`

### Code Quality
- [ ] Controls follow atomic hierarchy
- [ ] Check script exists and passes
- [ ] CSS uses tokens, not magic numbers
- [ ] Classes named by purpose, not appearance

### Performance
- [ ] Large lists use lazy rendering
- [ ] Control count is reasonable (<500 for initial load)
- [ ] No unnecessary nesting

---

## 🔧 Debugging Layout Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Content overflows | Missing `min-width: 0` on flex child | Add `min-width: 0` |
| Sidebar doesn't stay fixed | Using percentage width | Use `flex-basis` + `flex-shrink: 0` |
| Items don't wrap | Missing `flex-wrap: wrap` | Add to parent |
| Grid items different heights | Missing `align-items` | Add `align-items: start` |
| Scrollbar appears unexpectedly | Content exceeds container | Check for padding + 100vh issues |

### Browser DevTools Quick Checks

```javascript
// Check element's layout algorithm
getComputedStyle(el).display  // flex, grid, block, etc.

// Check if element is flex item
el.parentElement.style.display === 'flex'

// Check flex properties
getComputedStyle(el).flexGrow
getComputedStyle(el).flexShrink
getComputedStyle(el).flexBasis
```

---

## 📊 Layout Algorithm Cheat Sheet

| Algorithm | Use When | Key Properties |
|-----------|----------|----------------|
| **Flow** | Default document content | `display: block`, `display: inline` |
| **Flexbox** | 1D layout (row OR column) | `display: flex`, `flex-direction` |
| **Grid** | 2D layout (rows AND columns) | `display: grid`, `grid-template-*` |
| **Positioned** | Overlays, tooltips, modals | `position: absolute/fixed` |

### Flexbox vs Grid Decision

```
Need to align items in ONE direction?
├── YES → Use FLEXBOX
│         • Toolbar items
│         • Stacked sections
│         • Sidebar + content
│
└── NO, need rows AND columns → Use GRID
          • Dashboard cards
          • Photo gallery
          • Data tables
```

---

## 🎯 Art Playground Specific

### Ideal Layout Classes

```javascript
// ArtPlaygroundAppControl
compose() {
  this.add_class('cover');           // Full viewport
  
  // Toolbar
  const toolbar = new ToolbarControl({ ... });
  toolbar.add_class('h-toolbar');
  toolbar.add_class('flex-shrink-0');
  this.add(toolbar);
  
  // Workspace (sidebar layout)
  const workspace = new Control({ ... });
  workspace.add_class('cover-main'); // Fills remaining height
  workspace.add_class('sidebar-layout');
  
  // Tool panel (left, narrow)
  const tools = new ToolPanelControl({ ... });
  tools.add_class('w-narrow');       // 60px
  workspace.add(tools);
  
  // Canvas (center, grows)
  const canvas = new CanvasControl({ ... });
  canvas.add_class('flex-grow');
  workspace.add(canvas);
  
  // Properties panel (right, medium)
  const props = new PropertiesControl({ ... });
  props.add_class('w-medium');       // 160px
  workspace.add(props);
  
  this.add(workspace);
  
  // Status bar
  const status = new StatusBarControl({ ... });
  status.add_class('h-statusbar');
  this.add(status);
}
```

### Key Dimensions (Tokens)

| Element | Token | Value |
|---------|-------|-------|
| Toolbar | `--toolbar-height` | 40px |
| Tool panel | `--panel-narrow` | 60px |
| Properties panel | `--panel-medium` | 160px |
| Status bar | `--statusbar-height` | 24px |
| Canvas | No token | Fills remaining space |

---

## 📚 Further Reading

- [UI_DEVELOPMENT_METHODOLOGY_RESEARCH.md](UI_DEVELOPMENT_METHODOLOGY_RESEARCH.md) - Full research
- [LAYOUT_IMPROVEMENT_WORKFLOW.md](../workflows/LAYOUT_IMPROVEMENT_WORKFLOW.md) - Improvement process
- [JSGUI3_UI_ARCHITECTURE_GUIDE.md](../guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md) - jsgui3 fundamentals
