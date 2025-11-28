# Plan: Refactor Z-Server to use jsgui3

## Objective
Refactor the Z-Server Electron renderer to use `jsgui3-client` for UI component management, replacing the current vanilla DOM manipulation. This aligns the Z-Server architecture with the rest of the repository's UI standards (e.g., Diagram Atlas, Facts Server).

**Visual Theme**: Industrial Luxury Obsidian — matching the repository's most artistic SVGs (gazetteer-assessment, decision-tree-studio).

## Done When
- [x] jsgui3-client installed in z-server
- [x] Controls factory created with all UI components
- [x] Industrial Luxury Obsidian CSS theme implemented
- [x] renderer.js refactored to use jsgui3
- [x] esbuild bundling configured
- [x] App launches and displays server list
- [ ] Session properly documented in session folder

## Visual Design Language

### Color Palette (Industrial Luxury Obsidian)
```css
--obsidian-bg: #050508           /* Deep black base */
--obsidian-panel: #0a0d14        /* Panel backgrounds */
--obsidian-card: #141824         /* Card backgrounds */
--obsidian-elevated: #1a1f2e     /* Elevated surfaces */

--gold-primary: #c9a227          /* Primary accent - gold */
--gold-dim: #8b7500              /* Muted gold */
--gold-bright: #fffacd           /* Bright gold text */

--emerald: #50c878               /* Success/running state */
--emerald-dark: #2e8b57          /* Emerald borders */

--ruby: #ff6b6b                  /* Error/stop state */
--ruby-dark: #e31837             /* Ruby borders */

--sapphire: #6fa8dc              /* Info/neutral accent */
--sapphire-dark: #0f52ba         /* Sapphire borders */

--amethyst: #da70d6              /* Highlight/selection */
--amethyst-dark: #9966cc         /* Amethyst borders */

--topaz: #ffc87c                 /* Warning/pending */

--text-primary: #f0f4f8          /* Primary text */
--text-muted: #94a3b8            /* Muted text */
--text-dim: #64748b              /* Dimmed text */
```

### Typography
- **Display**: Georgia, serif (titles, headings)
- **Body**: Inter, system-ui, sans-serif (content)
- **Mono**: JetBrains Mono, Consolas, monospace (code, logs)

### Visual Effects
- Subtle gold glows on interactive elements
- Grid pattern overlay on backgrounds
- Radial gradients for corner flourishes
- 2px gold accent borders on focused elements
- Smooth transitions (0.3s ease)

## Change Set

| File | Status | Description |
|------|--------|-------------|
| `z-server/package.json` | Modified | Added jsgui3-client, esbuild |
| `z-server/ui/controls/zServerControlsFactory.js` | **NEW** | Complete control factory (~1350 lines) |
| `z-server/ui/controls/ZServerControls.js` | **NEW** | Entry point |
| `z-server/renderer.src.js` | **NEW** | Source file using jsgui3 |
| `z-server/renderer.js` | Generated | Bundled output |
| `z-server/styles.css` | Replaced | Industrial Luxury Obsidian CSS |
| `z-server/index.html` | Simplified | Now just `<div id="app-root"></div>` |

## Implementation Steps

### Phase 1: Setup ✅ COMPLETE
1. ✅ Create plan document
2. ✅ Install `jsgui3-client` in z-server/package.json
3. ✅ Create `z-server/ui/controls/` directory structure

### Phase 2: Controls Implementation ✅ COMPLETE
1. ✅ Create `zServerControlsFactory.js` with:
   - `buildZServerStyles()` - Industrial Luxury Obsidian CSS
   - `ServerItemControl` - Individual server row
   - `ServerListControl` - Container for server items
   - `LogEntryControl` - Individual log line
   - `LogViewerControl` - Log display with auto-scroll
   - `ControlButtonControl` - Styled action buttons
   - `ControlPanelControl` - Start/Stop buttons
   - `SidebarControl` - Servers sidebar
   - `ContentAreaControl` - Main content area
   - `TitleBarControl` - App title bar
   - `ZServerAppControl` - Root orchestrator

### Phase 3: Integration ✅ COMPLETE
1. ✅ Update `renderer.src.js`:
   - Import jsgui3-client
   - Initialize ZServerApp with Client_Page_Context
   - Wire up electronAPI events
2. ✅ Update `index.html`:
   - Minimal markup (app-root container only)
   - Load bundled renderer.js
3. ✅ Update `styles.css`:
   - Industrial Luxury Obsidian theme
   - Complete CSS class system with `.zs-*` prefix

### Phase 4: Build Setup ✅ COMPLETE
1. ✅ Add esbuild as dev dependency
2. ✅ Create build script to bundle renderer.src.js → renderer.js
3. ✅ Update package.json scripts (build, start, dev)

## Risk Assessment
- **Electron + jsgui3**: jsgui3-client designed for browser, should work in Electron renderer ✅
- **Bundle Size**: Bundle is 1.3MB (includes full jsgui3-client)
- **Event Bridge**: electronAPI callbacks wired through control methods ✅

## Verification
1. ✅ `npm start` in z-server - builds and launches
2. Server list renders with gold accents
3. Selection highlights with amethyst glow
4. Running servers show emerald indicator
5. Logs display with proper mono font
6. Start/Stop buttons have proper hover states
7. Scrollbars match obsidian theme
