# WLILO SVG construction recipes

Concrete, copy-adaptable constructions. Values are canonical — see `tokens.md` for the full
palette tables and when to use the diagram register vs the Luxe/UI register.

## The defs block (paste first, as the first child of `<svg>`)

```xml
<defs>
  <!-- Leather background (diagram register) -->
  <linearGradient id="leatherBg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#faf9f7"/><stop offset="55%" stop-color="#f5f3ef"/>
    <stop offset="100%" stop-color="#ebe8e2"/>
  </linearGradient>
  <!-- Obsidian panel -->
  <linearGradient id="obsidianPanel" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#2d2d2d"/><stop offset="100%" stop-color="#1a1a1a"/>
  </linearGradient>
  <!-- Gold accent -->
  <linearGradient id="goldAccent" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#c9a962"/><stop offset="100%" stop-color="#e8d5a3"/>
  </linearGradient>
  <!-- Subtle leather grain (the corpus never shipped one — this is the house recipe:
       barely-there diagonal strokes; anything stronger competes with content) -->
  <pattern id="leatherGrain" width="6" height="6" patternUnits="userSpaceOnUse"
           patternTransform="rotate(35)">
    <rect width="6" height="6" fill="none"/>
    <line x1="0" y1="0" x2="0" y2="6" stroke="#1a1a1a" stroke-width="0.5" opacity="0.025"/>
  </pattern>
  <!-- Soft shadow: diagrams keep stdDeviation 3-4; hero/UI mockups may go to 8 -->
  <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#0a0d14" flood-opacity="0.18"/>
  </filter>
  <filter id="gemGlow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="3" result="b"/>
    <feComposite in="SourceGraphic" in2="b" operator="over"/>
  </filter>
  <!-- Gemstone gradients: 0% bright / 50% rich / 100% deep, always diagonal -->
  <linearGradient id="gemRuby" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#e74c5e"/><stop offset="50%" stop-color="#c21f32"/>
    <stop offset="100%" stop-color="#8d1424"/>
  </linearGradient>
  <linearGradient id="gemEmerald" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#2dd4bf"/><stop offset="50%" stop-color="#1a8f4d"/>
    <stop offset="100%" stop-color="#0f5f33"/>
  </linearGradient>
  <linearGradient id="gemSapphire" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#60a5fa"/><stop offset="50%" stop-color="#1e5aad"/>
    <stop offset="100%" stop-color="#123a74"/>
  </linearGradient>
  <!-- Brushed metal, 5 stops alternating gold/platinum -->
  <linearGradient id="brushedMetal" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="#e5e1d7"/><stop offset="25%" stop-color="#d8cba9"/>
    <stop offset="50%" stop-color="#e5e1d7"/><stop offset="75%" stop-color="#d8cba9"/>
    <stop offset="100%" stop-color="#e5e1d7"/>
  </linearGradient>
</defs>
```

Never use flat fills for surfaces — every surface gets its 2–3-stop diagonal gradient; flat
looks cheap. Colors live in `<defs>` referenced by id, not hardcoded per element.

## Canvas skeleton (five-layer model — document order IS z-order; CSS z-index does nothing)

```xml
<svg viewBox="0 0 1200 700" xmlns="http://www.w3.org/2000/svg" role="img">
  <title>…what it shows…</title><desc>…one-sentence summary for screen readers…</desc>
  <!-- defs here -->
  <rect width="1200" height="700" fill="url(#leatherBg)"/>       <!-- 1 background -->
  <rect width="1200" height="700" fill="url(#leatherGrain)"/>    <!--   grain overlay -->
  <!-- 2 edges/connectors (BEFORE nodes so nodes paint on top) -->
  <!-- 3 panels/nodes -->
  <!-- 4 labels/glyphs -->
  <!-- 5 top ornaments (badges, legend) -->
</svg>
```

Position everything with `<g transform="translate(x,y)">` groups: children use 0-based local
coordinates; absolute = local + sum of parent translates. Never hardcode absolutes inside a
translated group. SVG Y grows DOWNWARD.

## Obsidian panel

```xml
<g transform="translate(40,100)" filter="url(#softShadow)">
  <rect width="380" height="220" rx="12" fill="url(#obsidianPanel)"
        stroke="#c9a962" stroke-width="1.5"/>
  <text x="190" y="34" text-anchor="middle" font-family="Georgia, serif" font-size="16"
        font-weight="bold" fill="#e8d5a3">Panel title</text>
  <line x1="24" y1="48" x2="356" y2="48" stroke="url(#goldAccent)" stroke-width="1"/>
  <!-- body text in leather tones #faf9f7; secondary #d8d0c1 -->
</g>
```

The gold frame stroke is what stops panels "blending together" — thin (1–1.5px), always
present. Radii graded: buttons rx=8, nodes rx=10, panels rx=12. Never nest obsidian inside
obsidian (kills the leather negative space); one level of chips inside a panel is the maximum.

## Gemstone button/node (the 3-layer recipe)

Semantics are fixed: **sapphire = primary/start/entry · emerald = decision/branch/navigation ·
ruby = result/end-state/destructive**. Construction for a `w × h` gem:

```xml
<g transform="translate(x,y)">
  <rect width="160" height="44" rx="8" fill="url(#obsidianPanel)"
        stroke="#d8cba9" stroke-width="2"/>                      <!-- 1 obsidian frame -->
  <rect x="7" y="7" width="146" height="30" rx="5"
        fill="url(#gemSapphire)" filter="url(#gemGlow)"/>        <!-- 2 gem, inset 7px -->
  <text x="80" y="27" text-anchor="middle" font-family="Arial, sans-serif"
        font-size="13" font-weight="bold" fill="#ffffff">Start ⟶</text> <!-- 3 label -->
</g>
```

Inner gem = `(w−14) × (h−14)` at `(7,7)`; label at `x = w/2`, `y = h/2 + 5` (13px font).
Always `text-anchor="middle"` at computed centers — never hand-place centered text.

## Connectors

Curved bezier, drawn before nodes: `M startX startY C startX cY1, endX cY2, endX endY` with
`cY1 = startY + 0.4·distance`, `cY2 = endY − 0.3·distance` (0.3–0.5 range). Diagram register:
stroke `#888` or gold for the emphasized path, width 1.5–2, `fill="none"` always. Luxe
register: `#1a1f2e` width 3. Arrowheads gold and small. Label edges sparingly — `✓`/`✗` or
Yes/No in `#1a8f4d`/`#c21f32` 11px bold beats a phrase.

## Text width math (text overflow is the #1 defect class — budget before placing)

- `container_width = max_chars × font_size × ratio + 2 × padding`; ratios: mono **0.60**,
  sans **0.52**, serif **0.55**. Padding budget 8–16px per side; text uses ≤ 80% of container.
- **Emoji count as 2 characters** in width estimates.
- Abbreviate rather than shrink fonts below 10px. Wrap via multiple `<text>`/`<tspan>` with
  fixed `dy` — SVG never auto-wraps.
- Optical beats mathematical: circles need ~+10% clearance, triangles ~+15%; keep ≥30px
  between adjacent node edges; never stack nodes with <100px vertical gap in map-style pieces.

## Typography table (diagram register)

| Element | Font | Size | Fill |
| --- | --- | --- | --- |
| Page title | Georgia serif bold | 22–32px | `#2d2d2d` on leather / `#f0ece4` on obsidian header |
| Panel title | Georgia serif bold | 15–16px | `#e8d5a3` |
| Node/button label | Arial bold | 13–14px | `#ffffff` |
| Body | Arial | 10–12px | `#2d2d2d` / on obsidian `#faf9f7` |
| Small label / caps | Arial, letter-spacing 0.05em | 10–11px | `#666` / gold |
| Code | JetBrains Mono/Consolas | 10–11px | register text |

## Validation

**If the copilot-dl-news toolchain is available** (`tools/dev/`):
`node tools/dev/svg-validate.js <f>` → `node tools/dev/svg-collisions.js <f> --strict` (zero
HIGH required; note it exits 1 on ANY finding incl. LOW — read the report, don't gate blindly
on exit code) → `node tools/dev/svg-overflow.js <f>` (zero HIGH; `--puppeteer` for accurate
measurement; its advertised `--fix/--dry-run` flags are NOT implemented — don't use them).

**Portable fallback (no tools):** run this checklist mechanically —
1. XML parses (`node -e "new (require('jsdom').JSDOM)(svg)"` or any parser; or careful read).
2. `viewBox` present; `<title>` + `<desc>` present; `& < >` escaped in text (emoji need NO
   escaping — never entity-encode them); no duplicate `id`s.
3. Re-run the width math for every text vs its container (the 80% rule).
4. Walk every pair of siblings for overlap by coordinates — you cannot see the render;
   arithmetic is your eyes.
5. Palette audit: every hex present appears in tokens.md tables; registers not mixed.

**Repair loop** on failures: Detect → Diagnose → Compute → Apply → Verify. Fix HIGH first,
move the *later* element by the minimal separation vector +4–8px padding, prefer repairs that
preserve alignments, then re-check for cascades. When it "feels off": reduce glow, lighten the
leather midtone, or widen padding — those three, in that order.
