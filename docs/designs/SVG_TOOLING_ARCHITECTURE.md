# SVG Tooling Architecture for AI Agents

> **Purpose**: Define the comprehensive SVG tooling ecosystem that enables AI agents to create, validate, fix, and reason about SVG diagrams.

---

## Executive Summary

AI agents cannot "see" SVG output — they reason about coordinates mathematically. This creates a fundamental gap between what agents can compute and what actually renders. Our tooling must bridge this gap by:

1. **Computing what agents can't see** — Absolute positions, actual bounding boxes
2. **Validating what agents can't verify** — Visual overlaps, readability
3. **Providing actionable feedback** — Not just "overlap detected" but "move X by 14px"

---

## Current Tool Inventory

### `svg-validate.js` — Structural Validation

**Location**: `tools/dev/svg-validate.js`

**Capabilities**:
- XML well-formedness validation
- Duplicate ID detection
- viewBox and dimension validation
- Text element integrity
- Quick overlap estimation (without browser)
- Hash-based element referencing (`--index`, `--find`)

**Flags**:
| Flag | Purpose |
|------|---------|
| `--json` | Structured output for agents |
| `--dir <path>` | Batch directory scan |
| `--quick-overlap` | Fast text overlap estimation |
| `--index` | Build element index with hashes |
| `--find <selector>` | Find elements by hash, line, ID, tag |
| `--strict` | Warnings become errors |

**Strengths**:
- Fast (no browser required)
- Good for structural issues
- Hash-based element lookups

**Limitations**:
- Can't compute true bounding boxes (no transform cascade)
- Quick overlap is an estimate, not accurate
- No awareness of actual rendered positions

---

### `svg-collisions.js` — Visual Collision Detection

**Location**: `tools/dev/svg-collisions.js`

**Capabilities**:
- True collision detection via Puppeteer
- Classifies collisions by type (text-overlap, shape-overlap, text-clipped)
- Severity levels (HIGH, MEDIUM, LOW)
- Understands intentional patterns (text in boxes, connectors)

**Flags**:
| Flag | Purpose |
|------|---------|
| `--json` | Structured output for agents |
| `--strict` | Lower thresholds, more issues reported |
| `--positions` | Output absolute positions for all elements ✅ NEW |
| `--containment` | Check elements overflow parent bounds ✅ NEW |
| `--element <sel>` | Query position of specific element ✅ NEW |
| `--dir <path>` | Batch directory scan |
| `--verbose` | Show what's being skipped and why |

**Strengths**:
- Uses real browser rendering (accurate bounding boxes)
- Smart classification of intentional vs problematic overlaps
- Severity-based prioritization
- ✅ Reports absolute positions in collision output
- ✅ Provides repair suggestions for each collision
- ✅ Containment overflow detection
- ✅ Element position queries

**Recent Additions (Dec 2025)**:
- `--positions` flag with full element inventory
- `--containment` flag for parent overflow detection  
- `--element` flag for targeted position queries
- Repair suggestions with strategy and alternatives

---

### `svg-gen.js` — Diagram Generation

**Location**: `tools/dev/svg-gen.js`

**Capabilities**:
- Template-based SVG generation
- Theme color systems
- Box, text, connector primitives

**Role**: Creation, not validation

---

## Identified Gaps (From Benchmark Testing)

### Gap 1: Position Reporting (`--positions` flag)

**Problem**: When `svg-collisions.js` reports an overlap at coordinates, the agent doesn't know which element is at what position. It can't determine "move this element left by 20px."

**Current output**:
```
🔴 #1 [text-overlap] Text overlapping other text - unreadable
   → text "FactRegistry"
   → text "DocumentFact"
   Overlap: 85×8px at (401, 110)
```

**Needed output**:
```
🔴 #1 [text-overlap] Text overlapping other text - unreadable
   → text "FactRegistry" at (590, 110) size 113×8
   → text "DocumentFact" at (401, 110) size 200×8
   Overlap: 85×8px at (401, 110)
   Suggestion: Move "FactRegistry" right by at least 85px
```

**Solution**: Add `--positions` flag to `svg-collisions.js`

---

### Gap 2: Element Position Query

**Problem**: Agent wants to know "where is element X?" without running collision detection.

**Use case**: Before editing, understand the current layout.

**Solution Options**:
1. Add `--element <selector>` to `svg-collisions.js` 
2. Create `svg-layout.js` focused on position queries
3. Extend `svg-validate.js` with position computation

**Recommended**: Add to `svg-collisions.js` since it already has Puppeteer infrastructure.

---

### Gap 3: Transform Chain Explanation

**Problem**: When an element's position seems wrong, agent needs to understand HOW the position was computed.

**Use case**: "Why is this text at X=590 when I set it to X=270?"

**Needed output**:
```
Element: #fact-registry-label
  Local position: x=270, y=20
  Transform chain:
    1. Parent <g id="storage-panel">: translate(320, 40)
    2. Parent <g id="fact-column">: none
  Absolute position: (590, 60)
  
  Calculation: 270 + 320 = 590
```

**Solution**: Add `--transforms` flag or `--explain <element>` mode.

---

### Gap 4: Containment Validation

**Problem**: Elements extending outside their parent container (common layout bug).

**Current behavior**: Sometimes reported as `text-clipped`, but not systematic.

**Needed**: Dedicated containment check:
```
Element #fact-registry (width=120) exceeds parent #storage-panel (width=300)
  Parent right edge: 320 + 300 = 620
  Element right edge: 590 + 120 = 710
  Overflow: 90px
  Suggestion: Reduce width to 30 or move left by 90px
```

**Solution**: Add `--containment` flag to `svg-collisions.js`

---

### Gap 5: Repair Suggestions

**Problem**: Collision report says "problem" but not "solution."

**Current**: "Overlap at (401, 110)"  
**Needed**: "Move element2 down by 14px" or "Reduce text length by 5 chars"

**Implementation**: Compute minimum separation vectors.

---

### Gap 6: Layout Preview (Hypothetical Positions)

**Problem**: Agent wants to test "if I move X to position Y, will it still collide?"

**Use case**: Before editing SVG, simulate the fix.

**Solution**: `--simulate` mode that accepts position overrides.

---

## Proposed Tool Enhancements

### Phase 1: Essential Position Reporting ✅ COMPLETE

**Target**: `svg-collisions.js`

**Implemented Flags**:
| Flag | Purpose | Output | Status |
|------|---------|--------|--------|
| `--positions` | List all elements with absolute positions | Full element inventory | ✅ Done |
| `--element <sel>` | Query single element position | Position + bounds + hierarchy | ✅ Done |
| `--containment` | Check elements exceed parents | Overflow list with fixes | ✅ Done |

**Output Schema** (for `--positions`):
```json
{
  "elements": [
    {
      "id": "fact-registry-label",
      "tagName": "text",
      "textContent": "FactRegistry",
      "absolutePosition": { "x": 590, "y": 110 },
      "size": { "width": 113, "height": 8 },
      "bounds": { "left": 590, "top": 110, "right": 703, "bottom": 118 },
      "depth": 2,
      "docOrder": 15,
      "path": "svg > g > g#storage-panel > text"
    }
  ],
  "collisions": [/* existing */]
}
```

---

### Phase 2: Intelligent Suggestions ✅ COMPLETE

**Target**: `svg-collisions.js` collision report

**Implemented Output** (repair field in each collision):
```json
{
  "collision": {
    "type": "text-overlap",
    "severity": "high",
    "element1": {/* includes absolutePosition, size, bounds */},
    "element2": {/* includes absolutePosition, size, bounds */},
    "intersection": {/* x, y, width, height, area */},
    "repair": {
      "strategy": "separate-vertical",
      "suggestion": "Move \"element2\" down by 14px",
      "alternatives": [
        "Move \"element1\" up by 14px",
        "Reduce \"element2\" text by ~2 characters"
      ]
    }
  }
}
```

---

### Phase 3: Layout Simulation (Future)

**Target**: New mode or separate tool

**Command**:
```bash
node tools/dev/svg-collisions.js file.svg --simulate \
  --move "#element-id" --to "x=100,y=200" \
  --json
```

**Output**: Same collision report but with hypothetical positions applied.

---

## Implementation Priority

| Priority | Feature | Effort | Impact | Status |
|----------|---------|--------|--------|--------|
| 🔴 P0 | `--positions` flag | 2 hours | Unblocks all SVG fix tasks | ✅ Done |
| 🔴 P0 | Include positions in collision output | 1 hour | Immediate value | ✅ Done |
| 🟡 P1 | `--containment` flag | 2 hours | Catches overflow bugs | ✅ Done |
| 🟡 P1 | Repair suggestions | 2 hours | Actionable output | ✅ Done |
| 🟢 P2 | `--element` query | 1 hour | Debug specific elements | ✅ Done |
| 🔵 P3 | `--simulate` mode | 4 hours | Test before editing | Planned |
| 🔵 P3 | `svg-edit.js` tool | 6 hours | Direct manipulation | Planned |
| 🟡 P1 | `--containment` check | 2 hours | Catches common bug class |
| 🟡 P1 | Repair suggestions | 3 hours | Reduces iteration cycles |
| � P1 | `--fix` auto-correction mode | 4 hours | Zero-iteration fixes |
| 🟢 P2 | `--element` query | 1 hour | Convenient debugging |
| 🟢 P2 | Transform chain explanation | 2 hours | Educational value |
| 🟢 P2 | `svg-edit.js` — Element manipulation tool | 3 hours | Direct SVG editing |
| 🔵 P3 | Layout simulation | 4 hours | Advanced workflow |
| 🔵 P3 | `--auto-layout` intelligent reflow | 6 hours | Automatic layout optimization |

---

## Phase 4: SVG Editing Tools

### Gap 7: Direct Element Editing

**Problem**: Agents must manually edit SVG source to move/resize elements. This requires:
1. Finding the right element in XML
2. Calculating new attribute values
3. Understanding transform context
4. Avoiding breaking the structure

**Solution**: Create `svg-edit.js` — a CLI tool for safe SVG manipulation.

### `svg-edit.js` — Element Manipulation Tool

**Purpose**: Safely edit SVG elements by selector, with automatic position/transform handling.

**Commands**:

```bash
# Move an element (handles transforms automatically)
node tools/dev/svg-edit.js diagram.svg --move "#my-element" --by "x=20,y=0"
node tools/dev/svg-edit.js diagram.svg --move "#my-element" --to "x=400,y=100"

# Resize an element
node tools/dev/svg-edit.js diagram.svg --resize "#my-rect" --width 200 --height 100
node tools/dev/svg-edit.js diagram.svg --resize "#my-rect" --scale 1.5

# Set attributes
node tools/dev/svg-edit.js diagram.svg --set "#my-text" --attr "font-size=14"
node tools/dev/svg-edit.js diagram.svg --set "#my-rect" --attr "fill=#3b82f6"

# Delete element
node tools/dev/svg-edit.js diagram.svg --delete "#unwanted-element"

# Wrap element in group with transform
node tools/dev/svg-edit.js diagram.svg --wrap "#element" --translate "50,30"

# Preview changes without writing (dry-run)
node tools/dev/svg-edit.js diagram.svg --move "#el" --by "x=20" --dry-run --json
```

**Key Design Principles**:

1. **Selector-based** — Use CSS selectors or element hashes to target elements
2. **Transform-aware** — When moving, calculate correct local coordinates accounting for parent transforms
3. **Atomic operations** — Each command is one change; batch with shell
4. **Preview mode** — `--dry-run` shows what would change without modifying file
5. **Validation** — After edit, optionally run collision check

**Output Schema** (for `--dry-run --json`):

```json
{
  "operation": "move",
  "target": "#my-element",
  "before": {
    "localPosition": { "x": 100, "y": 50 },
    "absolutePosition": { "x": 420, "y": 90 }
  },
  "after": {
    "localPosition": { "x": 120, "y": 50 },
    "absolutePosition": { "x": 440, "y": 90 }
  },
  "changes": [
    { "attribute": "x", "from": "100", "to": "120" }
  ]
}
```

**Transform-Aware Movement Algorithm**:

```javascript
function moveElementTo(element, targetAbsoluteX, targetAbsoluteY) {
  // Get current absolute position
  const ctm = element.getScreenCTM();
  const currentLocal = { x: parseFloat(element.getAttribute('x')), y: parseFloat(element.getAttribute('y')) };
  
  // Compute inverse of parent transforms
  const parentCTM = element.parentNode.getScreenCTM();
  const inverseParentCTM = parentCTM.inverse();
  
  // Transform target absolute position to local coordinates
  const targetPoint = svg.createSVGPoint();
  targetPoint.x = targetAbsoluteX;
  targetPoint.y = targetAbsoluteY;
  const localTarget = targetPoint.matrixTransform(inverseParentCTM);
  
  // Update element attributes
  element.setAttribute('x', localTarget.x);
  element.setAttribute('y', localTarget.y);
}
```

---

### Gap 8: Auto-Correction Mode

**Problem**: Even with repair suggestions, agents must manually apply fixes. For simple issues, the tool should fix them automatically.

**Solution**: Add `--fix` flag to `svg-collisions.js` that automatically applies safe repairs.

### Auto-Correction (`--fix` flag)

**Command**:
```bash
# Detect and auto-fix all issues
node tools/dev/svg-collisions.js diagram.svg --fix

# Preview fixes without applying
node tools/dev/svg-collisions.js diagram.svg --fix --dry-run --json

# Fix only specific severity
node tools/dev/svg-collisions.js diagram.svg --fix --severity high

# Fix with backup
node tools/dev/svg-collisions.js diagram.svg --fix --backup
```

**Safe Auto-Fix Strategies**:

| Issue Type | Auto-Fix Strategy | Safety |
|------------|-------------------|--------|
| `text-overlap` | Move later element by separation vector | ✅ Safe |
| `text-clipped` | Expand container or move text inward | ⚠️ May affect layout |
| `shape-overlap` | Move later element | ⚠️ May cascade |
| `containment` | Move element inside parent bounds | ✅ Safe |

**Fix Priority Rules**:
1. Move elements, don't resize (preserves design intent)
2. Move the element that appears later in document order
3. Prefer vertical separation over horizontal (reading flow)
4. Minimum movement to resolve (plus padding)

**Output Schema** (for `--fix --json`):

```json
{
  "file": "diagram.svg",
  "issuesFound": 5,
  "issuesFixed": 4,
  "issuesSkipped": 1,
  "fixes": [
    {
      "issue": {
        "type": "text-overlap",
        "severity": "high",
        "element1": "#label-1",
        "element2": "#label-2"
      },
      "fix": {
        "action": "move",
        "element": "#label-2",
        "from": { "x": 100, "y": 50 },
        "to": { "x": 100, "y": 68 },
        "reason": "Moved down by 18px to clear overlap"
      }
    }
  ],
  "skipped": [
    {
      "issue": { "type": "shape-overlap", "severity": "low" },
      "reason": "Ambiguous fix — multiple valid strategies"
    }
  ],
  "newCollisions": 0
}
```

**Validation After Fix**:
After applying fixes, re-run collision detection to ensure:
1. Original issues are resolved
2. No new issues were introduced
3. Report any cascading problems

---

### Gap 9: Intelligent Layout Optimization

**Problem**: Sometimes the layout needs more than point fixes — it needs reflow.

**Solution**: Add `--auto-layout` mode for comprehensive layout optimization.

### Auto-Layout Mode (Future)

**Command**:
```bash
# Optimize layout for a group or entire SVG
node tools/dev/svg-collisions.js diagram.svg --auto-layout

# Optimize specific container
node tools/dev/svg-collisions.js diagram.svg --auto-layout --scope "#main-panel"

# Layout algorithm selection
node tools/dev/svg-collisions.js diagram.svg --auto-layout --algorithm "flow"
```

**Layout Algorithms**:

| Algorithm | Use Case | Behavior |
|-----------|----------|----------|
| `separate` | Minimal intervention | Only move overlapping elements apart |
| `flow` | Text-heavy diagrams | Reflow elements top-to-bottom, left-to-right |
| `grid` | Structured layouts | Snap elements to grid alignment |
| `force` | Network diagrams | Force-directed layout for even spacing |

**Constraints System**:
```json
{
  "constraints": {
    "maintainOrder": true,
    "preserveGroups": true,
    "minSpacing": 10,
    "maxDisplacement": 50,
    "anchorElements": ["#title", "#legend"]
  }
}
```

---

## Editing Tool Integration

### Workflow: Detect → Edit → Validate

```bash
# 1. Detect issues
node tools/dev/svg-collisions.js diagram.svg --positions --json > issues.json

# 2. Apply targeted edit
node tools/dev/svg-edit.js diagram.svg --move "#problem-element" --by "x=20"

# 3. Validate fix
node tools/dev/svg-collisions.js diagram.svg --strict
```

### Workflow: Auto-Fix All

```bash
# Single command to fix all issues
node tools/dev/svg-collisions.js diagram.svg --fix --backup

# If validation passes, done. If not, manual intervention needed.
```

### Workflow: Interactive Correction

```bash
# 1. Get fix suggestions
node tools/dev/svg-collisions.js diagram.svg --json | jq '.collisions[].repair'

# 2. Review and apply selectively
node tools/dev/svg-edit.js diagram.svg --move "#el1" --by "x=15"
node tools/dev/svg-edit.js diagram.svg --move "#el2" --by "y=20"

# 3. Final validation
node tools/dev/svg-collisions.js diagram.svg --strict
```

---

## Mathematical Foundation

### Transform Matrix Computation

SVG transforms are applied right-to-left (CSS order):

```
<g transform="translate(320, 40)">
  <g transform="translate(50, 10)">
    <text x="100" y="20">Hello</text>
  </g>
</g>

Absolute position:
  x = 100 + 50 + 320 = 470
  y = 20 + 10 + 40 = 70
```

For `translate()` only, transforms are additive:
```javascript
absoluteX = localX + parentTranslateX + grandparentTranslateX + ...
```

For `matrix(a,b,c,d,e,f)`:
```javascript
newX = a*x + c*y + e
newY = b*x + d*y + f
```

### Bounding Box Computation

Browser `getBBox()` returns local coordinates. Convert to absolute:

```javascript
const localBBox = element.getBBox();
const ctm = element.getScreenCTM(); // Cumulative Transform Matrix

// Transform corners
const topLeft = svg.createSVGPoint();
topLeft.x = localBBox.x;
topLeft.y = localBBox.y;
const absTopLeft = topLeft.matrixTransform(ctm);

const bottomRight = svg.createSVGPoint();
bottomRight.x = localBBox.x + localBBox.width;
bottomRight.y = localBBox.y + localBBox.height;
const absBottomRight = bottomRight.matrixTransform(ctm);

const absoluteBBox = {
  x: absTopLeft.x,
  y: absTopLeft.y,
  width: absBottomRight.x - absTopLeft.x,
  height: absBottomRight.y - absTopLeft.y
};
```

### Collision Detection Algorithm

Current implementation is O(n²) pairwise comparison. Optimizations:
1. **Spatial indexing** — R-tree for large diagrams
2. **Pre-filtering** — Skip elements in different regions
3. **Z-order awareness** — Only compare nearby z-levels

### Repair Vector Computation

For two overlapping rectangles, compute minimum translation:

```javascript
function computeSeparation(rect1, rect2) {
  // Compute overlap
  const overlapX = Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left);
  const overlapY = Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top);
  
  // Choose direction with smallest required movement
  if (overlapX < overlapY) {
    // Move horizontally
    const moveRight = rect2.left > rect1.left;
    return { 
      direction: moveRight ? 'right' : 'left', 
      distance: overlapX + padding 
    };
  } else {
    // Move vertically
    const moveDown = rect2.top > rect1.top;
    return { 
      direction: moveDown ? 'down' : 'up', 
      distance: overlapY + padding 
    };
  }
}
```

---

## Integration with Agent Workflow

### Fix Workflow (Current)

```
1. Agent runs svg-collisions.js
2. Sees "overlap at (401, 110)"
3. Has to GUESS which element to move
4. Makes edit
5. Re-runs validation
6. Repeat (high iteration count)
```

### Fix Workflow (With Enhancements)

```
1. Agent runs svg-collisions.js --positions
2. Sees:
   - "FactRegistry at (590, 110)"  
   - "DocumentFact at (401, 110)"
   - "Suggestion: Move FactRegistry right by 85px"
3. Makes precise edit
4. Re-runs validation
5. Done in 1-2 iterations
```

---

## Related Documents

- `docs/guides/SVG_CREATION_METHODOLOGY.md` — How to create diagrams
- `tests/ai-benchmark/svg-fix-test-002.md` — Benchmark test that identified gaps
- `.github/agents/📐 SVG Spatial Reasoning Specialist 📐.agent.md` — Specialist agent

---

## Changelog

| Date | Change |
|------|--------|
| 2025-12-02 | Initial architecture document |
| 2025-12-02 | Added Gap 1-6 from benchmark test analysis |
| 2025-12-02 | Defined Phase 1-3 implementation plan |
| 2025-12-02 | Added Phase 4: SVG Editing Tools (Gap 7-9) |
| 2025-12-02 | Added `svg-edit.js` specification |
| 2025-12-02 | Added `--fix` auto-correction mode design |
| 2025-12-02 | Added `--auto-layout` concept for future |

