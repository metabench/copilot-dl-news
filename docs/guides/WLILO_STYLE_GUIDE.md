# WLILO Style Guide (White Leather + Industrial Luxury Obsidian)

WLILO = **White Leather + Industrial Luxury Obsidian**. Use this guide to keep diagrams, UI chrome, and docs visuals consistent.

## Philosophy (The Soul of WLILO)

WLILO isn't arbitrary aesthetics—each choice serves a cognitive purpose:

### Why White Leather?
- **Readability under fatigue.** Light backgrounds reduce eye strain during extended work sessions. Cream tones (#faf9f7 → #ebe8e2) are softer than pure white, avoiding harsh glare while maintaining contrast.
- **Quiet confidence.** Leather suggests permanence and craft without shouting. It recedes, letting content take focus.
- **Texture implies depth.** Subtle grain patterns create visual interest without competing with information.

### Why Obsidian Panels?
- **Anchoring attention.** Dark containers create figure-ground separation that guides the eye to important content. The brain processes high-contrast edges faster.
- **Information hierarchy.** Obsidian frames establish zones—what's inside the panel matters more than what's outside.
- **Reduced cognitive load.** Bounded regions help users chunk information, making complex diagrams parseable.

### Why Gold Accents?
- **Scarcity signals importance.** Gold works precisely because it's used sparingly. When everything glows, nothing does.
- **Directional cueing.** Gold strokes and arrowheads pull the eye along intended reading paths.
- **Warmth in restraint.** Gold adds life to the obsidian/leather palette without breaking its seriousness.

### Why Soft Shadows and Glows?
- **Depth without distraction.** Low-blur shadows (stdDev 3–4) suggest layering without creating visual noise.
- **Physicality.** Subtle shadows make flat designs feel grounded, as if elements have weight.

### The Overarching Principle
WLILO prioritizes *clarity under cognitive load*. These are work artifacts—diagrams agents study, dashboards humans scan while debugging. Every choice reduces friction: light backgrounds for long reading, dark panels for focus zones, gold for navigation, shadows for hierarchy. Beauty emerges from function, not decoration.

## Purpose
- Deliver a premium, legible aesthetic for diagrams and UI chrome.
- Keep backgrounds light (leather) with deep obsidian containers and gold accents.
- Provide a fast checklist for agents and tools (CLI + MCP) to inspect and iterate.

## Core Vocabulary
- **WLILO**: White Leather + Industrial Luxury Obsidian.
- **Leather**: Off-white, subtle grain/gradient; quiet backdrop.
- **Obsidian**: Deep charcoal panels/frames; anchors content.
- **Gold accents**: Thin strokes, headers, markers; sparing use.
- **Glow layers**: Soft drop shadows and inner glows for depth, never harsh.

## Palette (reference values)
- Leather base: `#faf9f7` → `#f5f3ef` → `#ebe8e2`
- Obsidian panels: `#2d2d2d` → `#1a1a1a`
- Gold accents: `#c9a962` → `#e8d5a3`
- Cool highlight (optional CTA/glow): `#4a9eff` → `#2d7dd2`
- Success highlight (optional): `#2ecc71` → `#27ae60`
- Text: primary `#2d2d2d`, secondary `#888`, tertiary `#666`

## Layout Motifs
- Leather background with subtle texture (low-opacity pattern) and gentle diagonal/vertical gradient.
- Obsidian containers with small radius (6–12px), thin gold stroke, soft shadow.
- Headers: centered or left-aligned serif/sans mix; gold underline or bar.
- Lines/arrows: gold strokes with clean arrowheads; avoid clutter.
- Depth: `dropShadow` + occasional inner glow; keep blur low (stdDev 3–4).
- Spacing: generous padding; avoid overlaps—use svg-collisions checks.
- Typography: Pair a classic serif for titles (e.g., Georgia) with a clean sans for body (Arial). Keep body 10–12px in diagrams; larger for UI.

## Reference Artifacts (study before creating new pieces)
- Spatial reasoning diagrams: [docs/books/2d-svg-spatial-reasoning/diagrams](docs/books/2d-svg-spatial-reasoning/diagrams)
  - Coordination + gradients: [01-coordinate-system.svg](docs/books/2d-svg-spatial-reasoning/diagrams/01-coordinate-system.svg)
  - Transform chains: [02-transform-chain.svg](docs/books/2d-svg-spatial-reasoning/diagrams/02-transform-chain.svg)
  - Toolkit/layout patterns: [07-toolkit-overview.svg](docs/books/2d-svg-spatial-reasoning/diagrams/07-toolkit-overview.svg)
  - Prompt flow (recent): [ai-prompt-processing.svg](docs/books/2d-svg-spatial-reasoning/diagrams/ai-prompt-processing.svg)
- System designs: [docs/designs/observatory-architecture-v2.svg](docs/designs/observatory-architecture-v2.svg), [docs/designs/decision-sandbox-architecture.svg](docs/designs/decision-sandbox-architecture.svg)

## How to Review (agents + tools)
- For SVGs: run `node tools/dev/svg-collisions.js <file> --strict` before shipping; resolve HIGH/MED overlaps.
- Use MCP svg-editor tools to inspect: `svg_open`, `svg_detect_collisions`, `svg_list_elements`, `svg_get_element`.
- When you need visuals: ask the user for screenshots, or render via existing scripts (e.g., diagram screenshots). If missing, request them explicitly.
- Check gradients/strokes for consistency with palette; avoid random colors.

## Applying WLILO to New Work
- Start with leather background gradient + subtle texture.
- Frame major groups in obsidian panels with thin gold stroke and soft shadow.
- Use gold accents sparingly: headers, separators, arrowheads.
- Reserve bright glows (blue/green) for emphasis or active states; keep them minimal.
- Maintain generous whitespace; avoid crowding text near strokes.
- Validate spacing with svg-collisions and MCP inspection before delivery.

## Iteration Notes
- Reuse existing diagrams as templates to speed consistent layouts.
- If something feels off: reduce glow, lighten leather midtone, or widen padding.
- Capture follow-up ideas in session notes and update this guide when patterns evolve.
