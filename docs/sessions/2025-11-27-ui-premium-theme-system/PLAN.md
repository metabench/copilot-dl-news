# Plan: UI Premium Visual Upgrade & Theme System

## Objective
Transform the Data Explorer UI from functional utility to premium presentation quality (luxury car showroom aesthetic) while implementing a comprehensive theming system with live customization capabilities.

## Done When
- [x] Pages use premium typography with custom fonts (Inter for UI, Playfair Display for headings)
- [x] Color system uses CSS custom properties with strong but comfortable contrasts
- [x] Theme configuration stored in database with API endpoints
- [x] Theme editor UI route accessible at `/theme`
- [x] All existing controls render correctly with new theme system
- [x] Client-side theme switching works without page reload
- [x] Default theme achieves luxury aesthetic (deep colors, refined spacing, subtle gradients)

## Change Set

### Core Infrastructure
- `src/ui/server/services/themeService.js` - Theme CRUD operations, defaults
- `src/ui/server/dataExplorerServer.js` - Theme routes (/theme, /api/theme)
- `src/ui/render-url-table.js` - Inject theme CSS variables, load fonts

### New Controls  
- `src/ui/controls/ThemeEditorControl.js` - Full theme customization UI
- `src/ui/controls/ColorPickerControl.js` - Color selection with preview

### CSS Architecture
- `src/ui/styles/theme-variables.css` - CSS custom properties foundation
- `src/ui/styles/premium-base.css` - Premium typography, spacing, shadows
- Theme CSS injected via `<style>` tag with CSS variables

### Client-Side
- `src/ui/client/themeManager.js` - Apply theme changes in real-time
- Update `src/ui/client/index.js` - Include theme manager

### Database
- New table: `ui_themes` (id, name, config JSON, is_default, created_at, updated_at)
- Seed default premium theme

## Theme System Architecture

### CSS Variable Structure
```css
:root {
  /* Brand Colors */
  --theme-primary: #1e293b;
  --theme-primary-light: #334155;
  --theme-accent: #c9a227;
  --theme-accent-light: #d4b348;
  
  /* Surfaces */
  --theme-bg: #0f172a;
  --theme-surface: #1e293b;
  --theme-surface-elevated: #334155;
  
  /* Text */
  --theme-text: #f8fafc;
  --theme-text-muted: #94a3b8;
  --theme-text-subtle: #64748b;
  
  /* Typography */
  --theme-font-display: 'Playfair Display', serif;
  --theme-font-body: 'Inter', system-ui, sans-serif;
  --theme-font-mono: 'JetBrains Mono', monospace;
  
  /* Spacing Scale */
  --theme-space-xs: 4px;
  --theme-space-sm: 8px;
  --theme-space-md: 16px;
  --theme-space-lg: 24px;
  --theme-space-xl: 32px;
  --theme-space-2xl: 48px;
  
  /* Radii */
  --theme-radius-sm: 6px;
  --theme-radius-md: 12px;
  --theme-radius-lg: 20px;
  
  /* Shadows */
  --theme-shadow-sm: 0 2px 8px rgba(0,0,0,0.15);
  --theme-shadow-md: 0 8px 24px rgba(0,0,0,0.2);
  --theme-shadow-lg: 0 16px 48px rgba(0,0,0,0.25);
}
```

### Theme Presets
1. **Obsidian (Default)** - Dark luxury, gold accents, deep shadows
2. **Arctic** - Light mode, clean whites, navy accents  
3. **Midnight** - Deep blue/purple gradient, cyan accents
4. **Classic** - Traditional light grey, professional blue accents

## Risks/Assumptions
- Font loading may add initial render delay (mitigate with font-display: swap)
- Theme changes stored per-browser unless user auth added
- Large CSS payload for comprehensive theming (acceptable for admin tool)

## Tests
- `tests/ui/controls/ThemeEditorControl.test.js` - Editor renders correctly
- `tests/ui/server/theme-api.test.js` - API CRUD operations
- Manual visual verification using screenshot comparison

## Docs to Update
- `/docs/guides/JSGUI3_UI_ARCHITECTURE_GUIDE.md` - Add theming section
- `AGENTS.md` - Note theme system availability
