# Plan: Facts Server with Industrial Luxury Obsidian UI

## Objective

Create a new `facts.js` server app for the "Fact Determination Layer" with a distinctive Industrial Luxury Obsidian aesthetic that goes far beyond the current Data Explorer styling.

## Done When

- [ ] facts.js server starts and serves `/` route
- [ ] Industrial Luxury Obsidian styling is visually distinct and premium
- [ ] URL list displays with paging
- [ ] Server supports detached mode (`--detached`, `--stop`, `--status`)
- [ ] Client-side activation works

## Design Reference

The "Industrial Luxury Obsidian" aesthetic is based on the existing SVG diagrams:
- `docs/diagrams/decision-tree-engine-deep-dive.svg` - Full color palette

### Color Palette (from deep-dive.svg)

**Primary Background - Deep Obsidian:**
- `#050508` - Darkest
- `#0a0d14` - Dark
- `#0f1420` - Base
- `#141824` - Card
- `#1a1f2e` - Card highlight

**Gold Accent (Luxury):**
- `#ffd700` - Gold bright
- `#d4af37` - Gold muted
- `#c9a227` - Gold primary (main accent)
- `#b8960f` - Gold dark
- `#a07d00` - Gold darkest

**Gem Colors (Accents):**
- Emerald: `#50c878` → `#2e8b57` → `#1a5d38`
- Ruby: `#ff6b6b` → `#e31837` → `#8b0000`
- Sapphire: `#6fa8dc` → `#0f52ba` → `#082567`
- Amethyst: `#da70d6` → `#9966cc` → `#4b0082`
- Topaz: `#ffc87c` → `#ff9f00` → `#cc7000`

**Text Colors:**
- `#cbd5e1` - Primary text
- `#94a3b8` - Secondary text
- `#64748b` - Muted text

### Key Visual Elements

1. **Radial glow effects** - Subtle ambient glows
2. **Gold accent borders** - 2px gold-gradient borders on panels
3. **Luxury grid pattern** - Subtle diagonal hatching
4. **Soft shadows** - Drop shadow filters for depth
5. **Georgia serif** for headings, Inter for body, JetBrains Mono for code

## Change Set

### New Files

- `src/ui/server/factsServer.js` - Main Express server
- `src/ui/styles/luxuryObsidianCss.js` - CSS module for theme
- `src/ui/controls/FactsUrlList.js` - URL listing control for facts page
- `src/ui/server/checks/facts.check.js` - Validation script

### Modified Files

- `docs/sessions/SESSIONS_HUB.md` - Link new session

## Architecture

```
factsServer.js
├── Express app on port 4800 (default)
├── Detached mode support (--detached, --stop, --status)
├── Routes:
│   ├── GET / - Home page with URL list
│   └── GET /api/urls - JSON API for paging
└── Rendering:
    ├── luxuryObsidianCss.js - Full theme CSS
    └── FactsUrlList.js - Paginated URL control
```

## Risks/Assumptions

- No database dependencies initially - uses existing news.db
- Focus is on visual styling first, functionality second
- Fact evaluation will come in a later iteration

## Tests

- Manual visual inspection
- Check script validates HTML structure
- Server starts in detached mode correctly

## Benchmark

N/A - UI focused task

## Docs to Update

- This session's PLAN.md and WORKING_NOTES.md
- SESSIONS_HUB.md to link session
