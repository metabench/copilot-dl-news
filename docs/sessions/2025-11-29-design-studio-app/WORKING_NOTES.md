# Working Notes – Design Studio Server App

- 2025-11-29 — Session created via CLI. Add incremental notes here.

## Architecture Decisions

### Shared Code Extraction
Extracted reusable code to `src/ui/server/shared/`:

1. **Utilities** (`src/ui/server/shared/utils/`):
   - `fileTree.js` - Generic file tree builder (from docTree.js)
   - `markdownRenderer.js` - Markdown to HTML
   - `svgRenderer.js` - SVG to jsgui3 control
   - `index.js` - Re-exports all utilities

2. **Isomorphic Controls** (`src/ui/server/shared/isomorphic/`):
   - `jsgui.js` - Isomorphic resolver (server vs browser)
   - `controls/ResizableSplitLayoutControl.js` - Reusable 2-column layout
   - `controls/index.js` - Control exports

### Design Studio Structure
```
src/ui/server/designStudio/
├── server.js                    # Express server (port 4800)
├── client.js                    # Client bundle entry point
├── isomorphic/
│   ├── jsgui.js                # Local jsgui resolver
│   └── controls/
│       ├── DesignAppControl.js
│       ├── DesignNavControl.js
│       ├── DesignViewerControl.js
│       └── index.js
├── public/
│   ├── design-studio.css       # "Luxury White Leather" theme
│   ├── design-studio.js        # Vanilla JS fallback
│   └── design-studio-client.js # Generated bundle
└── shims/                      # esbuild shims
```

### Theme: "Luxury White Leather, Industrial Obsidian Features"
- **Primary Colors**:
  - White/cream leather: `#FAFAFA`, `#F5F5F0`, `#FFFEF9`
  - Obsidian black: `#1A1A1A`, `#2D2D2D`, `#3A3A3A`
  - Gold accents: `#C9A227`, `#DAA520`, `#B8860B`
- **Typography**: 
  - Headings: Cormorant Garamond (serif)
  - Body: Inter (sans-serif)
- **Effects**:
  - Gold divider between panels
  - Gold border on header
  - Gold scrollbar thumb
  - Subtle leather texture via gradient

## Commands

```bash
# Build client bundle
npm run ui:design:build

# Start server
npm run ui:design

# Dev mode (build + start)
npm run ui:design:dev

# Detached mode
node src/ui/server/designStudio/server.js --detached
node src/ui/server/designStudio/server.js --status
node src/ui/server/designStudio/server.js --stop
```

## Bug Fixes

### fileTree.js - Array vs Set Extension Bug
- **Issue**: `extensions.has is not a function` when passing array
- **Cause**: Code expected Set but received array
- **Fix**: Added array-to-Set conversion at start of `buildFileTree()`

## Features Implemented

- ✅ 2-column resizable layout (shared control)
- ✅ SVG viewer with zoom controls
- ✅ File search/filter
- ✅ Dark/light theme toggle
- ✅ Mobile-responsive navigation
- ✅ Keyboard shortcuts (Cmd+K for search, T for theme, Esc to close)
- ✅ Breadcrumb navigation
- ✅ Download SVG button
