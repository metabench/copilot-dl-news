# SVG Overlap Detection & Correction CLI Tool Specification

## Purpose

A CLI tool for detecting and correcting element overlaps in SVG diagrams, designed for AI agent workflows.

## Core Features

### 1. Overlap Detection (`svg-overlap detect`)

```bash
svg-overlap detect <file.svg> [options]

Options:
  --section <name|range>   Focus on specific section (e.g., "1350-1850" or "Condition Types")
  --min-area <number>      Minimum overlap area to report (default: 50)
  --types <types>          Filter by overlap types: text-text, icon-text, polygon-text
  --ignore-decorative      Ignore intentional icon/shape decorations in headers
  --json                   Output JSON for agent consumption
  --verbose                Include element bounding boxes and transform chains
```

**Output format (JSON):**
```json
{
  "file": "diagram.svg",
  "overlaps": [
    {
      "id": "overlap-1",
      "severity": "high",
      "types": "text-text",
      "area": 517,
      "elementA": {
        "type": "text",
        "content": "Storage per decision:",
        "globalPosition": { "x": 630, "y": 2712 },
        "bbox": { "left": 630, "top": 2700, "right": 745, "bottom": 2722 }
      },
      "elementB": { ... },
      "suggestion": {
        "action": "move",
        "target": "elementB",
        "delta": { "x": 0, "y": 15 }
      }
    }
  ]
}
```

### 2. Overlap Classification

The tool categorizes overlaps by severity and intent:

| Category | Description | Default Action |
|----------|-------------|----------------|
| **decorative** | Icon/shape behind header text | Ignore |
| **intentional** | Text inside shapes (diamonds, boxes) | Ignore |
| **label** | Labels near/on their targets | Review |
| **problematic** | Unrelated text/elements overlapping | Fix |

### 3. Suggested Fixes (`svg-overlap suggest`)

```bash
svg-overlap suggest <file.svg> --overlap-id <id>

# Outputs possible fixes:
{
  "overlapId": "overlap-1",
  "fixes": [
    {
      "strategy": "move-y",
      "description": "Move element B down by 15px",
      "patch": {
        "selector": "text:contains('Storage per decision')",
        "attribute": "y",
        "oldValue": "2712",
        "newValue": "2727"
      }
    },
    {
      "strategy": "resize-font",
      "description": "Reduce font size of element A",
      "patch": { ... }
    }
  ]
}
```

### 4. Apply Fixes (`svg-overlap fix`)

```bash
svg-overlap fix <file.svg> --patch <patch.json> [--dry-run] [--backup]

# Or interactive mode:
svg-overlap fix <file.svg> --interactive
```

## Implementation Approach

### Transform Tracking

The key technical challenge is accurately computing global coordinates through nested `<g transform="...">` elements:

```javascript
class TransformStack {
  constructor() {
    this.stack = [{ x: 0, y: 0, scale: 1, rotate: 0 }];
  }
  
  push(transformStr) {
    const current = this.current();
    const parsed = this.parseTransform(transformStr);
    this.stack.push({
      x: current.x + parsed.x,
      y: current.y + parsed.y,
      scale: current.scale * parsed.scale,
      rotate: current.rotate + parsed.rotate
    });
  }
  
  pop() {
    if (this.stack.length > 1) this.stack.pop();
  }
  
  current() {
    return this.stack[this.stack.length - 1];
  }
  
  toGlobal(localX, localY) {
    const t = this.current();
    return {
      x: t.x + localX * t.scale,
      y: t.y + localY * t.scale
    };
  }
}
```

### Text Bounding Box Estimation

For accurate text bounds without font metrics:

```javascript
function estimateTextBbox(text, fontSize, fontFamily, textAnchor) {
  // Character width ratios by font category
  const ratios = {
    'mono': 0.6,      // JetBrains Mono, Consolas
    'serif': 0.5,     // Georgia, Times
    'sans': 0.55      // Inter, Arial
  };
  
  const ratio = detectFontCategory(fontFamily);
  const width = text.length * fontSize * ratio;
  
  let left;
  switch (textAnchor) {
    case 'middle': left = -width / 2; break;
    case 'end': left = -width; break;
    default: left = 0;
  }
  
  return {
    left,
    right: left + width,
    top: -fontSize * 0.85,  // Ascender
    bottom: fontSize * 0.25  // Descender
  };
}
```

### Decorative Element Detection

Heuristics to identify intentional overlaps:

```javascript
function isDecorativeOverlap(elementA, elementB) {
  // Icons in section headers
  if (elementA.type === 'icon' && elementB.type === 'text') {
    if (elementB.content.includes('◆') || elementB.fontSize >= 18) {
      return true; // Header decoration
    }
  }
  
  // Text inside decision diamonds
  if (elementA.type === 'polygon' && elementB.type === 'text') {
    if (isPointInsidePolygon(elementB.center, elementA.points)) {
      return true; // Label inside shape
    }
  }
  
  return false;
}
```

## Integration with Existing Tools

### With js-scan
```bash
# Find SVG files in project
node tools/dev/js-scan.js --file-type svg --json

# Analyze all diagrams
for file in $(js-scan --file-type svg); do
  svg-overlap detect "$file" --json >> overlap-report.json
done
```

### With js-edit
```bash
# Generate fixes
svg-overlap suggest diagram.svg --all --json > fixes.json

# Apply via js-edit pattern
node tools/dev/js-edit.js --file diagram.svg --from-plan fixes.json
```

## Agent Workflow

```bash
# 1. Detect overlaps
svg-overlap detect diagram.svg --ignore-decorative --json > overlaps.json

# 2. Review and select fixes
# (Agent analyzes JSON, decides which overlaps to fix)

# 3. Generate patch
svg-overlap suggest diagram.svg --overlap-ids "overlap-1,overlap-3" --json > patch.json

# 4. Apply with verification
svg-overlap fix diagram.svg --patch patch.json --dry-run
svg-overlap fix diagram.svg --patch patch.json --backup
```

## Files to Create

1. `tools/dev/svg-overlap.js` - Main CLI tool
2. `tools/dev/lib/svg-parser.js` - SVG parsing with transform tracking
3. `tools/dev/lib/overlap-detector.js` - Overlap detection algorithms
4. `tools/dev/lib/fix-suggester.js` - Fix generation logic
5. `tests/tools/__tests__/svg-overlap.test.js` - Test suite

## Priority Overlaps to Fix in decision-tree-engine-deep-dive.svg

Based on analysis:

1. **"✓ 0.7" / "series-only"** (Y: 2300-2315) - Text labels too close
2. **"Patterns: explainer..." / "Category Summary"** - Horizontal text collision  
3. **Implementation notes row** - Multiple text elements at same Y
4. **Icon-header overlaps** - Mark as intentional (no fix needed)
