# Fix: Broken SVG Layout — Fact-Based Classification System

**Goal:** Fix an existing SVG diagram that has layout problems (overlapping text, mispositioned elements). Validate your fix passes collision detection.

---

## The Problem

The file `docs/diagrams/fact-classification-architecture.svg` was created but has **layout bugs**:
- Overlapping text elements (unreadable)
- Elements extending outside their parent containers
- Mispositioned boxes due to nested transform miscalculations

The collision detector found **8 HIGH severity issues** and 45 LOW issues.

---

## Your Task

1. **Run the collision detector** to see the current issues:
   ```bash
   node tools/dev/svg-collisions.js docs/diagrams/fact-classification-architecture.svg --strict
   ```

2. **Analyze the issues** — understand what's wrong

3. **Fix the SVG** — adjust positions, text lengths, container sizes

4. **Validate your fix** — re-run collision detection until:
   - Zero 🔴 HIGH severity issues
   - Review all 🟡 LOW issues (some may be intentional)

5. **Document what you fixed** in your response

---

## Issue Categories You'll Encounter

| Issue Type | What It Means | How to Fix |
|------------|---------------|------------|
| `[text-overlap]` | Two text elements overlap, making one unreadable | Move elements apart, shorten text, or adjust font size |
| `[text-clipped]` | Text extends outside its container | Expand container, shorten text, or move text position |
| `[general-overlap]` | Shapes overlap significantly | May be intentional (icons on containers) or an error |

---

## Key Debugging Technique: Absolute Position Calculation

When elements are nested inside `<g transform="translate(x,y)">`, you must calculate absolute positions:

```
Parent at translate(320, 40) with width=300
├── Child at translate(270, 20) with width=120
│   Absolute X = 320 + 270 = 590
│   Absolute right edge = 590 + 120 = 710
│   Parent right edge = 320 + 300 = 620
│   ❌ 710 > 620 → OVERFLOW!
```

---

## 🔧 Tooling Request Protocol

If the existing tools are insufficient, you may **request improved tooling**. This request will be routed to a specialist agent.

### How to Request Tooling

Write a clear request in this format:

```markdown
## TOOLING REQUEST

**Tool**: [name of existing tool to improve, or "NEW" for new tool]
**Current Limitation**: [what the tool doesn't do that you need]
**Requested Feature**: [specific capability you want]
**Use Case**: [how you would use it to fix this problem]
**Example Input/Output**: [concrete example of what you'd run and what you'd expect]
```

### Example Tooling Requests

**Example 1: Better position reporting**
```markdown
## TOOLING REQUEST

**Tool**: svg-collisions.js
**Current Limitation**: Reports overlaps but doesn't show the absolute positions of elements
**Requested Feature**: Add `--positions` flag that outputs absolute X,Y coordinates for all elements
**Use Case**: I need to see where elements actually are (after transform calculations) to fix positioning
**Example Input/Output**:
  Input: `node tools/dev/svg-collisions.js file.svg --positions`
  Output: 
  ```
  #text-1: absolute=(590, 110), size=113×8
  #text-2: absolute=(401, 110), size=200×8
  OVERLAP: #text-1 and #text-2 at (401, 110)
  ```
```

**Example 2: Transform calculation helper**
```markdown
## TOOLING REQUEST

**Tool**: NEW (svg-transform-calc.js)
**Current Limitation**: No tool to calculate absolute positions from nested transforms
**Requested Feature**: Tool that parses SVG and outputs absolute positions for all elements
**Use Case**: Before editing, I need to understand where everything actually is
**Example Input/Output**:
  Input: `node tools/dev/svg-transform-calc.js file.svg --element "#fact-registry"`
  Output:
  ```
  Element: #fact-registry
  Local transform: translate(270, 20)
  Parent transforms: translate(320, 40)
  Absolute position: (590, 60)
  Size: 120×80
  Bounds: (590, 60) to (710, 140)
  ```
```

### What Happens to Your Request

1. Your request is logged in `tests/ai-benchmark/tooling-requests/`
2. A specialist agent reviews feasibility
3. If approved, the tool is improved/created
4. You can continue with available tools while waiting

---

## Constraints

- Edit only `docs/diagrams/fact-classification-architecture.svg`
- Preserve the overall architecture diagram structure
- Maintain the "Industrial Luxury Obsidian" theme
- Keep all 6 fact categories visible
- Final validation: Zero HIGH issues

---

## Success Criteria

| Criterion | Requirement |
|-----------|-------------|
| `svg-collisions.js --strict` | Zero 🔴 HIGH issues |
| Readability | All text elements are readable (no overlaps) |
| Containment | No elements extend outside parent boundaries |
| Accuracy | Diagram still accurately represents the system |
| Theme | Industrial Luxury Obsidian colors preserved |

---

## Deliverables

1. **Fixed SVG file** — updated `docs/diagrams/fact-classification-architecture.svg`
2. **Fix summary** — what you changed and why
3. **Validation output** — final `svg-collisions.js` output showing zero HIGH issues
4. **(Optional) Tooling requests** — if you needed better tools

---

## Getting Started

```bash
# 1. See current issues
node tools/dev/svg-collisions.js docs/diagrams/fact-classification-architecture.svg --strict

# 2. Read the SVG structure
cat docs/diagrams/fact-classification-architecture.svg | head -100

# 3. Make edits, then validate again
node tools/dev/svg-collisions.js docs/diagrams/fact-classification-architecture.svg --strict
```

Good luck! 🔧
