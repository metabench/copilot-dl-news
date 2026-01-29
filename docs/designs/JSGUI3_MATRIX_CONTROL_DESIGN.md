# jsgui3-html Enhanced Matrix Control — High-Level Design

> **Author**: AI Agent (Place Disambiguation Singularity)  
> **Date**: 2026-01-08  
> **Status**: Draft  
> **Scope**: Design spec for a reusable Matrix control in `jsgui3-html`

---

## Executive Summary

This document proposes a unified **Matrix control** for jsgui3-html that combines the best features of the current `MatrixTableControl` and `VirtualMatrixControl` implementations, while adding enterprise-grade features for filtering, state management, and accessibility.

The goal: **One control to rule all matrix use cases** — from small 10×10 grids to massive 500×1000 matrices, with automatic mode switching, SSR-friendly architecture, and clean extensibility.

---

## Current Architecture Analysis

### Existing Controls

| Control | Purpose | Rendering | DOM Nodes | Best For |
|---------|---------|-----------|-----------|----------|
| `MatrixTableControl` | HTML `<table>` renderer | Full DOM | rows × cols | Small matrices (<1000 cells) |
| `VirtualMatrixControl` | Virtual scrolling | Visible window only | ~200-400 | Large matrices (>50k cells) |
| `PlaceHubGuessingMatrixControl` | Wrapper + chrome | Delegates to above | — | Application-specific |

### Current File Locations

```
src/ui/server/shared/isomorphic/controls/ui/
├── MatrixTableControl.js        # 170 lines — table-based
└── VirtualMatrixControl.js      # 400 lines — virtual scrolling

src/ui/server/placeHubGuessing/controls/
├── PlaceHubGuessingMatrixControl.js  # 1650 lines — app wrapper
└── ... 

src/ui/server/hubGuessing/controls/
└── HubGuessingMatrixChromeControl.js  # 819 lines — filters/presets
```

### Pain Points Identified

1. **Duplicated cell styling** — CSS for cells (`cell--none`, `cell--verified-*`) repeated across controls
2. **Mode switching logic scattered** — Auto-switching between table/virtual lives in the wrapper, not the base controls
3. **No built-in filtering** — Chrome controls add filtering UI but matrix controls don't participate
4. **Cell interaction coupling** — `renderCellTd` callback tightly coupled to app-specific model shape
5. **Header configuration fragile** — Angle rotation requires careful CSS coordination
6. **No keyboard navigation** — Matrix cells aren't keyboard-accessible

---

## Proposed Architecture

### Design Principles

1. **Single entry point** — `MatrixControl` auto-selects table or virtual based on size
2. **Declarative data model** — Rows/cols as arrays; cells as sparse object or callback
3. **Plugin-style extensibility** — Header renderers, cell renderers, filter engines as pluggable
4. **SSR-first** — Server renders complete structure; client hydrates for interactivity
5. **Accessibility built-in** — ARIA roles, keyboard navigation, screen reader support

### Component Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                      MatrixControl                          │
│  (auto-switches between table/virtual based on cell count)  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────┐  OR  ┌────────────────────────────────┐ │
│  │ TableRenderer │      │       VirtualRenderer          │ │
│  │ (full DOM)    │      │ (viewport + absolute cells)    │ │
│  └───────────────┘      └────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   HeaderRenderer                      │  │
│  │  • RowHeader (sticky left)                            │  │
│  │  • ColHeader (sticky top, rotated text support)       │  │
│  │  • CornerCell (sticky corner)                         │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   CellRenderer                        │  │
│  │  • Default (className + glyph + tooltip)              │  │
│  │  • Link cell (wraps content in <a>)                   │  │
│  │  • Custom (callback for complex cells)                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   MatrixChromeControl                       │
│  (optional wrapper adding filters, stats, presets, legend)  │
├─────────────────────────────────────────────────────────────┤
│  • Filter fields (selects, inputs)                          │
│  • Preset buttons                                           │
│  • Stats display                                            │
│  • Legend                                                   │
│  • View toggle (flip axes, table/virtual mode)              │
└─────────────────────────────────────────────────────────────┘
```

---

## API Design

### MatrixControl — Main Entry Point

```javascript
const matrix = new MatrixControl({
  context: ctx,
  
  // Data model
  rows: [{ id: 'row1', label: 'Row One' }, ...],
  cols: [{ id: 'col1', label: 'Column One' }, ...],
  
  // Cell data (sparse or callback)
  cells: {
    // Option A: Sparse map (efficient for mostly-empty matrices)
    'row1|col1': { state: 'verified', glyph: '✓', className: 'cell--ok' },
    'row2|col3': { state: 'pending', glyph: '•', className: 'cell--pending' },
    ...
  },
  // OR Option B: Callback for each cell
  getCellData: ({ row, col, rowIndex, colIndex }) => ({
    state: 'default',
    glyph: '',
    className: 'cell--empty',
    title: `${row.label} × ${col.label}`,
    href: `/cell?row=${row.id}&col=${col.id}`
  }),

  // Labels & keys
  getRowKey: (row) => row.id,
  getRowLabel: (row) => row.label,
  getRowTitle: (row) => row.fullName || row.label,
  getColKey: (col) => col.id,
  getColLabel: (col) => col.label,
  getColTitle: (col) => col.fullName || col.label,

  // Header configuration
  header: {
    corner: { label: 'Row \\ Col' },
    row: { 
      sticky: true,
      width: 220,
      className: 'matrix-row-header'
    },
    col: {
      sticky: true,
      height: 120,
      mode: 'angle',       // 'horizontal' | 'vertical' | 'angle'
      angleDeg: 45,
      truncateAt: 18
    }
  },

  // Cell interaction
  cellLink: {
    href: ({ row, col }) => `/cell?r=${row.id}&c=${col.id}`,
    target: '_self'
  },

  // Layout
  layout: {
    cellWidth: 44,
    cellHeight: 26,
    maxHeight: '70vh'      // Virtual scroll container max height
  },

  // Mode control
  mode: 'auto',            // 'auto' | 'table' | 'virtual'
  virtualThreshold: 50000, // Switch to virtual when rows×cols > threshold

  // Styling
  theme: 'dark',           // 'light' | 'dark' | custom theme object
  cellClassPrefix: 'cell', // Generates cell--state classes

  // Accessibility
  ariaLabel: 'Place × Host matrix',
  keyboardNav: true
});
```

### Row/Col Data Shape

```typescript
interface RowData {
  id: string | number;           // Unique key
  label: string;                 // Display label
  title?: string;                // Tooltip
  className?: string;            // Extra CSS class
  attrs?: Record<string, string>;// Extra HTML attributes
}

interface ColData {
  id: string | number;
  label: string;
  title?: string;
  className?: string;
  attrs?: Record<string, string>;
}
```

### Cell Data Shape

```typescript
interface CellData {
  state: string;           // State key (used for filtering + className)
  glyph?: string;          // Text/emoji inside cell
  className?: string;      // CSS class override (default: cellClassPrefix--state)
  title?: string;          // Tooltip
  href?: string;           // Link destination
  ageLabel?: string;       // Secondary label (e.g., "3d" for age)
  badge?: string;          // Badge text (e.g., "10+" for deep hubs)
  disabled?: boolean;      // Gray out cell
  data?: Record<string, any>; // Custom data for event handlers
}
```

### MatrixChromeControl — Filter/Stats Wrapper

```javascript
const chrome = new MatrixChromeControl({
  context: ctx,
  basePath: '/matrix',
  
  // Filters
  fields: [
    { kind: 'select', name: 'state', label: 'State', 
      value: 'all', 
      options: ['all', 'verified', 'pending', 'unchecked'] },
    { kind: 'input', name: 'q', label: 'Search', 
      value: '', 
      attrs: { placeholder: 'Filter...' } },
    { kind: 'input', name: 'limit', label: 'Limit', 
      value: '100', 
      attrs: { type: 'number', min: 1, max: 1000 } }
  ],

  // Stats display
  stats: [
    { label: 'Rows', value: 250 },
    { label: 'Cols', value: 45 },
    { label: 'Verified', value: 1234, className: 'stat--ok' },
    { label: 'Pending', value: 56, className: 'stat--warn' }
  ],

  // Presets (quick filter shortcuts)
  presets: [
    { label: '🌍 Countries', params: { kind: 'country', limit: 300 } },
    { label: '✅ Verified', params: { state: 'verified' } },
    { label: '⚠️ Needs Review', params: { state: 'pending' } }
  ],

  // Legend
  legend: [
    { label: 'Verified', className: 'cell--verified' },
    { label: 'Pending', className: 'cell--pending' },
    { label: 'Unchecked', className: 'cell--unchecked' }
  ],

  // View controls
  includeFlipAxes: true,   // Add button to swap rows/cols
  includeModeToggle: true, // Add button to switch table/virtual

  // Children (the actual matrix)
  children: [matrix]
});
```

---

## Rendering Strategies

### Table Mode (< threshold cells)

```html
<div class="matrix-container matrix--table">
  <div class="matrix-wrap">
    <table class="matrix" role="grid" aria-label="Place × Host matrix">
      <thead>
        <tr>
          <th class="matrix-corner">Row \ Col</th>
          <th class="matrix-col-header" data-col-key="col1">
            <div class="matrix-col-inner" style="--angle: 45deg">
              <span class="matrix-col-label">Column One</span>
            </div>
          </th>
          <!-- ... more columns -->
        </tr>
      </thead>
      <tbody>
        <tr data-row-key="row1">
          <th class="matrix-row-header">Row One</th>
          <td class="matrix-cell cell cell--verified" data-state="verified">
            <a href="/cell?r=row1&c=col1" class="cell-link">✓</a>
          </td>
          <!-- ... more cells -->
        </tr>
        <!-- ... more rows -->
      </tbody>
    </table>
  </div>
</div>
```

### Virtual Mode (≥ threshold cells)

```html
<div class="matrix-container matrix--virtual" 
     data-cell-w="44" data-cell-h="26" 
     data-row-header-w="220" data-col-header-h="120">
  
  <!-- JSON payload for client-side rendering -->
  <script type="application/json" data-matrix-data>
    {
      "rowKeys": ["row1", "row2", ...],
      "rowLabels": ["Row One", "Row Two", ...],
      "colKeys": ["col1", "col2", ...],
      "colLabels": ["Column One", "Column Two", ...],
      "cells": { "row1|col1": {...}, "row2|col3": {...} }
    }
  </script>

  <div class="matrix-viewport" tabindex="0">
    <div class="matrix-spacer" style="width: 10000px; height: 5000px"></div>
    <div class="matrix-corner">Row \ Col</div>
    <div class="matrix-col-headers"></div>
    <div class="matrix-row-headers"></div>
    <div class="matrix-cells"></div>
  </div>

  <script data-matrix-init>/* virtualization logic */</script>
</div>
```

---

## Virtual Scrolling Strategy

### Core Algorithm

```
1. On scroll event (throttled via rAF):
   - Calculate visible row range: floor(scrollTop / cellHeight) ± buffer
   - Calculate visible col range: floor(scrollLeft / cellWidth) ± buffer
   - Compute window key: `${firstRow}:${lastRow}:${firstCol}:${lastCol}`
   
2. If window key unchanged: skip render
   
3. Clear and repaint:
   - Column headers in visible range (position: absolute)
   - Row headers in visible range (position: absolute)
   - Cells in visible range (position: absolute)
   
4. Sticky positioning via CSS transform:
   - Corner: translate(scrollLeft, scrollTop)
   - Column headers: translateX(scrollLeft) 
   - Row headers: translateY(scrollTop)
```

### Performance Targets

| Metric | Target |
|--------|--------|
| Initial render | < 50ms for 100k cell matrix |
| Scroll repaint | < 16ms (60fps) |
| DOM nodes | ≤ 500 regardless of matrix size |
| Memory | ≤ 5MB for 1M cell matrix |

---

## State Filtering

### Client-Side Filter Approach

```css
/* Filter via data-state-filter attribute on container */
[data-state-filter="verified"] .cell:not([data-state="verified"]) {
  opacity: 0.25;
  pointer-events: none;
}

[data-state-filter="pending"] .cell:not([data-state="pending"]) {
  opacity: 0.25;
  pointer-events: none;
}
```

### Server-Side Filter Approach

```javascript
// Filter applied to data before rendering
const filteredCells = Object.fromEntries(
  Object.entries(allCells).filter(([key, cell]) => 
    stateFilter === 'all' || cell.state === stateFilter
  )
);
```

---

## Axis Flipping

Support swapping rows ↔ cols for alternative perspectives:

```javascript
// View A: Places as rows, Hosts as columns
const viewA = new MatrixControl({
  rows: places,
  cols: hosts,
  ...
});

// View B: Hosts as rows, Places as columns  
const viewB = new MatrixControl({
  rows: hosts,
  cols: places,
  ...
});
```

The Chrome control provides a toggle button that swaps visibility:

```html
<button onclick="toggleView()">↔ Flip Axes</button>
<div data-view="a"><!-- viewA --></div>
<div data-view="b" hidden><!-- viewB --></div>
```

---

## Keyboard Navigation

### Required Behaviors

| Key | Action |
|-----|--------|
| `Tab` | Focus matrix container |
| `Arrow keys` | Move between cells |
| `Enter` / `Space` | Activate cell (follow link) |
| `Home` | Jump to first cell in row |
| `End` | Jump to last cell in row |
| `Ctrl+Home` | Jump to first cell (0,0) |
| `Ctrl+End` | Jump to last cell |

### Focus Management

```javascript
// Track focused cell position
let focusedRow = 0;
let focusedCol = 0;

viewport.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') {
    focusedCol = Math.min(focusedCol + 1, totalCols - 1);
    scrollCellIntoView(focusedRow, focusedCol);
    updateFocusRing();
    e.preventDefault();
  }
  // ... other keys
});
```

---

## Theming

### CSS Custom Properties

```css
.matrix-container {
  /* Colors */
  --matrix-bg: #1a1410;
  --matrix-border: #4a3628;
  --matrix-text: #f5e6d3;
  --matrix-muted: #b8a090;
  
  /* Header colors */
  --matrix-header-bg: #0f172a;
  --matrix-header-text: #f5e6d3;
  --matrix-corner-bg: #120e0b;
  
  /* Cell state colors */
  --cell-default-bg: rgba(255,255,255,0.04);
  --cell-verified-bg: rgba(34,197,94,0.20);
  --cell-verified-text: #4ade80;
  --cell-pending-bg: rgba(156,163,175,0.24);
  --cell-pending-text: #e5e7eb;
  --cell-error-bg: rgba(239,68,68,0.20);
  --cell-error-text: #f87171;
  
  /* Layout */
  --matrix-cell-w: 44px;
  --matrix-cell-h: 26px;
  --matrix-row-header-w: 220px;
  --matrix-col-header-h: 120px;
  
  /* Typography */
  --matrix-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --matrix-mono-font: Consolas, Monaco, monospace;
}
```

### Theme Presets

```javascript
const THEMES = {
  dark: {
    '--matrix-bg': '#1a1410',
    '--matrix-text': '#f5e6d3',
    // ...
  },
  light: {
    '--matrix-bg': '#ffffff',
    '--matrix-text': '#1f2937',
    // ...
  }
};
```

---

## Implementation Phases

### Phase 1: Core MatrixControl (Week 1)

- [ ] Create `MatrixControl` with auto table/virtual switching
- [ ] Migrate `MatrixTableControl` internals
- [ ] Migrate `VirtualMatrixControl` internals
- [ ] Unified cell data model (sparse object + callback)
- [ ] Unified header configuration
- [ ] Basic theming via CSS custom properties

### Phase 2: Chrome Control (Week 2)

- [ ] Create `MatrixChromeControl` for filters/stats/legend
- [ ] Extract common field renderer from `HubGuessingMatrixChromeControl`
- [ ] Preset buttons with URL integration
- [ ] Stats display with conditional styling
- [ ] Legend with cell state previews

### Phase 3: Advanced Features (Week 3)

- [ ] Keyboard navigation
- [ ] ARIA roles and screen reader support
- [ ] State filtering (client-side + server-side)
- [ ] Axis flipping with view toggle
- [ ] Cell selection (single/multi)

### Phase 4: Polish & Documentation (Week 4)

- [ ] Performance optimization and benchmarking
- [ ] SSR hydration testing
- [ ] Comprehensive tests for both modes
- [ ] API documentation
- [ ] Migration guide from existing controls

---

## Migration Path

### From `MatrixTableControl`

```javascript
// Before
const matrix = new MatrixTableControl({
  rows: places,
  cols: hosts,
  renderCellTd: ({ row, col }) => makeTd(row, col)
});

// After
const matrix = new MatrixControl({
  mode: 'table',  // Force table mode
  rows: places.map(p => ({ id: p.place_id, label: p.place_name })),
  cols: hosts.map(h => ({ id: h, label: h })),
  getCellData: ({ row, col }) => ({
    state: getCellState(row.id, col.id),
    glyph: getCellGlyph(row.id, col.id)
  })
});
```

### From `VirtualMatrixControl`

```javascript
// Before
const matrix = new VirtualMatrixControl({
  rowKeys: [...],
  rowLabels: [...],
  colKeys: [...],
  colLabels: [...],
  specialCells: [...]
});

// After
const matrix = new MatrixControl({
  mode: 'virtual',  // Force virtual mode
  rows: rowKeys.map((k, i) => ({ id: k, label: rowLabels[i] })),
  cols: colKeys.map((k, i) => ({ id: k, label: colLabels[i] })),
  cells: Object.fromEntries(
    specialCells.map(c => [`${c.rowKey}|${c.colKey}`, c])
  )
});
```

---

## File Structure (Proposed)

```
jsgui3-html/
└── controls/
    └── matrix/
        ├── MatrixControl.js         # Main entry point
        ├── TableRenderer.js         # HTML table renderer
        ├── VirtualRenderer.js       # Virtual scroll renderer
        ├── HeaderRenderer.js        # Shared header logic
        ├── CellRenderer.js          # Cell rendering utilities
        ├── MatrixChromeControl.js   # Filter/stats wrapper
        ├── themes/
        │   ├── dark.js
        │   └── light.js
        ├── styles/
        │   ├── matrix.css
        │   └── themes.css
        └── __tests__/
            ├── MatrixControl.test.js
            └── VirtualRenderer.test.js
```

---

## Open Questions

1. **Should virtual mode use Canvas?** — For 1M+ cells, Canvas might be faster than DOM. Trade-off: loses accessibility, complicates cell links.

2. **Cell event handling** — Should cells emit events (click, hover) via EventEmitter, or rely on DOM events bubbling?

3. **Row/col grouping** — Support for grouped headers (e.g., "Americas > USA > California")?

4. **Frozen rows/cols** — Support for multiple frozen rows/cols (not just first)?

5. **Lazy cell data loading** — For very large matrices, fetch cell data on-demand as user scrolls?

---

## References

- [MatrixTableControl.js](../../src/ui/server/shared/isomorphic/controls/ui/MatrixTableControl.js)
- [VirtualMatrixControl.js](../../src/ui/server/shared/isomorphic/controls/ui/VirtualMatrixControl.js)
- [PlaceHubGuessingMatrixControl.js](../../src/ui/server/placeHubGuessing/controls/PlaceHubGuessingMatrixControl.js)
- [HubGuessingMatrixChromeControl.js](../../src/ui/server/hubGuessing/controls/HubGuessingMatrixChromeControl.js)
- [jsgui3-html SSR Guide](./guides/JSGUI3_SSR_ISOMORPHIC_CONTROLS.md)
