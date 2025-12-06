# Z-Server Manager

_Last Updated: 2025-12-01_

## Overview

Z-Server is an **Industrial Luxury Obsidian** styled Electron application for managing development servers in the repository.

## Purpose

- **Server Discovery**: Automatically scans the repository for server entry points using `tools/dev/js-server-scan.js`
- **Process Management**: Start/stop servers directly from the UI
- **Live Logs**: View stdout/stderr logs for running servers
- **URL Detection**: Automatically detects server URLs from logs and displays them prominently
- **Visual Feedback**: Shows running status with animated indicators

## Architecture

```
z-server/
├── main.js              # Electron main process (spawns servers, IPC)
├── preload.js           # IPC bridge to renderer
├── renderer.src.js      # Entry point (esbuild bundles to renderer.js)
├── index.html           # HTML shell
├── styles.css           # Main stylesheet
└── ui/controls/
    ├── ZServerControls.js           # Module export
    └── zServerControlsFactory.js    # All jsgui3 controls (3000+ lines)
```

## Key Components

### ServerUrlControl (Large Green SVG Indicator)

When a server is running, displays:
- Large animated green pulsating SVG icon
- Server URL prominently displayed
- "OPEN IN BROWSER" button

**Known Issue**: The CSS for this control is defined in `zServerControlsFactory.js` but is NOT included in `styles.css`. This causes the green indicator to not display correctly.

### Control Hierarchy

```
ZServerAppControl (root)
├── TitleBarControl
├── SidebarControl
│   └── ServerListControl
│       └── ServerItemControl[]
└── ContentAreaControl
    ├── ControlPanelControl
    ├── ServerUrlControl ← Green pulsating SVG
    ├── ScanningIndicatorControl
    └── LogViewerControl
```

## Running Z-Server

```bash
cd z-server
npm install
npm start
```

Or from repository root:
```bash
npm run z-server
```

## Known Issues

### 1. Green SVG Indicator Not Displaying

**Symptom**: When a server is running, the large green pulsating indicator does not appear.

**Cause**: CSS for `.zs-server-url` and related classes is defined in `buildZServerStyles()` function inside `zServerControlsFactory.js` (lines 2469-2695) but this CSS is NOT included in `styles.css`.

**Solution**: Copy the CSS from `buildZServerStyles()` to `styles.css`.

**Affected CSS classes**:
- `.zs-server-url` - Main container
- `.zs-server-url__icon` - SVG container
- `.zs-server-url__svg` - SVG element
- `.zs-server-url__outer-ring` - Outer pulsating ring
- `.zs-server-url__middle-ring` - Middle glow ring
- `.zs-server-url__inner-circle` - Inner white/green circle
- `.zs-server-url__check` - Checkmark
- `.zs-server-url__ray` - Radiating lines
- `.zs-server-url__wrapper` - Text wrapper
- `.zs-server-url__label` - "SERVER RUNNING" label
- `.zs-server-url__text` - URL text
- `.zs-server-url__open-btn` - Open button

**Required animations**:
- `@keyframes zs-border-glow` - Border glow animation
- `@keyframes zs-outer-ring-pulse` - Outer ring pulse
- `@keyframes zs-middle-ring-pulse` - Middle ring pulse
- `@keyframes zs-inner-breathe` - Inner circle breathing
- `@keyframes zs-ray-pulse` - Ray pulse

## Design Theme

**Industrial Luxury Obsidian** with:
- Dark obsidian base (`#050508`, `#0a0d14`, `#141824`)
- Gold accents (`#c9a227`, `#fffacd`)
- Gemstone accents (Emerald, Ruby, Sapphire, Amethyst)
- Glassmorphic effects
- Georgia display font + Inter body font + JetBrains Mono code font

## Dependencies

- `electron`: Desktop app framework
- `jsgui3-client`: UI component library
- `ps-list`: Process listing
- `tree-kill`: Process termination
- `esbuild`: JavaScript bundler
