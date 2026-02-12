# Z-Server Manager

An **Industrial Luxury Obsidian** style Electron application for managing the repository's server entry points. It discovers, launches, monitors, and stops Node.js servers found across the project.

## Features

- **Server Detection**: Automatically scans the repository for server entry points using `tools/dev/js-server-scan.js`.
- **Scan Visibility Filters**: Toggle which server categories to scan (UI, labs, API, tools, tests, checks). Persisted to `localStorage`.
- **Process Management**: Start, stop, and restart servers. Supports detached mode so servers survive z-server restarts.
- **Detached Server Registry**: Persists PIDs/ports to `data/detached-servers.json` for cross-session process ownership.
- **Live Logs**: View realtime stdout/stderr with JSONL telemetry formatting and streaming.
- **URL Detection**: Automatically detects listening ports and displays clickable URLs.
- **EADDRINUSE Handling**: Detects port conflicts and suggests the existing server URL.
- **UI Client Build**: Can auto-rebuild jsgui3-client bundles when starting UI servers.
- **Browser Integration**: Opens server URLs in Chrome Canary or system default browser.
- **Keyboard Shortcuts**: `Ctrl+Shift+I` toggles DevTools.
- **Theme**: Dark glassmorphic obsidian aesthetic with gold, emerald, ruby, and amethyst accents.

## Setup

1. Install dependencies:
   ```bash
   cd z-server
   npm install
   ```

2. Build the renderer bundle:
   ```bash
   npm run build
   ```

3. Start the app:
   ```bash
   npm start
   ```

## Testing

The project has three test tiers:

| Command | Description | Runner |
|---------|-------------|--------|
| `npm test` | All unit tests | Jest |
| `npm run test:unit` | Unit tests only (`tests/unit/`) | Jest |
| `npm run test:smoke` | Startup smoke test (`tests/smoke.test.js`) | Jest + electron-console-capture |
| `npm run test:e2e` | End-to-end tests (`tests/e2e/`) | Jest + Playwright + Electron |
| `npm run test:all` | Unit + E2E combined | Jest |

### Unit tests (65 tests, 10 suites)

Cover the core library modules:
- **serverDetector** — Server file detection, port extraction, metadata parsing (33 tests)
- **serverScanFilter** — Scan visibility filtering by category
- **scanServersObservable** — Observable-based server scanning with progress events
- **scanProgressProtocol** — IPC progress message protocol
- **scanningIndicatorControl** — jsgui3 scanning UI component
- **jsonlStreamParser** — JSONL chunk splitting and telemetry formatting
- **serverItemControl** — Server list item rendering and state management
- **zServerAppControl.scanProgress** — App-level scan progress integration
- **extractUrl** — URL extraction from server log output
- **ipcGuards** — Path validation, URL validation, PID verification

### E2E tests (Playwright + Electron)

Located in `tests/e2e/app.e2e.test.js`. These launch a real Electron instance with Playwright and test:
1. **Application Launch and Basic UI** — Window creation, title bar, renderer health
2. **Server Scanning** — Server list population after scan
3. **Server Selection** — Click-to-select interaction, control panel appearance
4. **Console Errors** — No unexpected console errors during operation

### Smoke tests

Located in `tests/smoke.test.js`. Uses `tools/dev/electron-console-capture.js` to verify Electron startup without fatal errors, scan completion, and absence of uncaught exceptions.

## Architecture

```
z-server/
├── main.js              # Electron main process — IPC handlers, process management
├── preload.js           # contextBridge — exposes electronAPI to renderer
├── renderer.src.js      # Renderer entry — jsgui3-client initialization
├── index.html           # Minimal shell with #app-root
├── ui/
│   ├── appCatalog.js    # Known server card definitions and matching
│   ├── controls/        # jsgui3-client UI controls
│   │   ├── zServerControlsFactory.js  # Main factory (builds all controls)
│   │   ├── zServerAppControl.js       # Root app control (orchestrates everything)
│   │   ├── sidebarControl.js          # Server list sidebar
│   │   ├── contentAreaControl.js      # Main content pane
│   │   ├── serverItemControl.js       # Individual server card
│   │   ├── serverListControl.js       # Server list container
│   │   ├── controlPanelControl.js     # Start/Stop/Restart buttons
│   │   ├── logControls.js             # Log entry + log viewer
│   │   ├── serverLogWindowControl.js  # Floating log window
│   │   ├── serverUrlControl.js        # Clickable URL display
│   │   ├── scanningIndicatorControl.js# Scan progress animation
│   │   ├── titleBarControl.js         # Custom title bar
│   │   └── controlButtonControl.js    # Themed buttons
│   ├── lib/
│   │   ├── extractUrl.js              # URL extraction from log text
│   │   └── telemetryJsonl.js          # JSONL stream parsing
│   └── assets/          # SVG icons for app cards and sidebar
├── lib/
│   ├── serverDetector.js              # Server file detection + metadata
│   ├── serverLogger.js                # Structured event logging
│   ├── serverScanFilter.js            # Category-based scan filtering
│   ├── scanServersObservable.js       # Observable scan with progress
│   ├── scanProgressProtocol.js        # IPC progress message format
│   ├── jsonlStreamParser.js           # JSONL chunk parser
│   └── ipcGuards.js                   # Security validations
└── tests/
    ├── unit/            # 10 test suites, 65 tests
    ├── e2e/             # Playwright + Electron tests
    └── smoke.test.js    # Startup smoke test
```

### IPC Protocol

The renderer communicates with the main process through `contextBridge` (defined in `preload.js`):

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `scan-servers` | Renderer → Main | Discover server files with visibility filters |
| `start-server` | Renderer → Main | Launch a server process (supports detached mode) |
| `stop-server` | Renderer → Main | Stop a server by file path and PID |
| `open-in-browser` | Renderer → Main | Open URL in Chrome Canary or default browser |
| `get-activity-logs` | Renderer → Main | Retrieve server logger history |
| `get-port-status` | Renderer → Main | Check if a port is in use |
| `ui-client-status` | Renderer → Main | Check jsgui3-client bundle freshness |
| `ui-client-rebuild` | Renderer → Main | Force rebuild of client bundle |
| `server-log` | Main → Renderer | Stream log lines for a server |
| `server-status-change` | Main → Renderer | Notify running/stopped state changes |
| `scan-progress` | Main → Renderer | Progress events during server scanning |

### Build System

The renderer is built with **esbuild** which bundles `renderer.src.js` (and its jsgui3-client dependency) into a single `renderer.js` IIFE for the browser:

```bash
npm run build
```

The build inserts a compatibility banner for `Tautologistics` (legacy HTML parser namespace used by jsgui3).
