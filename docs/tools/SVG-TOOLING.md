# SVG Validation & Analysis Tooling

## `svg-scan` — SVG Element Discovery & Query Tool

`svg-scan` scans SVG files for elements matching specific criteria (colors, types, patterns). Useful for analyzing road networks, bridge positions, and other structural elements in complex diagrams.

**Quick Examples:**
```powershell
# Find all road paths (by stroke color)
node tools/dev/svg-scan.js diagram.svg --roads

# Find bridge groups (by comment/id patterns)
node tools/dev/svg-scan.js diagram.svg --bridges

# List all elements of a type
node tools/dev/svg-scan.js diagram.svg --elements path --verbose

# Custom attribute query
node tools/dev/svg-scan.js diagram.svg --query "stroke=#9a5519"

# JSON output for automation
node tools/dev/svg-scan.js diagram.svg --roads --json
```

**Features:**
- **Road detection**: Finds paths with road-like stroke colors and extracts start/end coordinates
- **Duplicate detection**: Groups roads with similar endpoints to identify redundant paths
- **Bridge detection**: Finds groups with bridge-related comments and extracts translate positions
- **Context awareness**: Extracts preceding XML comments for each element
- **JSON output**: Machine-readable output for pipeline integration


## `svg-collisions` — SVG Collision Detection & Auto-Fix

`svg-collisions` detects problematic overlapping elements in SVG files using Puppeteer for accurate bounding box computation. It intelligently filters intentional design patterns (text on backgrounds, nested containers) to focus on real issues like text overlapping text.

**Quick Examples:**
```powershell
# Basic collision check
node tools/dev/svg-collisions.js diagram.svg

# Strict mode with JSON output
node tools/dev/svg-collisions.js diagram.svg --strict --json

# Query element positions
node tools/dev/svg-collisions.js diagram.svg --positions
node tools/dev/svg-collisions.js diagram.svg --element "#my-label" --json

# Check containment overflow
node tools/dev/svg-collisions.js diagram.svg --containment

# Batch scan a directory
node tools/dev/svg-collisions.js --dir docs/diagrams --strict

# Auto-fix collisions (preview first)
node tools/dev/svg-collisions.js diagram.svg --fix --dry-run
node tools/dev/svg-collisions.js diagram.svg --fix

# 简令 (terse Chinese mode)
node tools/dev/svg-collisions.js diagram.svg --位 --严
node tools/dev/svg-collisions.js diagram.svg --修 --试
```

**Severity Levels:**
- 🔴 **HIGH**: Text overlapping text (always a problem)
- 🟠 **MEDIUM**: Significant shape overlaps at similar z-levels  
- 🟡 **LOW**: Text clipped by container, minor overlaps

**Ignored Patterns:**
- Text inside container rectangles (normal label design)
- Lines/paths crossing near text (connectors/arrows)
- Overlaps < 20% of smaller element area
- Parent-child structural relationships

**Fix Mode:**
When `--fix` is used, the tool automatically applies repair suggestions:
- Adjusts `x`, `y` attributes for direct positioning
- Modifies `transform="translate()"` for transformed elements
- Use `--dry-run` to preview changes without modifying files


## `svg-overflow` — Text Boundary & Padding Validation

`svg-overflow` detects text content that overflows its container boundaries or has insufficient padding. Unlike `svg-collisions` (which finds overlapping elements), this tool focuses on text-to-boundary violations that are invisible to overlap detection.

**Quick Examples:**
```powershell
# Basic overflow check (estimation mode)
node tools/dev/svg-overflow.js diagram.svg

# JSON output for automation
node tools/dev/svg-overflow.js diagram.svg --json

# Custom minimum padding requirement
node tools/dev/svg-overflow.js diagram.svg --min-padding 10
```

**Puppeteer Mode (accurate rendered measurements):**
```powershell
# Use Puppeteer for precise bounding boxes
node tools/dev/svg-overflow.js diagram.svg --puppeteer

# Check a specific named container
node tools/dev/svg-overflow.js diagram.svg --container "Server Detection Logic"

# List all detected containers in the SVG
node tools/dev/svg-overflow.js diagram.svg --list-containers

# Check all labeled containers at once
node tools/dev/svg-overflow.js diagram.svg --all-containers --json
```

**What it detects:**
- 🔴 **HIGH**: Text extending beyond container rect bounds (left, right, top, or bottom overflow)
- 🟠 **MEDIUM**: Insufficient padding between text and container edge

**How it works (estimation mode):**
1. Parses SVG and identifies text elements with >10 characters
2. Estimates text width based on font-size, font-family, and character metrics
3. Finds the nearest container rect (prioritizes sibling rects, then closest ancestor)
4. Calculates text position relative to container using transform accumulation
5. Checks if text extends beyond container bounds in all directions (left, right, top, bottom)
6. Validates minimum padding requirements (default: 5px)

**Vertical overflow detection:**
- Estimates text height using font-size (baseline model: ascenders ≈ 0.8×fontSize, descenders ≈ 0.2×fontSize)
- Accumulates Y transforms from nested groups to compute text position relative to container
- Uses proportional margins (50% of container dimension) to catch significantly overflowing text
- Filters out panel titles that intentionally sit at the container's top edge

**How it works (Puppeteer mode):**
1. Renders the SVG in a headless browser
2. Uses `getBBox()` + `getScreenCTM()` for accurate bounding box measurements
3. Finds labeled containers (groups with rect + title text)
4. Checks all text within each container for overflows in all directions
5. No font-width estimation needed — uses real rendered widths

**Smart filtering:**
- Skips "floating" labels (centered text with no explicit x position that aren't siblings of container rects)
- Prioritizes sibling rects over ancestor rects for accurate container detection
- Handles nested transform chains correctly

**Why this matters for AI agents:**
- `svg-collisions` misses boundary violations because the text isn't overlapping another element
- Long technical terms (like "application_layer_protocol_negotiation") often overflow unnoticed
- Nested transforms make manual position calculation error-prone
- Estimation mode now handles both horizontal AND vertical overflows via transform accumulation

**Best Practice:** Run both tools when validating SVGs:
```powershell
# Full SVG validation pipeline
node tools/dev/svg-collisions.js diagram.svg --strict
node tools/dev/svg-overflow.js diagram.svg
node tools/dev/svg-contrast.js diagram.svg

# Or use Puppeteer for more accurate measurements (slower)
node tools/dev/svg-overflow.js diagram.svg --all-containers
```


## `svg-contrast` — Color Contrast Analyzer & Fixer

`svg-contrast` analyzes text-on-background color combinations for WCAG compliance. It detects contrast failures and can auto-fix by adjusting text fill colors to meet accessibility requirements.

**Quick Examples:**
```powershell
# Analyze contrast issues
node tools/dev/svg-contrast.js diagram.svg

# JSON output for automation
node tools/dev/svg-contrast.js diagram.svg --json

# Auto-fix contrast failures (preview first)
node tools/dev/svg-contrast.js diagram.svg --fix --dry-run
node tools/dev/svg-contrast.js diagram.svg --fix
```

**What it detects:**
- 🔴 **FAIL**: Contrast < 3:1 (inaccessible)
- 🟠 **AA-large**: 3:1 - 4.5:1 (only passes for large text 18pt+)
- 🟢 **AA**: 4.5:1 - 7:1 (normal text minimum)
- 🟢 **AAA**: ≥ 7:1 (enhanced accessibility)

**Metrics provided:**
- Contrast ratio (WCAG formula)
- Relative luminance for both text and background
- WCAG compliance level
- Suggested fix color with improved ratio

**Auto-fix behavior:**
- Generates dark variants for light/mid backgrounds
- Generates light variants for dark backgrounds
- Falls back to black or white when variants don't achieve AA
