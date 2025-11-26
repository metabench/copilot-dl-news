# SVG Collision Detector

A CLI tool that detects **problematic overlapping elements** in SVG diagrams using Puppeteer for accurate bounding box calculations.

## Purpose

When creating SVG diagrams, elements can accidentally overlap in ways that make text unreadable or shapes confusingly merged. This tool helps AI agents and developers identify these issues before publishing diagrams.

## Installation

The tool requires Puppeteer (already a project dependency):

```bash
npm install  # if not already installed
```

## Usage

```bash
# Analyze a single SVG file
node tools/dev/svg-collisions.js docs/diagrams/MY_DIAGRAM.svg

# Analyze all SVGs in a directory
node tools/dev/svg-collisions.js --dir docs/diagrams

# JSON output (for programmatic use)
node tools/dev/svg-collisions.js --dir docs/diagrams --json

# Stricter detection (lower thresholds)
node tools/dev/svg-collisions.js diagram.svg --strict

# Show analysis details (what was skipped and why)
node tools/dev/svg-collisions.js diagram.svg --verbose
```

## What Gets Detected

### 🔴 High Severity (Always Problems)

**Text overlapping other text** - When two text elements occupy the same space, making one or both unreadable.

```
Example: A label "Birmingham" overlapping with "Camden" makes both illegible
```

### 🟠 Medium Severity (Usually Problems)

**Line/path covering text** - When connector lines pass through text labels, reducing readability.

**Significant shape overlaps** - When two opaque shapes substantially overlap at similar z-levels (not nested containers).

### 🟡 Low Severity (Potential Issues)

**Text extending outside container** - When text inside a box extends beyond its visual boundaries (clipping risk).

**General overlaps** - Other significant overlaps caught in strict mode.

## What Gets Ignored (Intentional Design)

The tool is smart about common SVG patterns:

- ✅ **Text inside container rectangles** - Normal label design (text on colored background)
- ✅ **Text on colored backgrounds** - Intentional visual grouping
- ✅ **Lines/paths near text** - Connectors and arrows are expected to pass near labels
- ✅ **Overlaps < 20%** - Minor incidental overlaps that don't affect readability
- ✅ **Parent-child relationships** - A rect inside its `<g>` wrapper isn't a collision
- ✅ **Group (`<g>`) elements** - Structural containers, not visual elements
- ✅ **Transparent elements** - Elements with opacity 0 or very low fill-opacity
- ✅ **Filter/gradient definitions** - `<defs>`, `<filter>`, `<linearGradient>`, etc.
- ✅ **Background containers** - Large rectangles (>10x area) that contain smaller elements
- ✅ **Header/body patterns** - Card designs where colored headers overlap white body areas
- ✅ **Adjacent layered elements** - Elements close in document order with small overlaps

## Output Format

### Console Output (Default)

```
══════════════════════════════════════════════════════════════════════
SVG Analysis: GAZETTEER_HIERARCHY.svg
══════════════════════════════════════════════════════════════════════

Elements: 92 | Pairs checked: 3867

⚠️  Found 3 issue(s):
   🔴 High: 1  🟠 Medium: 2  🟡 Low: 0

──────────────────────────────────────────────────────────────────────

🔴 #1 [text-overlap] Text overlapping other text - unreadable
   → text "Camden"
   → text "Birmingham"
   Overlap: 17×11px at (163, 386)

🟠 #2 [line-over-text] Line/path significantly covers text
   → text "ErrorTracker"
   → line
   Overlap: 38×10px at (568, 258)

──────────────────────────────────────────────────────────────────────
💡 Suggestions:
   • Increase spacing between text elements
   • Adjust font sizes or use abbreviations
```

### JSON Output (--json flag)

```json
{
  "file": "docs/diagrams/EXAMPLE.svg",
  "totalElements": 92,
  "pairsAnalyzed": 3867,
  "pairsSkipped": 500,
  "collisions": [
    {
      "element1": {
        "tagName": "text",
        "id": null,
        "textContent": "Camden",
        "bbox": { "x": 163, "y": 380, "width": 50, "height": 15 },
        "description": "text \"Camden\""
      },
      "element2": {
        "tagName": "text",
        "textContent": "Birmingham",
        "description": "text \"Birmingham\""
      },
      "intersection": { "x": 163, "y": 386, "width": 17, "height": 11, "area": 187 },
      "type": "text-overlap",
      "severity": "high",
      "reason": "Text overlapping other text - unreadable"
    }
  ],
  "summary": {
    "total": 1,
    "high": 1,
    "medium": 0,
    "low": 0
  }
}
```

## Exit Codes

- `0` - No issues found (or only in non-strict mode and below threshold)
- `1` - Issues detected

This allows the tool to be used in CI pipelines:

```bash
node tools/dev/svg-collisions.js --dir docs/diagrams || echo "SVG issues found!"
```

## How It Works

1. **Puppeteer Rendering** - Each SVG is loaded into a headless browser to get accurate bounding boxes after CSS/transform application
2. **Element Extraction** - All visual elements are collected with their computed bounding boxes, document order, and attributes
3. **Pair Analysis** - Every pair of elements is checked for intersection
4. **Smart Classification** - Overlaps are classified based on element types, z-order, containment, and structural relationships
5. **Filtering** - Intentional design patterns are filtered out
6. **Reporting** - Remaining issues are sorted by severity and reported

## Tips for Fixing Issues

### Text-over-text (High Severity)
- Increase spacing between text elements
- Reduce font size
- Shorten text (use abbreviations)
- Move elements to different positions

### Line-over-text (Medium Severity)
- Route connector lines around text
- Add small gaps in lines where they cross text
- Move labels away from connector paths

### Shape overlaps (Medium Severity)
- Increase spacing between shapes
- Use transparency if overlap is intentional
- Nest shapes properly (put one inside the other's `<g>`)

## Integration with AI Agents

AI agents creating SVG diagrams should run this tool after generating each diagram:

```bash
# Agent workflow
node tools/dev/svg-collisions.js docs/diagrams/NEW_DIAGRAM.svg --json
```

If issues are found, the agent should:
1. Parse the JSON output
2. Identify the overlapping elements by their descriptions/paths
3. Adjust positions in the SVG source
4. Re-run the tool to verify fixes

## Related Documentation

- [AGENTS.md](../AGENTS.md) - "Diagrams over walls of text" directive
- [tools/dev/README.md](../../tools/dev/README.md) - Other dev tools
