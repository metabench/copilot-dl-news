# SVG Tooling V2: High-Bandwidth MCP Tools

> **Status**: Design Draft  
> **Session**: `2025-12-10-svg-tooling-v2`  
> **Goal**: Enable AI agents to generate and edit SVGs via MCP tool calls with minimal data, maximum reliability, and batch operations

---

## Executive Summary

Current SVG tooling requires agents to specify every element verbosely. This design introduces **MCP tools** that agents call directly:

| MCP Tool | Purpose | High-Bandwidth Feature |
|----------|---------|------------------------|
| `svg_stamp` | Create elements from templates | Batch instances + grid generation |
| `svg_batch` | Multiple operations per call | Atomic transactions |
| `svg_edit` | Guarded element mutations | Hash verification |
| `svg_query` | Find, positions, collisions | Structured queries |
| `svg_create` | Generate from plan | Layered templates |
| `svg_fix_collisions` | Auto-repair overlaps | Smart nudge strategies |

Key features:
1. **Template Library** — Reusable parametric components (legends, cards, nodes, badges)
2. **Instance Batching** — Stamp multiple elements from a template in one call
3. **Dense Payload Format** — Compact JSON that expands to full SVG
4. **Guard System** — Hash/path verification before mutations
5. **Collision-Aware Auto-Fix** — Detect and repair overlaps automatically

---

## Problem Statement

| Issue | Impact | Solution |
|-------|--------|----------|
| Verbose element specification | High token cost, slow generation | Templates + dense payloads |
| No batch operations | Multiple tool calls for similar elements | Instance arrays |
| No guardrails | Silent corruption, invalid SVG | Hash/path guards, syntax validation |
| Weak error recovery | Agents don't know what went wrong | Structured errors, suggestions |
| Position math errors | Overlaps, clipping, wrong placement | Collision detection + auto-fix |
| No reusability | Reinvent patterns each time | Template catalog |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SVG Tooling V2 Stack                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐            │
│  │   svg-gen    │   │   svg-edit   │   │svg-collisions│            │
│  │  (creation)  │   │  (mutation)  │   │ (validation) │            │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘            │
│         │                  │                  │                     │
│         ▼                  ▼                  ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     Recipe Engine                            │   │
│  │  • Step sequencing    • Variable substitution                │   │
│  │  • Conditional logic  • Error handling strategies            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                  │                  │                     │
│         ▼                  ▼                  ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Template Engine                           │   │
│  │  • Slot expansion     • Parameter validation                 │   │
│  │  • Instance batching  • Transform computation                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                  │                  │                     │
│         ▼                  ▼                  ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     Guard System                             │   │
│  │  • Hash verification  • Span tracking                        │   │
│  │  • Syntax validation  • Collision detection                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                  │                  │                     │
│         ▼                  ▼                  ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    DOM Manipulation                          │   │
│  │  • XML parsing        • Transform chain computation          │   │
│  │  • Attribute setting  • Element insertion/removal            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Template System

### 1.1 Template Definition Schema

Templates live in `tools/dev/svg-templates/` as JSON files:

```json
{
  "name": "badge",
  "version": "1.0.0",
  "description": "Rounded rectangle badge with centered text",
  "category": "label",
  
  "parameters": {
    "text": { "type": "string", "required": true },
    "bgColor": { "type": "color", "default": "#4a90d9" },
    "textColor": { "type": "color", "default": "#ffffff" },
    "width": { "type": "number", "default": 80, "min": 40, "max": 200 },
    "height": { "type": "number", "default": 24, "min": 16, "max": 60 },
    "cornerRadius": { "type": "number", "default": 4 },
    "fontSize": { "type": "number", "default": 12 }
  },
  
  "anchor": { "x": "center", "y": "center" },
  
  "svg": "<g class=\"badge\" data-template=\"badge\">\n  <rect width=\"${width}\" height=\"${height}\" rx=\"${cornerRadius}\" fill=\"${bgColor}\"/>\n  <text x=\"${width/2}\" y=\"${height/2 + fontSize/3}\" text-anchor=\"middle\" font-size=\"${fontSize}\" fill=\"${textColor}\">${text}</text>\n</g>",
  
  "bounds": {
    "width": "${width}",
    "height": "${height}"
  },
  
  "slots": {
    "icon": { "x": 8, "y": "${height/2}", "optional": true }
  }
}
```

### 1.2 Built-in Template Catalog

| Template | Purpose | Key Parameters |
|----------|---------|----------------|
| `badge` | Labeled tag/chip | text, bgColor, width |
| `node` | Graph node (circle/rect) | label, shape, size, color |
| `edge` | Connection line | from, to, style, label |
| `card` | Info card with header | title, body, width, height |
| `legend-item` | Legend row | color, label |
| `legend` | Complete legend box | items[], position |
| `axis-x` | Horizontal axis | min, max, ticks, label |
| `axis-y` | Vertical axis | min, max, ticks, label |
| `grid` | Background grid | cols, rows, spacing |
| `swimlane` | Horizontal lane | label, height, color |
| `connector` | Smart path between points | from, to, routing |
| `tooltip` | Positioned tooltip | text, anchor, position |
| `marker` | Map/chart marker | x, y, icon, label |

### 1.3 Instance Batching

Create multiple elements from a template in one call:

```bash
# Dense: array of parameter objects
node tools/dev/svg-edit.js diagram.svg \
  --stamp badge \
  --instances '[
    {"text":"Alpha","x":100,"y":50},
    {"text":"Beta","x":200,"y":50,"bgColor":"#e74c3c"},
    {"text":"Gamma","x":300,"y":50}
  ]' \
  --json

# From file (for large batches)
node tools/dev/svg-edit.js diagram.svg \
  --stamp badge \
  --instances-file markers.json \
  --json
```

**Instance file format** (supports repetition patterns):

```json
{
  "template": "marker",
  "defaults": { "size": 8, "color": "#3498db" },
  "instances": [
    { "x": 100, "y": 50, "label": "A" },
    { "x": 200, "y": 50, "label": "B" }
  ],
  "grid": {
    "enabled": true,
    "startX": 50, "startY": 100,
    "cols": 5, "rows": 3,
    "spacingX": 60, "spacingY": 40,
    "labelPattern": "Node-${row}-${col}"
  }
}
```

This stamps 2 explicit instances + 15 grid instances (5×3) = 17 elements in one call.

---

## 2. Dense Payload Format

### 2.1 Compact Element Specification

Instead of full SVG markup, use a compact JSON format that expands:

```json
{
  "elements": [
    { "t": "rect", "x": 10, "y": 20, "w": 100, "h": 50, "fill": "#abc" },
    { "t": "text", "x": 60, "y": 45, "text": "Hello", "anchor": "middle" },
    { "t": "circle", "cx": 200, "cy": 100, "r": 30, "stroke": "#000" },
    { "t": "path", "d": "M10,10 L100,100", "stroke": "#f00" },
    { "t": "@badge", "x": 300, "y": 50, "text": "Status" }
  ]
}
```

**Key features:**
- `t` = tag (single char saves tokens)
- `@name` = template reference
- Shorthand attrs: `w`→width, `h`→height, `cx`/`cy` for circles
- Implicit units (assume pixels)
- Color shorthand supported (`#abc` → `#aabbcc`)

### 2.2 Expansion Rules

| Compact | Expands To |
|---------|------------|
| `"t": "rect"` | `<rect>` |
| `"w": 100` | `width="100"` |
| `"h": 50` | `height="50"` |
| `"anchor": "middle"` | `text-anchor="middle"` |
| `"t": "@badge"` | Template expansion |
| `"transform": [["translate", 10, 20], ["rotate", 45]]` | `transform="translate(10,20) rotate(45)"` |

### 2.3 Bulk Operations

```json
{
  "operations": [
    { "op": "insert", "parent": "#layer-1", "elements": [...] },
    { "op": "move", "selector": ".marker", "by": { "x": 10, "y": 0 } },
    { "op": "set", "selector": "#title", "attrs": { "fill": "#333" } },
    { "op": "delete", "selector": ".temp-guides" },
    { "op": "stamp", "template": "badge", "parent": "#labels", "instances": [...] }
  ]
}
```

All operations in one tool call, applied atomically.

---

## 3. Recipe System (Multi-Step Workflows)

### 3.1 Recipe Schema

```json
{
  "name": "add-legend-to-diagram",
  "version": "1.0.0",
  "description": "Add a positioned legend with collision avoidance",
  
  "parameters": {
    "items": { "type": "array", "required": true },
    "position": { "type": "string", "default": "bottom-right", "enum": ["top-left", "top-right", "bottom-left", "bottom-right"] }
  },
  
  "steps": [
    {
      "name": "Analyze space",
      "operation": "svg-validate",
      "action": "bounds",
      "emit": "viewbox"
    },
    {
      "name": "Check existing legend",
      "operation": "svg-validate",
      "action": "find",
      "selector": ".legend",
      "emit": "existingLegend",
      "onError": "continue"
    },
    {
      "name": "Remove old legend if exists",
      "condition": "${step2.existingLegend.found}",
      "operation": "svg-edit",
      "action": "delete",
      "selector": ".legend"
    },
    {
      "name": "Calculate position",
      "operation": "compute",
      "expression": {
        "x": "${position.startsWith('right') ? step1.viewbox.width - 120 : 20}",
        "y": "${position.endsWith('bottom') ? step1.viewbox.height - (items.length * 20 + 30) : 20}"
      },
      "emit": "legendPos"
    },
    {
      "name": "Insert legend",
      "operation": "svg-edit",
      "action": "stamp",
      "template": "legend",
      "parent": "svg",
      "params": {
        "x": "${step4.legendPos.x}",
        "y": "${step4.legendPos.y}",
        "items": "${parameters.items}"
      }
    },
    {
      "name": "Verify no collisions",
      "operation": "svg-collisions",
      "flags": ["--strict"],
      "assert": { "high": 0 },
      "onError": "abort"
    }
  ]
}
```

### 3.2 Recipe Execution

```bash
# Dry-run (preview changes)
node tools/dev/svg-edit.js diagram.svg \
  --recipe tools/dev/svg-recipes/add-legend.json \
  --param 'items=[{"color":"#e74c3c","label":"Error"},{"color":"#2ecc71","label":"Success"}]' \
  --json

# Apply changes
node tools/dev/svg-edit.js diagram.svg \
  --recipe tools/dev/svg-recipes/add-legend.json \
  --param 'items=[...]' \
  --fix
```

### 3.3 Built-in Recipes

| Recipe | Purpose |
|--------|---------|
| `add-legend` | Insert positioned legend with collision check |
| `auto-fix-overlaps` | Detect and nudge overlapping elements |
| `add-title` | Insert/replace diagram title |
| `stamp-grid` | Create grid of elements from template |
| `connect-nodes` | Draw edges between nodes by ID |
| `add-axis` | Insert axis with computed ticks |
| `reflow-labels` | Redistribute overlapping labels |

---

## 4. Guard System (js-edit Parity)

### 4.1 Element Hashing

Each element gets a content hash based on normalized outerHTML:

```javascript
function computeElementHash(element) {
  // Normalize: sort attributes, remove whitespace variations
  const normalized = normalizeElement(element);
  const hash = crypto.createHash('sha256')
    .update(normalized)
    .digest('base64')
    .slice(0, 12); // 12-char base64
  return hash;
}
```

### 4.2 Path Signatures

Canonical selectors include ancestry for disambiguation:

```
svg > g#layer-main > g.nodes > rect#node-alpha
svg > g#layer-main > g.nodes > text:nth-child(2)
```

### 4.3 Guard Workflow

```bash
# Step 1: Index elements, capture guards
node tools/dev/svg-edit.js diagram.svg --index --json
# Output: { elements: [{ selector: "...", hash: "abc123...", bounds: {...} }] }

# Step 2: Locate specific element
node tools/dev/svg-edit.js diagram.svg \
  --locate "#my-element" \
  --emit-plan plan.json
# plan.json: { selector, hash, bounds, pathSignature }

# Step 3: Apply guarded edit
node tools/dev/svg-edit.js diagram.svg \
  --set "#my-element" \
  --attrs '{"fill":"#ff0000"}' \
  --expect-hash "abc123..." \
  --preview-edit \
  --json

# Step 4: Apply with --fix after review
node tools/dev/svg-edit.js diagram.svg \
  --set "#my-element" \
  --attrs '{"fill":"#ff0000"}' \
  --expect-hash "abc123..." \
  --fix
```

### 4.4 Validation Checks

| Check | When | Failure Action |
|-------|------|----------------|
| XML syntax | After every mutation | Abort, show error location |
| Hash match | Before mutation | Abort unless `--force` |
| Bounds containment | After insertion | Warning + position adjustment |
| Transform validity | On transform attr | Reject invalid syntax |
| Color format | On fill/stroke | Normalize or reject |
| ID uniqueness | On insert | Auto-suffix or reject |

---

## 5. Collision Detection & Auto-Fix

### 5.1 Enhanced Output

```bash
node tools/dev/svg-collisions.js diagram.svg --strict --positions --json
```

```json
{
  "summary": { "high": 2, "medium": 1, "low": 0, "info": 3 },
  "collisions": [
    {
      "type": "text-overlap",
      "severity": "high",
      "elements": [
        { "id": "label-1", "selector": "...", "bounds": { "x": 100, "y": 50, "width": 80, "height": 14 } },
        { "id": "label-2", "selector": "...", "bounds": { "x": 170, "y": 50, "width": 60, "height": 14 } }
      ],
      "intersection": { "x": 170, "y": 50, "width": 10, "height": 14 },
      "repair": {
        "strategy": "nudge-horizontal",
        "target": "#label-2",
        "vector": { "dx": 15, "dy": 0 },
        "command": "svg-edit diagram.svg --move \"#label-2\" --by \"x=15\" --fix"
      }
    }
  ],
  "elements": [
    { "id": "label-1", "tagName": "text", "absoluteBounds": {...}, "hash": "..." },
    { "id": "label-2", "tagName": "text", "absoluteBounds": {...}, "hash": "..." }
  ]
}
```

### 5.2 Auto-Fix Mode

```bash
# Preview fixes
node tools/dev/svg-collisions.js diagram.svg --fix --dry-run --json

# Apply safe fixes
node tools/dev/svg-collisions.js diagram.svg --fix

# Fix only high severity
node tools/dev/svg-collisions.js diagram.svg --fix --severity high
```

**Safe fix strategies:**

| Issue | Strategy | Risk |
|-------|----------|------|
| Text-text overlap | Nudge later element | Low |
| Text-rect overlap | Nudge text | Low |
| Element outside viewBox | Clamp to edge | Medium |
| Excessive overlap (>50%) | Suggest manual review | High |

---

## 6. Guided Workflows for Weaker Models

### 6.1 Preset Operations

```bash
# Wizard mode: interactive prompts for missing params
node tools/dev/svg-edit.js diagram.svg --wizard add-legend

# Preset: common operation with sensible defaults
node tools/dev/svg-edit.js diagram.svg \
  --preset "title" \
  --text "My Diagram" \
  --json
```

### 6.2 Operation Presets

| Preset | What It Does |
|--------|--------------|
| `title` | Add/replace centered title at top |
| `subtitle` | Add subtitle below title |
| `legend-br` | Add legend at bottom-right |
| `legend-tl` | Add legend at top-left |
| `watermark` | Add subtle watermark |
| `border` | Add border rectangle |
| `scale-fit` | Scale content to fit viewBox |

### 6.3 Error Guidance

When operations fail, provide actionable suggestions:

```json
{
  "success": false,
  "error": {
    "code": "SELECTOR_NOT_FOUND",
    "message": "Element '#my-label' not found",
    "suggestions": [
      "Use --index to list all elements",
      "Similar elements found: #my-label-1, #my-label-2",
      "Try selector: text:contains('my')"
    ],
    "command": "node tools/dev/svg-edit.js diagram.svg --index --json"
  }
}
```

### 6.4 Schema Validation

Reject obviously wrong inputs early:

```javascript
// Before processing
validateParams({
  x: "abc",      // ERROR: expected number
  fill: "red",   // OK: valid color name
  width: -50,    // ERROR: must be positive
  opacity: 1.5   // WARNING: clamped to 1.0
});
```

---

## 7. CLI Interface Summary

### svg-edit.js (Mutations)

```
Usage: svg-edit.js <file.svg> [options]

Discovery:
  --index                    List all elements with selectors and hashes
  --find <selector>          Find element and show details
  --outline                  Show structural tree

Mutations:
  --set <selector>           Set attributes on element
    --attrs <json>           Attributes to set
  --move <selector>          Move element
    --by <x=N,y=N>           Relative offset
    --to <x=N,y=N>           Absolute position
  --delete <selector>        Remove element
  --insert <parent>          Insert element
    --element <json>         Element specification
  --stamp <template>         Stamp template
    --instances <json>       Array of instance params
    --instances-file <path>  Load instances from file

Batch:
  --batch <json>             Apply multiple operations
  --batch-file <path>        Load operations from file
  --recipe <path>            Execute recipe file
    --param <key=value>      Recipe parameter

Guards:
  --expect-hash <hash>       Verify element hash before mutation
  --emit-plan <path>         Write guard plan to file

Output:
  --preview-edit             Show unified diff preview
  --dry-run                  Don't modify file
  --fix                      Apply changes
  --json                     JSON output
```

### svg-gen.js (Creation)

```
Usage: svg-gen.js [options]

Creation:
  --from <plan.json>         Generate from plan file
  --template <name>          Start from template
  --viewBox <w,h>            Set dimensions
  --output <path>            Output file path

Plan format:
  {
    "viewBox": { "width": 800, "height": 600 },
    "background": "#ffffff",
    "layers": [
      { "id": "grid", "elements": [...] },
      { "id": "nodes", "stamp": "node", "instances": [...] },
      { "id": "labels", "elements": [...] }
    ]
  }
```

### svg-collisions.js (Validation)

```
Usage: svg-collisions.js <file.svg> [options]

Detection:
  --strict                   Fail on any HIGH severity
  --positions                Include absolute positions
  --severity <level>         Filter by severity

Repair:
  --fix                      Apply safe auto-fixes
  --fix-severity <level>     Only fix specific severity

Output:
  --json                     JSON output with repair commands
  --verbose                  Detailed output
```

---

## 8. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Dense payload parser and expander
- [ ] Template engine with parameter substitution
- [ ] Guard system (hash computation, verification)
- [ ] Basic --batch mode for svg-edit

### Phase 2: Templates (Week 2-3)
- [ ] Template schema and loader
- [ ] Built-in template catalog (badge, node, card, legend)
- [ ] --stamp with single instance
- [ ] Instance batching with arrays

### Phase 3: Recipes (Week 3-4)
- [ ] Recipe parser and executor
- [ ] Variable substitution engine
- [ ] Conditional step logic
- [ ] Built-in recipe catalog

### Phase 4: Collision Integration (Week 4-5)
- [ ] Enhanced --positions output
- [ ] Repair vector computation
- [ ] --fix mode with safe strategies
- [ ] Recipe integration with collision checks

### Phase 5: Polish (Week 5-6)
- [ ] --wizard mode for guided workflows
- [ ] Preset operations
- [ ] Enhanced error messages with suggestions
- [ ] Documentation and examples

---

## 9. Example Workflows

### 9.1 Create Diagram from Scratch

```bash
# One command creates entire diagram
node tools/dev/svg-gen.js \
  --from plan.json \
  --output diagrams/architecture.svg

# plan.json
{
  "viewBox": { "width": 800, "height": 600 },
  "background": "#f8f9fa",
  "layers": [
    {
      "id": "grid",
      "stamp": "grid",
      "params": { "cols": 8, "rows": 6, "color": "#e9ecef" }
    },
    {
      "id": "nodes",
      "stamp": "node",
      "instances": [
        { "id": "db", "x": 100, "y": 300, "label": "Database", "shape": "cylinder" },
        { "id": "api", "x": 400, "y": 300, "label": "API Server", "shape": "rect" },
        { "id": "ui", "x": 700, "y": 300, "label": "Frontend", "shape": "rect" }
      ]
    },
    {
      "id": "edges",
      "stamp": "edge",
      "instances": [
        { "from": "#db", "to": "#api", "label": "SQL" },
        { "from": "#api", "to": "#ui", "label": "REST" }
      ]
    },
    {
      "id": "title",
      "stamp": "title",
      "params": { "text": "System Architecture" }
    }
  ]
}
```

### 9.2 Batch Update Existing Diagram

```bash
# Update 50 markers at once
node tools/dev/svg-edit.js map.svg \
  --batch '[
    { "op": "set", "selector": ".marker", "attrs": { "r": "8" } },
    { "op": "stamp", "template": "marker", "parent": "#markers", "instances-file": "new-markers.json" },
    { "op": "delete", "selector": ".deprecated" }
  ]' \
  --preview-edit \
  --json
```

### 9.3 Fix Overlapping Labels

```bash
# Detect and fix in one pass
node tools/dev/svg-collisions.js diagram.svg --fix --json

# Or use recipe for complex fixes
node tools/dev/svg-edit.js diagram.svg \
  --recipe svg-recipes/reflow-labels.json \
  --fix
```

---

## 10. Token Efficiency Comparison

| Operation | Current (verbose) | V2 (dense) | Savings |
|-----------|-------------------|------------|---------|
| Add 10 badges | ~2000 tokens | ~200 tokens | 90% |
| Update 20 colors | 20 tool calls | 1 tool call | 95% |
| Create diagram | ~5000 tokens | ~500 tokens | 90% |
| Fix 5 overlaps | 5+ tool calls | 1 tool call | 80% |

---

## 11. Error Taxonomy

| Code | Meaning | Suggestion |
|------|---------|------------|
| `SELECTOR_NOT_FOUND` | Element doesn't exist | Use --index |
| `HASH_MISMATCH` | Element changed since locate | Re-run --locate |
| `INVALID_SVG` | Mutation broke syntax | Review changes |
| `TEMPLATE_NOT_FOUND` | Unknown template name | List templates |
| `PARAM_REQUIRED` | Missing required param | Check template schema |
| `PARAM_INVALID` | Wrong param type/range | Check constraints |
| `COLLISION_HIGH` | Severe overlap detected | Use --fix or manual |
| `BOUNDS_EXCEEDED` | Element outside viewBox | Adjust position |

---

## 12. Files to Create

```
tools/dev/
├── svg-edit.js           # Enhanced mutation tool
├── svg-gen.js            # Creation from plans
├── svg-collisions.js     # Enhanced (existing)
├── svg-validate.js       # Enhanced (existing)
├── svg-templates/
│   ├── badge.json
│   ├── node.json
│   ├── edge.json
│   ├── card.json
│   ├── legend.json
│   ├── axis-x.json
│   ├── axis-y.json
│   ├── grid.json
│   └── marker.json
├── svg-recipes/
│   ├── add-legend.json
│   ├── auto-fix-overlaps.json
│   ├── add-title.json
│   ├── stamp-grid.json
│   └── reflow-labels.json
└── lib/
    ├── svgTemplateEngine.js
    ├── svgRecipeExecutor.js
    ├── svgGuardSystem.js
    ├── svgDensePayload.js
    └── svgCollisionRepair.js
```

---

## Appendix A: Template Schema (JSON Schema)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["name", "svg", "parameters"],
  "properties": {
    "name": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
    "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "description": { "type": "string" },
    "category": { "enum": ["shape", "label", "container", "connector", "decoration"] },
    "parameters": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["type"],
        "properties": {
          "type": { "enum": ["string", "number", "color", "boolean", "array"] },
          "required": { "type": "boolean" },
          "default": {},
          "min": { "type": "number" },
          "max": { "type": "number" },
          "enum": { "type": "array" }
        }
      }
    },
    "anchor": {
      "type": "object",
      "properties": {
        "x": { "enum": ["left", "center", "right"] },
        "y": { "enum": ["top", "center", "bottom"] }
      }
    },
    "svg": { "type": "string" },
    "bounds": {
      "type": "object",
      "properties": {
        "width": { "type": "string" },
        "height": { "type": "string" }
      }
    },
    "slots": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "x": {},
          "y": {},
          "optional": { "type": "boolean" }
        }
      }
    }
  }
}
```

---

## Appendix B: Recipe Step Schema

```json
{
  "type": "object",
  "required": ["name", "operation"],
  "properties": {
    "name": { "type": "string" },
    "operation": { "enum": ["svg-edit", "svg-validate", "svg-collisions", "compute", "report"] },
    "action": { "type": "string" },
    "condition": { "type": "string" },
    "emit": { "type": "string" },
    "onError": { "enum": ["abort", "continue", "retry"] },
    "maxRetries": { "type": "integer", "default": 1 }
  }
}
```
