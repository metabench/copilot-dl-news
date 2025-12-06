# Tooling Request: svg-collisions.js `--positions` Flag

**Status**: ✅ IMPLEMENTED  
**Submitted**: 2025-12-02  
**Completed**: 2025-12-02  
**Source**: SVG-FIX-002 benchmark test  
**Priority**: 🔴 CRITICAL (now resolved)

---

## TOOLING REQUEST

**Tool**: `svg-collisions.js`

**Current Limitation**: The tool reports overlaps with coordinates, but doesn't show where each individual element is positioned. When an agent sees "overlap at (401, 110)", it doesn't know which element is at what position, making it impossible to determine the correct fix without guessing.

**Requested Feature**: Add `--positions` flag that outputs absolute X,Y coordinates for all elements.

**Use Case**: When fixing SVG layout bugs, agents need to:
1. See where each element actually is (after all transforms applied)
2. Calculate how far to move elements to resolve overlaps
3. Verify containment (element within parent bounds)

**Example Input/Output**:

```bash
# Input
node tools/dev/svg-collisions.js docs/diagrams/diagram.svg --positions --json
```

```json
{
  "file": "docs/diagrams/diagram.svg",
  "elements": [
    {
      "id": "fact-registry-label",
      "tagName": "text",
      "textContent": "FactRegistry",
      "absolutePosition": { "x": 590, "y": 110 },
      "size": { "width": 113, "height": 8 },
      "bounds": { "left": 590, "top": 110, "right": 703, "bottom": 118 },
      "localPosition": { "x": 270, "y": 70 },
      "transforms": [
        { "source": "g#storage-panel", "type": "translate", "x": 320, "y": 40 }
      ],
      "path": "svg > g > g#storage-panel > text"
    },
    {
      "id": "document-fact-label",
      "tagName": "text",
      "textContent": "DocumentFact",
      "absolutePosition": { "x": 401, "y": 110 },
      "size": { "width": 200, "height": 8 },
      "bounds": { "left": 401, "top": 110, "right": 601, "bottom": 118 },
      "localPosition": { "x": 81, "y": 70 },
      "transforms": [
        { "source": "g#fact-panel", "type": "translate", "x": 320, "y": 40 }
      ],
      "path": "svg > g > g#fact-panel > text"
    }
  ],
  "collisions": [
    {
      "type": "text-overlap",
      "severity": "high",
      "element1": { /* includes absolutePosition */ },
      "element2": { /* includes absolutePosition */ },
      "overlap": { "x": 590, "y": 110, "width": 11, "height": 8 },
      "suggestion": "Move element1 right by 16px to resolve overlap"
    }
  ],
  "summary": { "total": 1, "high": 1, "medium": 0, "low": 0 }
}
```

---

## Evidence

### Benchmark Test SVG-FIX-002

The agent attempting to fix `docs/diagrams/fact-classification-architecture.svg` had to iterate multiple times because:
1. Collision report showed overlaps but not element positions
2. Agent had to calculate transform chains manually
3. Multiple guesses were needed to find correct offsets

### Session Notes

From the benchmark session:
> "I can see there's an overlap at (401, 110) but I don't know if FactRegistry is at X=401 or X=590. Without knowing the actual positions, I have to guess which element to move and by how much."

---

## Impact Assessment

| Without Fix | With Fix |
|-------------|----------|
| 5-10 iteration cycles to fix layout | 1-2 iteration cycles |
| Agent must manually trace transforms | Tool computes absolute positions |
| Guessing which element to move | Clear position data for each element |
| No containment verification | Can verify element fits in parent |

**Time savings estimate**: 80% reduction in SVG fix task duration

---

## Implementation Notes

The existing `svg-collisions.js` already has Puppeteer infrastructure that computes bounding boxes. The enhancement needs:

1. Add `--positions` flag to CLI parsing
2. Include `absolutePosition` and `size` in element data (already partially computed)
3. Extract transform chain using `getScreenCTM()` decomposition
4. Add `suggestion` field to collision reports with repair recommendations

**Effort estimate**: 2-3 hours

---

## Implementation Details (Completed)

The following was implemented in `tools/dev/svg-collisions.js`:

### 1. New `--positions` Flag
- Added to CLI parsing and help text
- When set, includes full `elements` array in output

### 2. Enhanced Collision Output
Each collision now includes for both elements:
- `absolutePosition: { x, y }` - where the element actually renders
- `size: { width, height }` - element dimensions
- `bounds: { left, top, right, bottom }` - edge coordinates

### 3. Repair Suggestions
New `repair` object added to each collision:
```json
{
  "repair": {
    "strategy": "separate-horizontal|separate-vertical|expand-container|increase-spacing",
    "suggestion": "Move element right by 16px",
    "alternatives": ["Move other element left by 16px", "Reduce text width"]
  }
}
```

### 4. Positions Report
When `--positions` flag used without `--json`, outputs human-readable element inventory grouped by tag type.

### Example Usage
```bash
# See element positions in JSON
node tools/dev/svg-collisions.js diagram.svg --positions --json

# See positions in console format
node tools/dev/svg-collisions.js diagram.svg --positions

# Full collision report with repair suggestions
node tools/dev/svg-collisions.js diagram.svg --strict --json
```

---

## Related Requests

- Position query (`--element <selector>`) - same infrastructure
- Containment check (`--containment`) - uses position data
- Repair suggestions - computed from position data

---

## References

- [SVG Tooling Architecture](../../docs/designs/SVG_TOOLING_ARCHITECTURE.md)
- [📐 SVG Spatial Reasoning Specialist](../../.github/agents/📐%20SVG%20Spatial%20Reasoning%20Specialist%20📐.agent.md)
- [SVG-FIX-002 Benchmark Test](../svg-fix-test-002.md)
