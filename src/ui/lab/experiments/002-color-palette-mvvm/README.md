# Experiment 001: Color Palette

**Status**: ✅ Validated (30/30 checks pass)  
**Started**: 2025-11-30  
**Source**: Copied from `jsgui3-html/controls/organised/0-core/0-basic/1-compositional/`

---

## Hypothesis

The jsgui3 `Color_Palette` control can be improved with:
1. Better theme integration (Luxury Obsidian palette support)
2. More flexible palette formats (arrays, objects, CSS variables)
3. Cleaner code structure with better separation of concerns
4. Improved activation and event handling patterns

---

## Files

| File | Description |
|------|-------------|
| `ColorPaletteControl.js` | Main color palette (copied from jsgui3, modified) |
| `ColorGridControl.js` | Color grid component (copied from jsgui3, modified) |
| `GridControl.js` | Base grid control (copied from jsgui3, modified) |
| `CellControl.js` | Grid cell control (copied from jsgui3, modified) |
| `palettes.js` | Color palette definitions (crayola, luxury obsidian, etc.) |
| `check.js` | Verification script |

---

## Changes from jsgui3-html Original

### Naming Convention
- Renamed from `Color_Palette` → `ColorPaletteControl` (matches project convention)
- Renamed from `Color_Grid` → `ColorGridControl`
- Renamed from `Grid` → `GridControl`
- Renamed from `Cell` → `CellControl`

### Dependencies
- Changed `require('../../../../../html-core/html-core')` → `require("jsgui3-html")`
- Self-contained within lab (doesn't depend on relative jsgui3 paths)

### Planned Improvements
- [ ] Theme-aware color selection
- [ ] Support for CSS custom properties as palette source
- [ ] Better touch/mouse event handling
- [ ] Accessibility improvements (ARIA labels, keyboard navigation)
- [ ] Smaller/more efficient rendering for large palettes

---

## Upstream Potential

**HIGH** - If these improvements prove valuable, they could be contributed back to jsgui3-html.

---

## Findings

*(Document discoveries as you work)*

1. **Reserved property conflict**: jsgui3 Control has a `.background` property for CSS background styling. Using `prop(this, 'background', ...)` causes "Cannot redefine property" error. Use internal `_bg`/`_fg` instead with custom getters/setters.

2. **Palette format flexibility**: Original only accepted array format. Now accepts string names ('crayola', 'luxuryObsidian') that resolve to pre-defined palettes.

3. **Multiple palette sources**: Added palettes.js with:
   - `PAL_CRAYOLA` - Original jsgui3 crayola colors (48 colors)
   - `PAL_LUXURY_OBSIDIAN` - Project theme colors (34 colors)
   - `PAL_ART_PLAYGROUND` - Art canvas colors (12 colors)
   - `PAL_WEB_SAFE` - 216 web-safe colors
   - `PAL_GRAYSCALE` - 16-step grayscale

4. **Grid composition works**: ColorGrid → Grid → Cell hierarchy renders correctly, generating nested div structure with proper data-jsgui-id attributes for client-side activation.
