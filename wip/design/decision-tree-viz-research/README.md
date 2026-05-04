# Decision Tree Visualization Research - Directory Index

This directory contains deep research into decision tree visualization tools and example SVG mockups using the **Luxury Industrial Obsidian** design language.

## Contents

### Research Documentation

| File | Description |
|------|-------------|
| [RESEARCH.md](./RESEARCH.md) | Comprehensive research study covering market landscape, UI patterns, technical recommendations |

### SVG Mockups

| File | Description | Dimensions |
|------|-------------|------------|
| [decision-tree-editor-overview.svg](./decision-tree-editor-overview.svg) | Full editor interface layout | 1200×800 |
| [node-types-palette.svg](./node-types-palette.svg) | Toolbox showing all draggable node types | 400×700 |
| [property-editor-panel.svg](./property-editor-panel.svg) | Node configuration/property panel | 320×650 |
| [interactive-canvas.svg](./interactive-canvas.svg) | Canvas with sample article classification tree | 900×700 |

## Design Language: Luxury Industrial Obsidian

### Color Palette

| Element | Color | Hex |
|---------|-------|-----|
| Primary Background | Deep Obsidian | `#0a0f1a` |
| Secondary Background | Slate | `#1a1f2e` |
| Card Surfaces | Panel Gradient | `#1e232c` → `#10131a` |
| **Gold Accent (Primary)** | Burnished Gold | `#c9a227` |
| Gold Highlight | Bright Gold | `#e8c252` |
| Success | Forest Green | `#166534` / `#22c55e` |
| Error | Deep Red | `#7f1d1d` / `#ef4444` |
| Warning | Amber | `#78350f` / `#f59e0b` |
| Text Primary | Light Slate | `#e2e8f0` |
| Text Secondary | Muted Slate | `#94a3b8` |

### Industrial Details

- **Corner rivets** on panels for mechanical aesthetic
- **Subtle grid patterns** (gold at 0.06-0.1 opacity)
- **Gold glow effects** on selected/active elements
- **Beveled edges** on interactive components
- **Soft drop shadows** for depth hierarchy

## Key Research Findings

### Recommended Technical Stack

1. **Rendering**: SVG-based (crisp at any zoom, easy CSS styling)
2. **Layout**: d3-hierarchy for tree layouts, dagre for complex graphs
3. **Interaction**: React Flow patterns for zoom/pan/drag
4. **Data**: JSON serialization for tree persistence

### Essential UI Features

1. **Canvas**: Zoom, pan, grid snap, minimap
2. **Nodes**: Drag-drop creation, visual type distinction
3. **Connections**: Bezier curves, YES/NO color coding
4. **Properties**: Inline editing, real-time validation
5. **Testing**: Sample browser, step-through evaluation, audit trail

### Top Industry Tools Analyzed

- **Lucidchart** - Best for collaboration
- **React Flow** - Best open-source foundation
- **Visual Paradigm** - Best for developers
- **Miro** - Best for brainstorming
- **d3.js** - Most flexible visualization

## Related Documents

- `/docs/designs/DECISION_TREE_STUDIO.md` - Decision Tree Studio application design
- `/design/decision-diamond.svg` - Original diamond node glyph
- `/design/status-box.svg` - Original status box glyph

---

*Research conducted: 2025-11-30*
*Design language: Luxury Industrial Obsidian*
