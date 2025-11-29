# Follow Ups – Industrial Luxury Obsidian Glyphs

## High Priority

- [ ] **Integration Test**: Paste glyphs into data explorer dashboard mock to confirm colors match existing theme tokens
- [ ] **Decision Tree Studio**: Integrate `decision-diamond.svg` and `status-box.svg` into the Decision Tree Editor UI
- [ ] **jsgui3 Controls**: Create `IndustrialGlyphControl` wrapper for embedding SVGs as inline components

## Medium Priority

- [ ] **Variant Glyphs**: Create Yes/No colored variants of `status-box.svg` using `leafYes` and `leafNo` gradients
- [ ] **Bidirectional Arrows**: Create left-pointing variant of `arrow-chevrons.svg`
- [ ] **Connection Lines**: Create curved connector glyphs for tree branch visualizations

## Low Priority

- [ ] **Animation**: Add subtle CSS animations (pulse glow on hover) for interactive use
- [ ] **Icon Set**: Expand to full icon library (checkmark, X, warning triangle, info circle)
- [ ] **Documentation**: Add visual guide to `docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md` showing glyph usage patterns

## Design System Considerations

- Consider extracting common `<defs>` into a shared `design/industrial-luxury-obsidian-defs.svg` that other assets can reference
- Establish naming convention for future glyphs: `{purpose}-{variant}.svg` (e.g., `status-box-success.svg`)
