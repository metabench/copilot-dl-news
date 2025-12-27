# SVG Creation Methodology for AI Agents

> **Purpose**: Enable AI agents to create complex, beautiful SVG diagrams through structured multi-stage processes with tooling support.

_Last Verified: 2025-12-02_

---

## 🚨 CRITICAL: Validation is NOT Optional

**AI agents cannot "see" SVG output.** You can only reason about coordinates mathematically, and nested transforms make absolute positions non-obvious. 

**Before declaring ANY SVG complete, you MUST:**

```bash
# Run collision detection with strict mode
node tools/dev/svg-collisions.js your-file.svg --strict
```

**Pass criteria: Zero 🔴 HIGH severity issues.**

If you skip this step, you WILL deliver broken diagrams. The tools are your eyes. Use them.

---

## Executive Summary

This guide provides a comprehensive methodology for AI agents to create professional-quality SVG diagrams—from simple architecture overviews to complex 80KB+ visualizations like `PROJECT_GOALS_OVERVIEW.svg`.

### The Three Laws of SVG Creation

1. **Structure First**: Define data/content BEFORE any visual design
2. **Components Rule**: Build from reusable primitives, never inline repetition
3. **Validate Always**: Use tooling to catch errors early and ensure quality

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SVG CREATION PIPELINE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐                │
│  │  Stage 1   │───▶│  Stage 2   │───▶│  Stage 3   │                │
│  │ STRUCTURE  │    │  LAYOUT    │    │  CONTENT   │                │
│  └────────────┘    └────────────┘    └────────────┘                │
│       │                 │                 │                         │
│       ▼                 ▼                 ▼                         │
│  JSON Schema       Grid System       Component                      │
│  Data Model        Positioning       Instantiation                  │
│                                                                     │
│  ┌────────────┐    ┌────────────┐    ┌────────────┐                │
│  │  Stage 4   │───▶│  Stage 5   │───▶│  Stage 6   │                │
│  │   STYLE    │    │  ASSEMBLY  │    │ VALIDATION │                │
│  └────────────┘    └────────────┘    └────────────┘                │
│       │                 │                 │                         │
│       ▼                 ▼                 ▼                         │
│  Theme Colors      Final SVG         svg-validate                   │
│  Effects/Filters   Generation        svg-collisions                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Structure Definition (JSON Schema)

**Input**: Conceptual understanding of what to visualize  
**Output**: Structured JSON data model

### Why JSON First?

- Forces clear thinking about data relationships
- Enables programmatic SVG generation
- Separates content from presentation
- Allows batch updates without visual rework

### Example: Goals Overview Structure

```json
{
  "title": "Project Goals Overview",
  "subtitle": "copilot-dl-news — 34 goals across 10 categories",
  "lastUpdated": "2025-12-02",
  "legend": [
    { "color": "#10b981", "label": "Active", "count": 24 },
    { "color": "#3b82f6", "label": "Planned", "count": 8 },
    { "color": "#8b5cf6", "label": "Research", "count": 2 }
  ],
  "categories": [
    {
      "id": "crawler",
      "icon": "🌐",
      "name": "Crawler & Data Pipeline",
      "color": "rgba(59, 130, 246, 0.15)",
      "goals": [
        {
          "id": "crawler-architecture",
          "name": "Crawler Architecture Refactor",
          "status": "active",
          "progress": 65,
          "lines": [
            "ConfigurationService for CLI + runner config merging",
            "CrawlerFactory with dependency injection",
            "Swappable URL selectors & queue strategies"
          ]
        }
        // ... more goals
      ]
    }
    // ... more categories
  ]
}
```

### Schema Design Principles

1. **Hierarchical**: Categories → Goals → Details
2. **Typed**: Status enums, progress percentages, color values
3. **Complete**: All data needed for rendering, nothing visual
4. **Extensible**: Easy to add new categories/goals

---

## Stage 2: Layout Planning (Grid System)

**Input**: JSON structure  
**Output**: Positioning coordinates and dimensions

### The Grid System

Our diagrams use a consistent grid:
- **Canvas**: 1400×1764 (configurable based on content)
- **Margins**: 50px all sides
- **Column Width**: 420px (2-column layout) or 650px (3-column)
- **Category Spacing**: 20px between categories
- **Goal Card Height**: 62px per goal

### Layout Algorithm

```javascript
function calculateLayout(categories, config = {}) {
  const {
    canvasWidth = 1400,
    margin = 50,
    columnWidth = 420,
    columnGap = 40,
    categoryGap = 20,
    headerHeight = 120,
    goalHeight = 62,
    goalPadding = 12,
    categoryHeaderHeight = 40,
    categoryPadding = 48
  } = config;
  
  const layout = {
    canvas: { width: canvasWidth, height: 0 },
    categories: []
  };
  
  // Calculate number of columns that fit
  const contentWidth = canvasWidth - (2 * margin);
  const numColumns = Math.floor((contentWidth + columnGap) / (columnWidth + columnGap));
  
  // Track column heights
  const columnHeights = new Array(numColumns).fill(headerHeight + margin);
  
  for (const category of categories) {
    // Find shortest column
    const shortestCol = columnHeights.indexOf(Math.min(...columnHeights));
    
    // Calculate category height
    const goalsHeight = category.goals.length * (goalHeight + goalPadding);
    const categoryHeight = categoryHeaderHeight + categoryPadding + goalsHeight;
    
    layout.categories.push({
      id: category.id,
      x: margin + shortestCol * (columnWidth + columnGap),
      y: columnHeights[shortestCol],
      width: columnWidth,
      height: categoryHeight,
      column: shortestCol
    });
    
    columnHeights[shortestCol] += categoryHeight + categoryGap;
  }
  
  layout.canvas.height = Math.max(...columnHeights) + margin;
  return layout;
}
```

---

## Stage 3: Component Library

**Input**: Layout positions  
**Output**: Reusable SVG component functions

### Core Components

#### 1. Defs Block (Theme & Effects)

```xml
<defs>
  <!-- Gold glow filter -->
  <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3" result="blur"/>
    <feFlood flood-color="#c9a227" flood-opacity="0.3"/>
    <feComposite in2="blur" operator="in"/>
    <feMerge>
      <feMergeNode/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
  
  <!-- Background gradient -->
  <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#050508" stop-opacity="0.5"/>
    <stop offset="100%" stop-color="#141824" stop-opacity="0.3"/>
  </linearGradient>
  
  <!-- Card gradient -->
  <linearGradient id="cardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" style="stop-color:#1a1f2e"/>
    <stop offset="50%" style="stop-color:#141824"/>
    <stop offset="100%" style="stop-color:#0f1420"/>
  </linearGradient>
</defs>
```

#### 2. Category Container Component

```javascript
function renderCategory(category, layout) {
  const { x, y, width, height } = layout;
  return `
  <g transform="translate(${x}, ${y})">
    <!-- Container -->
    <rect x="0" y="0" width="${width}" height="${height}" 
          rx="8" fill="#1a1f2e" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    
    <!-- Header bar with category color -->
    <rect x="0" y="0" width="${width}" height="40" rx="8" 
          fill="${category.color}"/>
    
    <!-- Category title -->
    <text x="16" y="26" font-family="Georgia, serif" font-size="16" 
          font-weight="bold" fill="#c9a227">${category.icon} ${escapeXml(category.name)}</text>
    
    <!-- Goal count badge -->
    <text x="${width - 20}" y="26" font-family="JetBrains Mono, monospace" 
          font-size="12" fill="#64748b" text-anchor="end">${category.goals.length}</text>
    
    <!-- Goals -->
    <g transform="translate(12, 0)">
      ${category.goals.map((goal, i) => 
        renderGoalCard(goal, 48 + i * 74, width - 24)
      ).join('\n')}
    </g>
  </g>`;
}
```

#### 3. Goal Card Component

```javascript
function renderGoalCard(goal, y, width) {
  const statusColors = {
    active: '#10b981',
    planned: '#3b82f6',
    research: '#8b5cf6'
  };
  const color = statusColors[goal.status] || '#64748b';
  const progressWidth = Math.round((goal.progress / 100) * 80);
  
  return `
  <g transform="translate(0, ${y})">
    <!-- Card background -->
    <rect x="0" y="0" width="${width}" height="62" rx="4" 
          fill="rgba(26, 31, 46, 0.6)"/>
    
    <!-- Status indicator -->
    <circle cx="12" cy="12" r="5" fill="${color}"/>
    
    <!-- Goal title -->
    <text x="26" y="14" font-family="Inter, system-ui, sans-serif" 
          font-size="13" font-weight="600" fill="#f0f4f8">${escapeXml(goal.name)}</text>
    
    <!-- Progress bar background -->
    <rect x="${width - 100}" y="6" width="80" height="6" rx="2" 
          fill="rgba(255,255,255,0.1)"/>
    
    <!-- Progress bar fill -->
    <rect x="${width - 100}" y="6" width="${progressWidth}" height="6" rx="2" 
          fill="${color}"/>
    
    <!-- Progress text -->
    <text x="${width - 15}" y="14" font-family="JetBrains Mono, monospace" 
          font-size="9" fill="#64748b" text-anchor="end">${goal.progress}%</text>
    
    <!-- Description lines -->
    ${goal.lines.map((line, i) => `
    <text x="26" y="${28 + i * 14}" font-family="Inter, system-ui, sans-serif" 
          font-size="11" fill="#94a3b8">${escapeXml(line)}</text>
    `).join('')}
  </g>`;
}
```

#### 4. Helper Functions

```javascript
function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNumber(num) {
  return num.toLocaleString();
}

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxChars) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}
```

---

## Stage 4: Theme System (Industrial Luxury Obsidian)

### Theme Selection (Build-time vs Runtime)

SVG theming depends on **how the SVG is embedded**:

- **Build-time theming (recommended default)**: Your generator (or MCP plan) selects a theme and outputs a fully-resolved SVG with concrete colors.
  - Works reliably for markdown, docs, and `<img src="...">` embedding.
- **Runtime theming (advanced)**: Use CSS variables inside the SVG and change them from the embedding page.
  - Works best when you inline SVG markup into HTML (not always for file-based `<img>` usage).

Rule: Prefer build-time theming unless you control the embedding and can confirm runtime CSS variables apply.

See Skill: `docs/agi/skills/svg-theme-system/SKILL.md`.

### Color Palette

```javascript
const THEME = {
  // Background layers
  background: {
    primary: '#0a0d14',
    secondary: '#050508',
    tertiary: '#141824'
  },
  
  // Card/panel surfaces
  surface: {
    card: '#1a1f2e',
    cardHover: '#252b3d',
    cardBorder: 'rgba(255,255,255,0.06)'
  },
  
  // Accent colors
  accent: {
    gold: '#c9a227',
    goldBright: '#ffd700',
    goldDark: '#8b7500'
  },
  
  // Status colors
  status: {
    active: '#10b981',    // Emerald
    planned: '#3b82f6',   // Sapphire
    research: '#8b5cf6',  // Amethyst
    error: '#e31837',     // Ruby
    warning: '#ff9f00'    // Topaz
  },
  
  // Text hierarchy
  text: {
    primary: '#f0f4f8',
    secondary: '#94a3b8',
    tertiary: '#64748b',
    muted: '#475569'
  },
  
  // Category tints (15% opacity)
  categoryTint: (color) => `rgba(${hexToRgb(color)}, 0.15)`
};
```

### Typography

```javascript
const TYPOGRAPHY = {
  // Headers
  title: {
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: 2
  },
  
  categoryHeader: {
    fontFamily: "Georgia, serif",
    fontSize: 16,
    fontWeight: 'bold'
  },
  
  // Body text
  goalTitle: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 13,
    fontWeight: 600
  },
  
  description: {
    fontFamily: "Inter, system-ui, sans-serif",
    fontSize: 11,
    fontWeight: 'normal'
  },
  
  // Monospace
  code: {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 11
  },
  
  stats: {
    fontFamily: "JetBrains Mono, monospace",
    fontSize: 9
  }
};
```

---

## Stage 5: Assembly Process

### SVG Generation Script Structure

```javascript
// tools/dev/svg-gen.js
"use strict";

const fs = require('fs');
const path = require('path');

class SvgGenerator {
  constructor(dataPath, outputPath) {
    this.data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    this.outputPath = outputPath;
    this.theme = THEME;
    this.typography = TYPOGRAPHY;
  }
  
  generate() {
    // Stage 2: Calculate layout
    const layout = this.calculateLayout();
    
    // Stage 3-4: Build SVG with components
    const svg = this.buildSvg(layout);
    
    // Write output
    fs.writeFileSync(this.outputPath, svg);
    
    return { layout, outputPath: this.outputPath };
  }
  
  buildSvg(layout) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.canvas.width} ${layout.canvas.height}">
  ${this.buildDefs()}
  
  <!-- Background -->
  <rect width="${layout.canvas.width}" height="${layout.canvas.height}" fill="${this.theme.background.primary}"/>
  <rect width="${layout.canvas.width}" height="${layout.canvas.height}" fill="url(#bgGradient)"/>
  
  <!-- Header -->
  ${this.buildHeader(layout)}
  
  <!-- Categories -->
  ${layout.categories.map(cat => 
    this.renderCategory(this.data.categories.find(c => c.id === cat.id), cat)
  ).join('\n')}
</svg>`;
  }
  
  // ... component methods
}

// CLI interface
if (require.main === module) {
  const [,, dataPath, outputPath] = process.argv;
  if (!dataPath || !outputPath) {
    console.error('Usage: node svg-gen.js <data.json> <output.svg>');
    process.exit(1);
  }
  
  const generator = new SvgGenerator(dataPath, outputPath);
  const result = generator.generate();
  console.log(`Generated: ${result.outputPath}`);
  console.log(`Canvas: ${result.layout.canvas.width}×${result.layout.canvas.height}`);
}

module.exports = { SvgGenerator };
```

---

## Stage 6: Validation (MANDATORY QUALITY GATE)

> ⚠️ **NON-NEGOTIABLE**: You MUST run all validation tools and resolve ALL high-severity issues before declaring an SVG complete. No exceptions.

### Pre-commit Validation Workflow

```bash
# 1. Validate XML structure and common issues
node tools/dev/svg-validate.js docs/diagrams/my-diagram.svg

# 2. MANDATORY: Check for collisions and overlaps
node tools/dev/svg-collisions.js docs/diagrams/my-diagram.svg --strict

# 3. MANDATORY: Check for text overflow and padding issues
node tools/dev/svg-overflow.js docs/diagrams/my-diagram.svg

# 4. Validate all diagrams in a directory
node tools/dev/svg-validate.js --dir docs/diagrams
```

### Quality Gates (Must Pass)

| Gate | Tool | Pass Criteria |
|------|------|---------------|
| **XML Valid** | `svg-validate.js` | Zero errors |
| **No Collisions** | `svg-collisions.js` | Zero 🔴 HIGH issues |
| **Readable Text** | `svg-collisions.js` | No `[text-overlap]` issues |
| **No Overflows** | `svg-overflow.js` | Zero 🔴 HIGH issues |
| **Proper Padding** | `svg-overflow.js` | Review 🟠 MEDIUM issues |

### Why This Matters

AI agents cannot "see" SVG output—they can only reason about coordinates mathematically. **Without running validation tools, layout bugs are invisible to the agent.** The tools provide the "eyes" that agents lack.

**Two complementary tools:**
- `svg-collisions.js` — Detects elements overlapping each other (text on text, shapes on shapes)
- `svg-overflow.js` — Detects text that extends beyond its container boundaries (text-to-boundary violations)

**Failure mode**: An agent creates an SVG, declares it complete, and delivers it with overlapping text or text that overflows boxes—because the agent trusted its mental model instead of objective measurement.

### Validation Checklist

**Structural (svg-validate.js):**
- [ ] XML well-formed (no parse errors)
- [ ] viewBox present and valid
- [ ] No unescaped ampersands (&)
- [ ] No duplicate IDs
- [ ] Text elements not empty
- [ ] References to IDs exist

**Spatial (svg-collisions.js) — CRITICAL:**
- [ ] Zero 🔴 HIGH severity issues
- [ ] No `[text-overlap]` on any text
- [ ] No `[text-clipped]` that truncates important content
- [ ] Review all 🟡 LOW issues (intentional overlaps are okay, e.g., icons on containers)

**Overflow (svg-overflow.js) — CRITICAL:**
- [ ] Zero 🔴 HIGH severity issues (text extending beyond container)
- [ ] Review all 🟠 MEDIUM issues (insufficient padding may be intentional)
- [ ] Long technical terms fit within their boxes (abbreviate if needed)

> **Note for themed diagrams (quest maps, D&D style):** These often have intentionally overlapping elements (step numbers in circles, decorative flourishes, paths over backgrounds). See the "Themed Diagrams" section below for specific validation guidance.

### What To Do When Issues Are Found

1. **Read the issue report** — it gives element types and overflow/overlap dimensions
2. **Identify the cause** — usually: wrong translate(), element too wide, text too long
3. **Fix in the SVG** — adjust positions, reduce/abbreviate text, increase container size
4. **Re-run validation** — iterate until zero HIGH issues

---

## Multi-Stage Workflow Summary

### For Simple Diagrams (< 500 lines)

1. **Sketch** the structure in JSON (5 min)
2. **Calculate** layout positions manually
3. **Build** SVG with inline components
4. **Validate** with `svg-validate.js`

### For Complex Diagrams (500+ lines)

1. **Define** complete JSON schema (15 min)
2. **Use** `svg-gen.js` with templates
3. **Iterate** on data, regenerate SVG
4. **Validate** with both tools
5. **Polish** manual adjustments if needed

### For Updating Existing Diagrams

1. **Update** the source JSON
2. **Regenerate** SVG with tooling
3. **Validate** changes
4. **Commit** both JSON and SVG

---

## Tool Reference

| Tool | Purpose | Command |
|------|---------|---------|
| `svg-validate.js` | Structure validation | `node tools/dev/svg-validate.js <file>` |
| `svg-collisions.js` | Visual collision detection | `node tools/dev/svg-collisions.js <file>` |
| `svg-overflow.js` | Text boundary/overflow detection | `node tools/dev/svg-overflow.js <file>` |
| `svg-gen.js` | Generate SVG from JSON | `node tools/dev/svg-gen.js <data> <output>` |

### Supported Templates (svg-gen.js)

- **goals-overview**: Project goals with categories and progress bars
- **architecture**: System architecture with components and connections
- **flowchart**: Process flow with decisions and actions
- **timeline**: Roadmap/timeline with milestones
- **hierarchy**: Organizational chart or tree structure
- **comparison**: Side-by-side comparison of options

---

## Text Sizing Guidelines (Critical for AI Agents)

> **The #1 cause of SVG defects is text overflow.** AI agents cannot measure rendered text width, so you must use conservative estimates.

### Character Width Estimates

Use these multipliers (character_count × font_size × ratio = estimated_width):

| Font Family | Ratio | Example |
|-------------|-------|---------|
| Monospace (Consolas, Monaco) | 0.60 | 40 chars × 10px × 0.60 = 240px |
| Sans-serif (Arial, Helvetica) | 0.52 | 40 chars × 10px × 0.52 = 208px |
| Serif (Georgia, Times) | 0.55 | 40 chars × 10px × 0.55 = 220px |

### Safe Container Sizing

When creating text inside containers:

```
Container Width = (max_chars × font_size × ratio) + (2 × padding)
```

**Example**: Fitting "application_layer_protocol_negotiation" (40 chars) in a monospace box:
- Estimated width: 40 × 10px × 0.6 = 240px
- With 10px padding each side: 240 + 20 = 260px minimum
- Safe container width: 280px (with margin for error)

### Abbreviation Strategy

When text is too long for its container, abbreviate using standard conventions:

| Full Term | Abbreviation |
|-----------|--------------|
| `application_layer_protocol_negotiation` | `ALPN` |
| `elliptic_curves` | `EC` |
| `supported_versions` | `versions` |
| `signature_algorithms` | `sig_algs` |

### Text Positioning Rules

1. **Left-aligned text (`text-anchor="start"`)**: Position at `x = padding`
2. **Centered text (`text-anchor="middle"`)**: Position at `x = container_width / 2`
3. **Right-aligned text (`text-anchor="end"`)**: Position at `x = container_width - padding`

### Validation Workflow

1. Create text with estimated sizing
2. Run `svg-overflow.js` to detect issues
3. Address HIGH issues (shorten text or widen container)
4. Review MEDIUM issues (adjust padding if needed)

---

## Best Practices

### DO

- ✅ Use `transform="translate(x, y)"` for positioning groups
- ✅ Define colors in `<defs>` gradients, reference by ID
- ✅ Escape all text with `&amp;`, `&lt;`, etc.
- ✅ Set explicit `viewBox` for responsive scaling
- ✅ Use semantic IDs for interactive elements
- ✅ Comment major sections with `<!-- Section Name -->`

### DON'T

- ❌ Hardcode colors inline—use theme variables
- ❌ Mix absolute and relative positioning
- ❌ Forget `font-family` fallbacks
- ❌ Use `px` in viewBox (unitless)
- ❌ Create orphan IDs never referenced

---

## Appendix: Industrial Luxury Obsidian Full Defs

```xml
<defs>
  <!-- Primary Background -->
  <linearGradient id="obsidianBg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#050508"/>
    <stop offset="25%" style="stop-color:#0a0d14"/>
    <stop offset="50%" style="stop-color:#0f1420"/>
    <stop offset="75%" style="stop-color:#0a0d14"/>
    <stop offset="100%" style="stop-color:#080c12"/>
  </linearGradient>
  
  <!-- Gold Accent -->
  <linearGradient id="goldAccent" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#ffd700"/>
    <stop offset="50%" style="stop-color:#c9a227"/>
    <stop offset="100%" style="stop-color:#a07d00"/>
  </linearGradient>
  
  <!-- Card Surface -->
  <linearGradient id="cardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" style="stop-color:#1a1f2e"/>
    <stop offset="50%" style="stop-color:#141824"/>
    <stop offset="100%" style="stop-color:#0f1420"/>
  </linearGradient>
  
  <!-- Gem Colors -->
  <linearGradient id="emeraldGlow" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#50c878"/>
    <stop offset="50%" style="stop-color:#2e8b57"/>
    <stop offset="100%" style="stop-color:#1a5d38"/>
  </linearGradient>
  
  <linearGradient id="sapphireGlow" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#6fa8dc"/>
    <stop offset="50%" style="stop-color:#0f52ba"/>
    <stop offset="100%" style="stop-color:#082567"/>
  </linearGradient>
  
  <linearGradient id="rubyGlow" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#ff6b6b"/>
    <stop offset="50%" style="stop-color:#e31837"/>
    <stop offset="100%" style="stop-color:#8b0000"/>
  </linearGradient>
  
  <linearGradient id="amethystGlow" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#da70d6"/>
    <stop offset="50%" style="stop-color:#9966cc"/>
    <stop offset="100%" style="stop-color:#4b0082"/>
  </linearGradient>
  
  <!-- Effects -->
  <filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3" result="blur"/>
    <feFlood flood-color="#c9a227" flood-opacity="0.3"/>
    <feComposite in2="blur" operator="in"/>
    <feMerge>
      <feMergeNode/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
  
  <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="2" dy="3" stdDeviation="3" flood-opacity="0.3"/>
  </filter>
</defs>
```

---

## Themed Diagrams (Quest Maps, D&D Style, etc.)

Themed diagrams like quest maps, game-style visualizations, or gamified progress trackers have **intentionally overlapping design elements** that the collision tool may flag as issues. This section explains how to handle them correctly.

### Understanding Collision Tool Output for Themed SVGs

**What the tool considers "collisions":**
- Any two elements with bounding boxes that overlap

**What's actually a problem (🔴 HIGH severity):**
- **Text overlapping text** — always unreadable, always fix
- **Nodes/boxes overlapping each other** — content obscured

**What's intentional design (🟡 LOW severity, can ignore):**
- Step numbers inside circles (e.g., `<circle cx="22" cy="22"><text x="22" y="28">1</text>`)
- Decorative corner flourishes overlapping the border rect
- Path connectors crossing the background
- Text labels on colored backgrounds
- Icons inside containers

### Quest Map Layout Rules

When creating D&D/Zelda-style quest maps:

1. **Minimum node spacing**: 30px gap between adjacent node edges
2. **Flow direction**: Clear visual path START → node 1 → node 2 → ... → FINISH
3. **Avoid stacking**: Never place one node directly above/below another unless there's >100px vertical gap
4. **Road connections**: Paths should logically connect adjacent steps, not cross the whole diagram randomly

### Validation Approach for Themed SVGs

```bash
# Run with --strict to get full report
node tools/dev/svg-collisions.js my-quest-map.svg --strict

# Check the severity breakdown:
# - 🔴 HIGH: 0   ← MUST be zero (text-on-text collisions)
# - 🟠 MEDIUM: 0 ← Should be zero
# - 🟡 LOW: n    ← Can be non-zero for intentional design patterns
```

**Pass criteria for themed diagrams:**
- ✅ Zero 🔴 HIGH severity issues
- ✅ Zero 🟠 MEDIUM severity issues
- ✅ Review each 🟡 LOW issue — confirm it's an intentional design pattern

### Common Quest Map Patterns (Allowed to "Collide")

```xml
<!-- Step number in circle (intentional overlap) -->
<g transform="translate(100, 200)">
  <rect width="160" height="100" rx="8" class="node-complete"/>
  <circle cx="22" cy="22" r="16" fill="#4a7c59"/>
  <text fill="#fff" text-anchor="middle" x="22" y="28">1</text>
</g>

<!-- Decorative corner flourishes (intentional overlap with border) -->
<g class="decoration">
  <path d="M 40 55 Q 55 40, 70 40 M 40 55 Q 40 70, 40 85"/>
</g>

<!-- Road paths (intentional overlap with background rect) -->
<path class="quest-path" d="M 280 400 C 330 400, 350 400, 380 400"/>
```

### Parchment Theme Starter Template

```xml
<defs>
  <!-- Parchment gradient -->
  <linearGradient id="parchment" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#f5ecd8"/>
    <stop offset="50%" stop-color="#ebe0c8"/>
    <stop offset="100%" stop-color="#ddd0b0"/>
  </linearGradient>

  <!-- Subtle drop shadow for nodes -->
  <filter id="nodeShadow" x="-10%" y="-10%" width="120%" height="130%">
    <feDropShadow dx="2" dy="3" stdDeviation="3" flood-color="#5c4a32" flood-opacity="0.25"/>
  </filter>

  <!-- Path arrow marker -->
  <marker id="pathArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b5744"/>
  </marker>

  <style>
    .parchment-bg { fill: url(#parchment); }
    .border { fill: none; stroke: #8b7355; stroke-width: 4; }
    .quest-path { fill: none; stroke: #6b5744; stroke-width: 3; stroke-dasharray: 12 6; }
    .node-complete { fill: #e8f5e9; stroke: #4a7c59; stroke-width: 2; }
    .node-active { fill: #fff8e1; stroke: #c9a227; stroke-width: 3; }
    .node-pending { fill: #f5f5f5; stroke: #9e9e9e; stroke-width: 2; }
    .title { font-family: "Palatino Linotype", serif; font-size: 28px; font-weight: bold; fill: #3d2e1f; }
    .node-title { font-family: "Palatino Linotype", serif; font-size: 15px; font-weight: bold; fill: #3d2e1f; }
    .node-desc { font-family: Georgia, serif; font-size: 11px; fill: #5c4a32; }
  </style>
</defs>
```

### Node Status Colors (Consistent Across All Themed SVGs)

| Status | Fill | Stroke | Meaning |
|--------|------|--------|---------|
| Complete | `#e8f5e9` | `#4a7c59` | Task finished successfully |
| Active | `#fff8e1` | `#c9a227` | Currently in progress |
| Pending | `#f5f5f5` | `#9e9e9e` | Not yet started |
| Blocked | `#ffebee` | `#c62828` | Blocked by dependency |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | 2025-12-20 | Added Themed Diagrams section (quest maps, D&D style) |
| 1.0 | 2025-12-02 | Initial methodology document |
