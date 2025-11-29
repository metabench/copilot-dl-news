# Working Notes – Industrial Luxury Obsidian Glyphs

- 2025-11-29 11:05 — Session created via CLI (`node tools/dev/session-init.js --slug "industrial-obsidian-glyphs"`).
- 2025-11-29 11:15 — Palette sampling:
	- `docs/diagrams/page-classification-decision-tree-architecture.svg` defines `obsidianBg` (#0a0f1a → #1a1f2e), `goldAccent` (#d4af37 → #b8931f), `decisionNode` (#334155 → #1e293b), `leafYes` (#166534 → #14532d), `leafNo` (#7f1d1d → #450a0a).
	- `docs/diagrams/decision-tree-engine-roadmap.svg` expands the theme with `steelGradient` (#4a5159 → #1a2028), `goldShine` (#5a4a0e → #f7e08a), `copperGlow` (#e69050 → #8b5a2b), and industrial patterns (`industrialGrid`, `diagonalHatch`).
	- Common strokes use #c9a227 at 1–2 px with 40–60% opacity for overlays; glows rely on `feGaussianBlur` + `feFlood` (#c9a227, 0.5 opacity).
	- Typography: Georgia/serif for headers, Inter for labels, JetBrains Mono for data callouts. Glyphs will omit text but keep consistent radii and stroke weight cues.

- 2025-11-29 04:42 — SVG Glyphs Created:

## Design Tokens Applied

| Token | Value | Usage |
|-------|-------|-------|
| `obsidianBg` | `#0a0f1a → #1a1f2e` | Background gradient |
| `decisionNode` | `#334155 → #1e293b` | Diamond fill, neutral box fill |
| `goldAccent` | `#705a10 → #c9a227 → #e8c252` | Primary stroke, glow source |
| `bronzeGradient` | `#7a5c2b → #a67c3d` | Secondary chevrons |
| `copperGlow` | `#8b5a2b → #cd7f32` | Trailing chevrons |
| `leafYes` | `#166534 → #14532d` | Success state (available) |
| `leafNo` | `#7f1d1d → #450a0a` | Reject state (available) |
| `industrialGrid` | `#c9a227` @ 0.05–0.06 opacity | Subtle background texture |

## Filter Definitions

```xml
<!-- Gold Glow (reusable across all glyphs) -->
<filter id="goldGlow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur stdDeviation="1.5-2" result="blur"/>
  <feFlood flood-color="#c9a227" flood-opacity="0.4-0.5"/>
  <feComposite in2="blur" operator="in"/>
  <feMerge>
    <feMergeNode/>
    <feMergeNode in="SourceGraphic"/>
  </feMerge>
</filter>

<!-- Soft Shadow -->
<filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
  <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.4-0.5"/>
</filter>
```

## Commands Used

```bash
# Create design folder
mkdir -p design

# Verify SVG structure
cat design/decision-diamond.svg | head -50

# View in browser (manual step)
# Open each SVG directly or serve via local HTTP server
```

## Glyph Specifications

### decision-diamond.svg (96×96)
- Diamond centered at (48,48), points at ±32px from center
- Inner highlight diamond at ±22px for depth
- Question mark "?" in Georgia serif at 20px
- Stroke width: 2px primary, 0.5px inner highlight

### arrow-chevrons.svg (96×64)
- Three chevrons at x = 24, 8, -8 (leading to trailing)
- Chevron sizes: 12px, 10px, 8px (decreasing)
- Stroke widths: 2.5px, 2px, 1.5px (decreasing)
- Base conduit line at 4px stroke
- Origin circle at x=-32, r=4
- Arrowhead polygon at x=36-44

### status-box.svg (96×64)
- Main rect: 76×40, rx=6
- Corner rivets: r=1.5 at ±32,±14
- Status indicator: cx=-26, r=5, green (#22c55e)
- Placeholder lines: 40×4 and 28×3
