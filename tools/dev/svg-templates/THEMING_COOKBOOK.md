# SVG Theming Cookbook

> **For agents who aren't artists** — follow these recipes to create beautiful, consistent SVGs.

## Quick Start: White Leather × Obsidian Luxe

This is the flagship premium theme. Copy these exact values for guaranteed good results.

---

## 1. Color Palette (Copy-Paste Ready)

### Background & Surfaces
```
White Leather Background: #ffffff → #f0ece4 (diagonal gradient)
Canvas/Content Area:      #fdfcfa (near-white)
Brushed Metal Surface:    5-stop alternating #e5e1d7 / #d8cba9
```

### Obsidian (Dark Industrial)
```
Obsidian Light:  #1a1f2e
Obsidian Deep:   #0a0d14
Gradient:        x1="0%" y1="0%" x2="100%" y2="100%"
```

### Gemstone Colors (Primary Actions)
```
┌─────────────┬───────────┬───────────┬───────────┐
│ Gem         │ Bright    │ Rich      │ Deep      │
├─────────────┼───────────┼───────────┼───────────┤
│ Ruby        │ #e74c5e   │ #c21f32   │ #8d1424   │
│ Emerald     │ #2dd4bf   │ #1a8f4d   │ #0f5f33   │
│ Sapphire    │ #60a5fa   │ #1e5aad   │ #123a74   │
└─────────────┴───────────┴───────────┴───────────┘

Gradient stops: 0% (bright), 50% (rich), 100% (deep)
Direction: x1="0%" y1="0%" x2="100%" y2="100%"
```

### Accent Colors
```
Brushed Gold Stroke:  #d8cba9
Cream/Ivory Text:     #f0ece4
Muted Gold Labels:    #d8cba9
Dark Text:            #1a1f2e
Success/Yes:          #1a8f4d
Error/No:             #c21f32
Muted Info:           #888888
```

---

## 2. Gradient Definitions (XML Snippets)

### Background Gradient
```xml
<linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="#ffffff"/>
  <stop offset="100%" stop-color="#f0ece4"/>
</linearGradient>
```

### Obsidian Frame
```xml
<linearGradient id="obsidianFrame" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="#1a1f2e"/>
  <stop offset="100%" stop-color="#0a0d14"/>
</linearGradient>
```

### Brushed Metal (White Gold/Platinum)
```xml
<linearGradient id="brushedMetal" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="#e5e1d7"/>
  <stop offset="25%" stop-color="#d8cba9"/>
  <stop offset="50%" stop-color="#e5e1d7"/>
  <stop offset="75%" stop-color="#d8cba9"/>
  <stop offset="100%" stop-color="#e5e1d7"/>
</linearGradient>
```

### Ruby Gemstone
```xml
<linearGradient id="rubyGem" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="#e74c5e"/>
  <stop offset="50%" stop-color="#c21f32"/>
  <stop offset="100%" stop-color="#8d1424"/>
</linearGradient>
```

### Emerald Gemstone
```xml
<linearGradient id="emeraldGem" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="#2dd4bf"/>
  <stop offset="50%" stop-color="#1a8f4d"/>
  <stop offset="100%" stop-color="#0f5f33"/>
</linearGradient>
```

### Sapphire Gemstone
```xml
<linearGradient id="sapphireGem" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="#60a5fa"/>
  <stop offset="50%" stop-color="#1e5aad"/>
  <stop offset="100%" stop-color="#123a74"/>
</linearGradient>
```

---

## 3. Filter Definitions

### Drop Shadow (Panels & Frames)
```xml
<filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
  <feOffset dx="0" dy="4" in="SourceAlpha" result="shadowOffset"/>
  <feGaussianBlur in="shadowOffset" result="shadowBlur" stdDeviation="8"/>
  <feBlend in="SourceGraphic" in2="shadowBlur" mode="normal"/>
</filter>
```

### Gem Glow (Subtle Luminescence)
```xml
<filter id="gemGlow" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="3"/>
  <feComposite in="blur" in2="SourceGraphic" operator="over"/>
</filter>
```

---

## 4. Component Recipes

### Gemstone Button (3-Layer Pattern)

**Structure**: Frame → Gem → Label

```xml
<!-- Container group -->
<g id="rubyButton" transform="translate(X, Y)">
  <!-- Layer 1: Obsidian frame with gold border -->
  <rect fill="#1a1f2e" width="110" height="40" rx="8" 
        stroke="#d8cba9" stroke-width="2"/>
  
  <!-- Layer 2: Gem with glow (7px inset from frame) -->
  <rect fill="url(#rubyGem)" filter="url(#gemGlow)" 
        width="96" height="26" x="7" y="7" rx="5"/>
  
  <!-- Layer 3: White bold text centered -->
  <text fill="#ffffff" font-family="Arial, sans-serif" 
        font-size="13" font-weight="bold" 
        text-anchor="middle" x="55" y="25">+ Add Node</text>
</g>
```

**Size Math**:
- Frame: width × height (e.g., 110×40)
- Gem: (width - 14) × (height - 14), positioned at (7, 7)
- Text: x = width/2, y = height/2 + 5

### Decision Tree Node

```xml
<g transform="translate(X, Y)">
  <!-- Outer frame with shadow -->
  <rect fill="#1a1f2e" filter="url(#dropShadow)" 
        width="160" height="50" rx="10"
        stroke="#d8cba9" stroke-width="3"/>
  
  <!-- Inner gem (7px inset) -->
  <rect fill="url(#sapphireGem)" filter="url(#gemGlow)"
        width="146" height="36" x="7" y="7" rx="6"/>
  
  <!-- Label -->
  <text fill="#ffffff" font-family="Arial, sans-serif"
        font-size="14" font-weight="bold"
        text-anchor="middle" x="80" y="32">Node Label</text>
</g>
```

### Curved Edge (Parent → Child)

```xml
<!-- Bezier curve: start at parent bottom, curve to child top -->
<path d="M parentX parentBottomY 
         C parentX controlY1, childX controlY2, childX childTopY"
      fill="none" stroke="#1a1f2e" stroke-width="3"/>
```

**Control Point Formula**:
- controlY1 = parentBottomY + (distance × 0.4)
- controlY2 = childTopY - (distance × 0.3)

**Example** (root at y=60 → child at y=170):
```xml
<path d="M 370 60 C 370 100, 170 130, 170 170" 
      fill="none" stroke="#1a1f2e" stroke-width="3"/>
```

### Form Input Field

```xml
<g transform="translate(X, Y)">
  <!-- Label -->
  <text fill="#d8cba9" font-family="Arial, sans-serif" 
        font-size="11" x="0" y="0">Field Label</text>
  
  <!-- Input background -->
  <rect fill="url(#brushedMetal)" width="190" height="30" 
        x="0" y="10" rx="4" stroke="#d8cba9" stroke-width="1"/>
  
  <!-- Value text -->
  <text fill="#1a1f2e" font-family="Arial, sans-serif" 
        font-size="12" x="10" y="30">Field Value</text>
</g>
```

---

## 5. Layout Templates

### Editor Layout (1200×700)

```
┌────────────────────────────────────────────────────────┐
│ Header Bar (obsidian, 60px)          [Toolbar Buttons] │ y=20-80
├──────────────────────────────────┬─────────────────────┤
│                                  │                     │
│      Canvas Area (#fdfcfa)       │   Sidebar           │
│      850×560                     │   (obsidian)        │
│                                  │   250×560           │
│                                  │                     │
│                                  ├─────────────────────┤
│                                  │   Legend            │
│                                  │                     │
├──────────────────────────────────┴─────────────────────┤
│ [Zoom Controls]               Canvas Info    [Badge]   │ y=620-660
└────────────────────────────────────────────────────────┘
```

**Key Positions**:
- Main Panel: x=20, y=20, width=1160, height=660
- Header: x=20, y=20, width=1160, height=60
- Canvas: x=40, y=100, width=850, height=560
- Sidebar: x=910, y=100, width=250, height=560

---

## 6. Typography

| Element          | Font Family          | Size | Weight | Fill     |
|------------------|----------------------|------|--------|----------|
| Page Title       | Georgia, serif       | 22px | bold   | #f0ece4  |
| Section Title    | Georgia, serif       | 16px | bold   | #f0ece4  |
| Button Label     | Arial, sans-serif    | 13px | bold   | #ffffff  |
| Node Label       | Arial, sans-serif    | 14px | bold   | #ffffff  |
| Form Label       | Arial, sans-serif    | 11px | normal | #d8cba9  |
| Form Value       | Arial, sans-serif    | 12px | normal | #1a1f2e  |
| Edge Label (Yes) | Arial, sans-serif    | 11px | bold   | #1a8f4d  |
| Edge Label (No)  | Arial, sans-serif    | 11px | bold   | #c21f32  |
| Canvas Info      | Arial, sans-serif    | 11px | normal | #888888  |

---

## 7. Semantic Color Usage

| Purpose              | Gem/Color    | Use For                          |
|----------------------|--------------|----------------------------------|
| Primary / Start      | Sapphire     | Entry points, main CTAs          |
| Decision / Branch    | Emerald      | Conditional nodes, navigation    |
| Result / Outcome     | Ruby         | End states, destructive actions  |
| Neutral / Container  | Obsidian     | Frames, headers, sidebars        |
| Surface              | Brushed Metal| Panels, inputs, badges           |
| Success indicator    | #1a8f4d      | Yes labels, confirmations        |
| Error indicator      | #c21f32      | No labels, warnings              |

---

## 8. MCP Tool Workflow

When building via svg-editor MCP:

1. **Create canvas**: `svg_create_new` with dimensions
2. **Add defs**: Parent element for all gradients/filters
3. **Add gradients**: Use `parentId: "definitions"` 
4. **Add stops**: Use `parentId: "<gradientId>"`
5. **Add filters**: Same pattern as gradients
6. **Build layers bottom-up**: background → panels → content
7. **Use groups**: `transform="translate(x,y)"` for positioning
8. **Edges before nodes**: So nodes render on top
9. **Validate**: `svg_detect_collisions` with `onlyStats: true`
10. **Save**: `svg_save` then `svg_close`

---

## 9. Common Mistakes to Avoid

❌ **Don't** use flat colors without gradients — looks cheap  
✅ **Do** use 2-3 stop gradients for depth

❌ **Don't** skip the glow filter on gemstones — loses the gem effect  
✅ **Do** apply `filter="url(#gemGlow)"` to gem rects

❌ **Don't** forget stroke on frames — elements blend together  
✅ **Do** add `stroke="#d8cba9" stroke-width="2"` to frames

❌ **Don't** use sharp corners on everything — looks harsh  
✅ **Do** use `rx="8"` for buttons, `rx="10"` for nodes, `rx="12"` for panels

❌ **Don't** center text manually — math errors  
✅ **Do** use `text-anchor="middle"` with x at center point

❌ **Don't** place edges after nodes — edges cover nodes  
✅ **Do** add path elements before rect/text elements

---

## 10. Reference Files

- **Theme JSON**: `tools/dev/svg-templates/themes/white-leather-obsidian.json`
- **Example SVG**: `tmp/decision-tree-editor-v2.svg`
- **Theme Workflow**: `docs/workflows/THEME_SCHEMA_AND_STORAGE.md`

---

*Last updated: 2025-12-10 by SVG Spatial Reasoning Specialist*
