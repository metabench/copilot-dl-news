# WLILO canonical tokens

Single source of truth for values. Two coordinated palettes exist — the **diagram palette**
(warmer, from the style guide, tuned for SVG diagrams read at length) and the **UI palette**
(crisper, from the `white-leather-obsidian` theme, tuned for HTML/CSS chrome). They are siblings,
not rivals: pick one per artifact and stay inside it.

## Diagram palette (SVG diagrams, posters, docs visuals)

| Role | Values |
| --- | --- |
| Leather base (background gradient stops) | `#faf9f7` → `#f5f3ef` → `#ebe8e2` |
| Obsidian panels | `#2d2d2d` → `#1a1a1a` |
| Gold accents | `#c9a962` → `#e8d5a3` |
| Cool highlight (optional CTA/glow) | `#4a9eff` → `#2d7dd2` |
| Success highlight (optional) | `#2ecc71` → `#27ae60` |
| Text | primary `#2d2d2d`, secondary `#888`, tertiary `#666` |
| Text on obsidian | leather tones (`#faf9f7`, gold `#e8d5a3` for emphasis) |

## UI palette (HTML/CSS, app chrome, inline-SVG-in-UI)

| Role | Values |
| --- | --- |
| Surfaces | bg `#ffffff`, bgAlt `#f0ece4`, surface `#f6f3ee`, elevated `#ffffff`, hover `#ece6dc` |
| Leather primaries | `#f6f3ee` / light `#fbf9f4` / dark `#e8e1d6` |
| Obsidian accents | `#0b0f1a` / light `#111828` / dark `#05070c` / hover `#162035` |
| Borders | `#d8d0c1`, light `#e4ddd1` |
| Text | `#0a0d14` / secondary `#2f3645` / muted `#4b5262` / subtle `#6b7280` |
| Brushed metals | gold `#d8cba9` (bright `#e6d7b5`, dark `#b5a273`), platinum `#e5e1d7`; alternating pattern `["#d8cba9","#e5e1d7"]` |
| Gemstone buttons (primary CTAs) | ruby `#c21f32`, emerald `#1a8f4d`, sapphire `#1e5aad`; frame `#0b0f1a`, bezel `#d8cba9`, bezelAlt `#e5e1d7` |
| Status | active/success `#1a8f4d` (bg `#e4f4ea`), warning `#c27c1a` (bg `#f9f0df`), error `#c21f32` (bg `#f7e4e8`), info `#1e5aad` (bg `#e4eefb`), research `#6f3fb3`, complete `#1f9f59` |
| SVG connectors | default `#6b7280`, highlight `#0b0f1a`, success `#1a8f4d`, error `#c21f32` |

## Typography

- Display/serif: `"Playfair Display", Georgia, serif` (titles; Georgia alone is fine in SVG)
- Body/sans: `"Inter", -apple-system, "Segoe UI", sans-serif` (Arial acceptable in SVG)
- Mono: `"JetBrains Mono", "Fira Code", Consolas, monospace`
- Diagram body text 10–12px; titles larger. Weights: 400 / 500 / 600 / 700.
- Letter-spacing: tight `-0.02em` (big display), wide `0.05em` (small caps labels).

## Geometry & depth

- Radii: panels 6–12px (UI scale: 6 / 12 / 20 / 28 / pill).
- Spacing scale: 4 / 8 / 16 / 24 / 32 / 48 / 64 px — generous padding always.
- Shadows (low blur is the signature — depth without noise):
  - SVG: `feDropShadow` with `stdDev` 3–4, dark `rgba(10,13,20,…)`.
  - CSS: sm `0 2px 6px rgba(10,13,20,0.08)`, md `0 8px 18px rgba(10,13,20,0.12)`,
    lg `0 16px 36px rgba(10,13,20,0.16)`, glow `0 0 24px rgba(12,19,32,0.25)`,
    inner `inset 0 2px 4px rgba(255,255,255,0.45)`.
- Gold strokes on obsidian panels: thin (1–1.5px). Transitions: 0.12s / 0.2s / 0.35s ease.

## CSS variable schema (`:root` or theme scope)

```css
--wlilo-bg / --wlilo-bg-alt        /* leather */
--wlilo-surface / --wlilo-surface-hover
--wlilo-panel                      /* obsidian */
--wlilo-border / --wlilo-border-light
--wlilo-text / --wlilo-text-secondary / --wlilo-text-muted
--wlilo-gold / --wlilo-gold-bright / --wlilo-gold-dark
--wlilo-platinum
--wlilo-ruby / --wlilo-emerald / --wlilo-sapphire
--wlilo-shadow-sm / -md / -lg
```

Apply via semantic classes (`.wlilo-panel`, `.wlilo-header`, `.wlilo-cta--ruby`), never
per-element inline styles; never freestyle hex values outside these tables.

The full machine-readable theme is bundled at `../assets/white-leather-obsidian.json`.
