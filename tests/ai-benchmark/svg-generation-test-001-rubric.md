# Fact Classification SVG - Quick Reference

This is companion info for the SVG generation task.

---

## The System in 30 Seconds

```
URL → Fact Extractors → Store TRUE/FALSE → Rules combine facts → Classification
         ↓
    "Does URL have /2024/01/15/?"  →  TRUE
    "Does URL have /news/?"        →  TRUE
    "Is it homepage?"              →  FALSE
         ↓
    Rule: hasDate AND hasNews AND NOT isHomepage → "article"
```

**The key insight**: Facts don't say "this is good" or "this is bad." They just observe. The RULES decide what combinations mean.

---

## The 6 Fact Categories (in cost order)

| Category | Source | Cost | Example |
|----------|--------|------|---------|
| **url** | URL string only | ⚡ Cheapest | `url.hasDateSegment` |
| **document** | Parsed HTML | 💰 Medium | `document.hasArticleTag` |
| **schema** | JSON-LD/Microdata | 💰 Medium | `schema.hasArticleType` |
| **meta** | `<meta>` tags | 💰 Medium | `meta.hasOgType` |
| **response** | HTTP headers | 💰 Medium | `response.isHtml` |
| **page** | Page structure | 💰💰 Higher | `page.hasMainContent` |

**Why cost matters**: URL facts need no network request—they run first. Others require fetching/parsing.

---

## Currently Implemented Facts

From `src/facts/url/index.js`:

1. `url.hasDateSegment` — URL contains `/2024/01/15/` pattern
2. `url.hasSlugPattern` — URL has word-dash-word slug
3. `url.hasNewsKeyword` — URL contains "news", "article", etc.
4. `url.hasPaginationPattern` — URL has `?page=2` or similar
5. `url.isHomepage` — URL is just the domain root

---

## FactRegistry Pattern

```javascript
// Singleton that indexes all facts
const registry = FactRegistry.getInstance();

// Get facts by category
const urlFacts = registry.getByCategory('url');  // → [HasDateSegment, ...]

// Get specific fact
const dateFact = registry.get('url.hasDateSegment');

// Get facts that can run with available data
const runnable = registry.getRunnableFacts({ url: '...' });
```

---

## Classification Rule Format

```json
{
  "name": "article",
  "conditions": {
    "AND": [
      { "fact": "url.hasDateSegment", "equals": true },
      { "fact": "url.hasNewsKeyword", "equals": true },
      { "NOT": { "fact": "url.isHomepage", "equals": true } }
    ]
  }
}
```

---

## Visual Design Notes

### Industrial Luxury Obsidian Palette

| Element | Color | Usage |
|---------|-------|-------|
| Background | `#0a0d14` | Main canvas |
| Card/Panel | `#141824` | Content boxes |
| Lighter panel | `#1a1f2e` | Highlighted areas |
| Border | `rgba(201, 162, 39, 0.3)` | Card borders |
| Gold accent | `#c9a227` | Titles, highlights |
| Gold dim | `#8b7500` | Secondary gold |
| Text bright | `#f0f4f8` | Primary text |
| Text medium | `#94a3b8` | Secondary text |
| Text muted | `#64748b` | Hints, labels |
| Emerald | `#10b981` | Success, active |
| Sapphire | `#3b82f6` | Info, links |
| Ruby | `#ef4444` | Errors, warnings |

### Typography
- Titles: Georgia, serif
- Body: Inter, system-ui, sans-serif
- Code: JetBrains Mono, monospace

---

## Common Mistakes to Avoid

❌ **Weighted scores** — Facts are TRUE/FALSE, not 0.7 or "high confidence"
❌ **Facts as classifiers** — Facts observe, rules classify
❌ **Missing the registry** — It's the central index, not just a list
❌ **Wrong category order** — URL is cheapest, page is most expensive
❌ **Forgetting "neutral"** — Pagination isn't "bad", it's just a fact

---

## What Success Looks Like

A great diagram will:
- Show the clear left-to-right pipeline
- Emphasize that facts are boolean observations
- Show the registry as the central coordinator
- Make the AND/OR rule logic visible
- Use the dark theme consistently
- Be easy to understand at a glance
