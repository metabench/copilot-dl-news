# Tooling Request: SVG Editing & Auto-Correction Tools

**Status**: 🆕 NEW  
**Submitted**: 2025-12-02  
**Source**: CLI Tooling Architecture Design  
**Priority**: 🟡 P1 (after `--positions` flag)

---

## Overview

This request covers two related capabilities:
1. **`svg-edit.js`** — A new tool for safe SVG element manipulation
2. **`--fix` flag** — Auto-correction mode for `svg-collisions.js`

Together, these eliminate manual SVG source editing for common layout fixes.

---

## Request 1: `svg-edit.js` — Element Manipulation Tool

### TOOLING REQUEST

**Tool**: NEW (`svg-edit.js`)

**Current Limitation**: Agents must manually edit SVG source code to move, resize, or modify elements. This requires:
- Finding elements in XML structure
- Calculating correct attribute values (accounting for transforms)
- Avoiding structural errors
- Multiple iterations to get positions right

**Requested Feature**: CLI tool for safe SVG element manipulation by selector.

**Use Case**: After collision detection identifies overlapping elements, agent can directly move/resize elements without hand-editing XML.

**Example Input/Output**:

```bash
# Move element by relative offset
node tools/dev/svg-edit.js diagram.svg --move "#my-label" --by "x=20,y=0"

# Output:
{
  "success": true,
  "operation": "move",
  "target": "#my-label",
  "changes": [
    { "attribute": "x", "from": "100", "to": "120" }
  ],
  "backup": "diagram.svg.bak"
}
```

```bash
# Move element to absolute position (tool calculates local coords)
node tools/dev/svg-edit.js diagram.svg --move "#my-label" --to "x=400,y=100"

# Preview without modifying
node tools/dev/svg-edit.js diagram.svg --move "#el" --by "x=20" --dry-run --json
```

### Supported Operations

| Operation | Flag | Example |
|-----------|------|---------|
| Move relative | `--move <sel> --by "x=N,y=N"` | Move 20px right |
| Move absolute | `--move <sel> --to "x=N,y=N"` | Move to exact position |
| Resize | `--resize <sel> --width N --height N` | Set dimensions |
| Scale | `--resize <sel> --scale N` | Scale by factor |
| Set attribute | `--set <sel> --attr "name=value"` | Change any attribute |
| Delete | `--delete <sel>` | Remove element |

### Key Feature: Transform-Aware Movement

When moving to an absolute position, the tool automatically:
1. Gets the cumulative transform matrix of parent elements
2. Computes the inverse transform
3. Converts target absolute position to correct local coordinates
4. Updates element attributes

This eliminates the need for agents to manually calculate local coordinates.

---

## Request 2: `--fix` Auto-Correction Mode

### TOOLING REQUEST

**Tool**: `svg-collisions.js`

**Current Limitation**: Even when the tool provides repair suggestions, agents must manually apply fixes. For straightforward issues (text overlaps), the fix is deterministic and could be automated.

**Requested Feature**: Add `--fix` flag that automatically applies safe repairs.

**Use Case**: After running collision detection, automatically fix all resolvable issues in one command.

**Example Input/Output**:

```bash
# Auto-fix all issues
node tools/dev/svg-collisions.js diagram.svg --fix

# Output:
✅ Fixed 4 of 5 issues
   🔧 Moved #label-2 down by 18px (text-overlap)
   🔧 Moved #box-3 left by 25px (containment)
   🔧 Moved #title-4 right by 12px (text-overlap)
   🔧 Expanded #container-5 width by 30px (text-clipped)
   ⏭️ Skipped #shape-6 (ambiguous fix)

Backup saved: diagram.svg.bak
```

```bash
# Preview fixes without applying
node tools/dev/svg-collisions.js diagram.svg --fix --dry-run --json
```

### Safe Fix Strategies

| Issue Type | Auto-Fix | Safety Level |
|------------|----------|--------------|
| `text-overlap` | Move later element by separation vector | ✅ Safe |
| `containment` | Move element inside parent bounds | ✅ Safe |
| `text-clipped` | Expand container OR move text | ⚠️ Check result |
| `shape-overlap` (minor) | Move later element | ⚠️ May cascade |
| `shape-overlap` (major) | Skip — requires manual review | ❌ Skip |

### Fix Rules

1. **Move, don't resize** — Preserve design intent
2. **Move later element** — Earlier elements are likely "anchors"
3. **Prefer vertical** — Better for reading flow
4. **Minimum movement** — Only move enough to resolve + padding
5. **Re-validate after** — Ensure no new issues introduced

---

## Impact Assessment

| Metric | Current | With Tools |
|--------|---------|------------|
| SVG fix iterations | 5-10 | 1-2 |
| Manual XML editing | Always | Rarely |
| Position calculations | Manual | Automated |
| Time per fix | 10-15 min | 1-2 min |

**Total impact**: ~85% reduction in SVG layout fix time

---

## Implementation Order

1. **`--positions` flag** (P0) — Prerequisite for accurate editing
2. **`svg-edit.js` basics** (P1) — Move and resize operations
3. **`--fix` mode** (P1) — Auto-correction using svg-edit
4. **`--auto-layout`** (P3) — Future: comprehensive reflow

---

## References

- [SVG Tooling Architecture](../../docs/designs/SVG_TOOLING_ARCHITECTURE.md)
- [📐 SVG Spatial Reasoning Specialist](../../.github/agents/📐%20SVG%20Spatial%20Reasoning%20Specialist%20📐.agent.md)
- [🌟📐 CLI Toolsmith](../../.github/agents/🌟📐%20CLI%20Toolsmith%20📐🌟.agent.md)
