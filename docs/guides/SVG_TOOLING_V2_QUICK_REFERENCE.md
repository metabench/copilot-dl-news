# SVG Tooling V2 — MCP Tools Quick Reference

> Dense, guarded, template-based SVG generation and editing via MCP tool calls

---

## MCP Tools Overview

| Tool | Purpose | Key Parameter |
|------|---------|---------------|
| `svg_stamp` | Create elements from templates | `instances` (array or grid) |
| `svg_batch` | Multiple operations atomically | `operations` array |
| `svg_edit` | Guarded element mutations | `expectHash` for safety |
| `svg_query` | Find, positions, collisions | `action` type |
| `svg_create` | Generate from plan | `plan` with layers |
| `svg_fix_collisions` | Auto-repair overlaps | `severity` filter |

---

## svg_stamp — High-Bandwidth Element Creation

### Single Instance
```json
{
  "file": "diagram.svg",
  "template": "badge",
  "instances": { "text": "Status", "x": 100, "y": 50 },
  "dryRun": false
}
```

### Batch Instances (3 badges in one call)
```json
{
  "file": "diagram.svg",
  "template": "badge",
  "instances": [
    { "text": "Alpha", "x": 100, "y": 50 },
    { "text": "Beta", "x": 200, "y": 50, "bgColor": "#e74c3c" },
    { "text": "Gamma", "x": 300, "y": 50 }
  ],
  "dryRun": false
}
```

### Grid Generation (20 nodes in one call)
```json
{
  "file": "diagram.svg",
  "template": "node",
  "defaults": { "shape": "rect", "fill": "#e8f4f8" },
  "grid": {
    "startX": 100, "startY": 100,
    "cols": 5, "rows": 4,
    "spacingX": 150, "spacingY": 80,
    "labelPattern": "Node-${row}-${col}"
  },
  "dryRun": false
}
```

---

## svg_batch — Atomic Multi-Operation

```json
{
  "file": "diagram.svg",
  "operations": [
    { "op": "stamp", "template": "badge", "instances": [{"text":"New","x":100,"y":50}] },
    { "op": "set", "selector": ".marker", "attrs": { "r": "8" } },
    { "op": "move", "selector": "#label", "by": { "x": 10 } },
    { "op": "delete", "selector": ".temp" }
  ],
  "atomic": true,
  "dryRun": false
}
```

All operations succeed or all rollback.

---

## svg_edit — Guarded Mutations

### Step 1: Query to get hash
```json
{
  "file": "diagram.svg",
  "action": "find",
  "selector": "#my-label"
}
```
Returns: `{ "hash": "abc123...", "bounds": {...} }`

### Step 2: Edit with guard
```json
{
  "file": "diagram.svg",
  "selector": "#my-label",
  "action": "set",
  "attrs": { "fill": "#ff0000" },
  "expectHash": "abc123...",
  "dryRun": false
}
```

If element changed, returns error with suggestion to re-query.

---

## svg_query — Discovery & Analysis

### Index all elements
```json
{ "file": "diagram.svg", "action": "index" }
```

### Find specific element
```json
{ "file": "diagram.svg", "action": "find", "selector": "#my-label" }
```

### Get absolute positions
```json
{ "file": "diagram.svg", "action": "positions", "selector": "text" }
```

### Detect collisions
```json
{ "file": "diagram.svg", "action": "collisions", "severity": "high" }
```

---

## svg_create — Generate from Plan

```json
{
  "output": "architecture.svg",
  "plan": {
    "viewBox": { "width": 800, "height": 600 },
    "background": "#f8f9fa",
    "layers": [
      {
        "id": "nodes",
        "template": "node",
        "instances": [
          { "id": "db", "x": 100, "y": 300, "label": "Database", "shape": "cylinder" },
          { "id": "api", "x": 400, "y": 300, "label": "API Server" }
        ]
      },
      {
        "id": "title",
        "elements": [
          { "t": "text", "x": 400, "y": 50, "text": "Architecture", "fs": 24, "anchor": "middle" }
        ]
      }
    ]
  }
}
```

---

## svg_fix_collisions — Auto-Repair

```json
{
  "file": "diagram.svg",
  "severity": "high",
  "padding": 8,
  "maxFixes": 10,
  "dryRun": false
}
```

Returns list of fixes applied and remaining issues.
