# Create: Fact-Based Classification System Architecture Diagram

**Goal:** Create a polished SVG diagram showing how the Fact-Based Classification System works.

---

## What You're Visualizing

This system classifies URLs (as "article", "listing", etc.) by:
1. Extracting **boolean facts** from URLs/content (e.g., "has date in URL" → TRUE)
2. Storing facts in a database
3. Applying **classification rules** that combine facts with AND/OR/NOT logic

**Key insight:** Facts are NEUTRAL observations (not "positive" or "negative" signals). They just answer "Does it have X?" with TRUE/FALSE.

---

## Read These Files First

| File | What to Learn |
|------|---------------|
| `docs/designs/FACT_BASED_CLASSIFICATION_SYSTEM.md` | Full architecture, the ASCII diagram, fact categories |
| `src/facts/FactBase.js` | Base class—see `extract()` returns `{ value: boolean }` |
| `src/facts/FactRegistry.js` | Singleton that indexes all facts by name/category |
| `src/facts/url/index.js` | The 5 implemented URL facts |

---

## Architecture to Show

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐     ┌──────────────┐
│   INPUTS    │ ──▶ │  FACT EXTRACTORS │ ──▶ │  STORAGE    │ ──▶ │ CLASSIFIER   │
│             │     │                  │     │             │     │              │
│ • URL       │     │ 6 Categories:    │     │ url_facts   │     │ Rules like:  │
│ • HTML      │     │ url (cheapest)   │     │ table       │     │ hasDate AND  │
│ • Response  │     │ document         │     │             │     │ hasNews →    │
│             │     │ schema           │     │ name: bool  │     │ "article"    │
│             │     │ meta             │     │             │     │              │
│             │     │ response         │     │             │     │ Output:      │
│             │     │ page             │     │             │     │ article |    │
│             │     │                  │     │             │     │ listing |    │
│             │     │ FactRegistry     │     │             │     │ unknown      │
└─────────────┘     └──────────────────┘     └─────────────┘     └──────────────┘
```

---

## SVG Specifications

### Canvas
- **Size:** 1200×900 pixels
- **Theme:** Industrial Luxury Obsidian (dark background, gold accents)
  - Background: `#0a0d14` 
  - Cards/panels: `#141824`
  - Borders: `rgba(201, 162, 39, 0.3)` (gold tint)
  - Primary text: `#f0f4f8`
  - Accent: `#c9a227` (gold)
  - Secondary colors: emerald `#10b981`, sapphire `#3b82f6`

### Required Elements

1. **Title** at top: "Fact-Based Classification System"

2. **Input Sources** (left):
   - URL String (primary, highlighted)
   - HTML Document (secondary)
   - HTTP Response (secondary)

3. **Fact Extractors** (center-left):
   - Show 6 category boxes stacked/arranged
   - `url` category emphasized as "cheapest"
   - Show 2-3 example facts: `url.hasDateSegment`, `url.hasNewsKeyword`, `url.isHomepage`
   - Include FactRegistry as central coordinator

4. **Storage** (center-right):
   - Database icon or table representation
   - Show `fact_name → TRUE/FALSE` concept

5. **Classification Engine** (right):
   - Rule box showing: `hasDate AND hasNews → "article"`
   - Output labels: article, listing, homepage, unknown

6. **Flow Arrows**:
   - Clear left-to-right data flow
   - Labeled where helpful

7. **Legend** (bottom or corner):
   - Explain any icons/colors used

---

## SVG Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900">
  <title>Fact-Based Classification System Architecture</title>
  
  <defs>
    <!-- Define gradients, filters, markers here -->
  </defs>
  
  <!-- Background -->
  <rect width="1200" height="900" fill="#0a0d14"/>
  
  <!-- Your architecture diagram -->
  
</svg>
```

---

## Quality Checklist

- [ ] Accurate representation of the system (facts are boolean, not weighted)
- [ ] All 6 fact categories shown (url, document, schema, meta, response, page)
- [ ] Clear left-to-right data flow
- [ ] Consistent styling throughout
- [ ] Valid SVG (proper nesting, no errors)
- [ ] Visually polished (alignment, spacing, professional look)
- [ ] **NO OVERLAPPING TEXT** — all text elements must be readable
- [ ] **NO MISPOSITIONED BOXES** — child elements must fit within parent containers

---

## Validation (MANDATORY — Do NOT skip!)

After creating, save as `docs/diagrams/fact-classification-architecture.svg` and run:

```bash
# 1. Structural validation
node tools/dev/svg-validate.js docs/diagrams/fact-classification-architecture.svg

# 2. CRITICAL: Collision detection (checks for overlapping elements)
node tools/dev/svg-collisions.js docs/diagrams/fact-classification-architecture.svg --strict
```

### Pass Criteria

| Check | Requirement |
|-------|-------------|
| `svg-validate.js` | Zero errors |
| `svg-collisions.js` | Zero 🔴 HIGH severity issues |

**If you have HIGH severity issues, FIX THEM before delivering.** Adjust positions, reduce text length, or expand containers.

### Why This Matters

AI agents cannot "see" SVG output—you can only reason about coordinates mathematically. Nested `transform="translate(x,y)"` makes absolute positions non-obvious. The collision detector uses a browser engine to compute actual bounding boxes and find overlaps. **This is your quality gate.**

---

## Output

Provide the complete SVG code. Make it look great! 🎨
