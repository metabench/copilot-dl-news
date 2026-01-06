# Electron Tray Progress Lab

## Purpose

Create an encapsulated, reusable Electron tray icon component that displays background process progress in a popup window. Designed for long-running tasks like place disambiguation, analysis backfills, or crawls.

## Goals

1. **Minimized to Tray** - App runs as a tray icon when window is closed/minimized
2. **Rich Popup** - Clicking tray icon shows a popup with progress, stats, and controls
3. **Encapsulated** - Single `TrayProgressManager` class handles all tray logic
4. **Reusable** - Works with any observable/SSE progress source
5. **Documented** - Easy to replicate for other background processes

## Quick Start

```bash
# Run the demo
npx electron labs/electron-tray-progress/main.js

# Or with npm script (when added)
npm run lab:tray-progress
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    System Tray                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  🔄 Tray Icon (animated when running)                         │  │
│  │  - Left-click: Show/hide popup                                │  │
│  │  - Right-click: Context menu (Show, Pause, Stop, Quit)        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────┬─────────────────────┘
                                                │
┌───────────────────────────────────────────────▼─────────────────────┐
│                    Popup Window (frameless)                          │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Header: Process Name + Status Badge                          │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │  Progress Bar                                                  │  │
│  │  ████████████████████░░░░░░░░░░░ 67%                          │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │  Stats Grid:                                                   │  │
│  │  • Processed: 1,234 / 5,000                                   │  │
│  │  • Rate: 12.5 items/sec                                       │  │
│  │  • ETA: 5:23                                                  │  │
│  │  • Elapsed: 3:45                                              │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │  Current Item: https://example.com/...                        │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │  [Pause] [Stop] [Show Details]                                │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `TrayProgressManager.js` | **Core module** - Encapsulated tray + popup logic |
| `main.js` | Demo Electron app entry point |
| `popup.html` | Popup window HTML template |
| `popup.js` | Popup client-side logic |
| `icons/` | Tray icons (idle, running, complete, error) |
| `README.md` | This documentation |

## API

### TrayProgressManager

```javascript
const { TrayProgressManager } = require('./TrayProgressManager');

// Create manager
const trayManager = new TrayProgressManager({
  title: 'Place Disambiguation',
  iconSet: 'default',  // or path to custom icons
  popupSize: { width: 320, height: 280 }
});

// Initialize (call after app.whenReady())
await trayManager.init();

// Update progress
trayManager.updateProgress({
  phase: 'running',
  processed: 1234,
  total: 5000,
  recordsPerSecond: 12.5,
  etaMs: 323000,
  currentItem: 'Processing place: London, UK'
});

// Connect to SSE source
trayManager.connectToSSE('http://localhost:3099/sse/progress');

// Events
trayManager.on('pause', () => { /* pause work */ });
trayManager.on('stop', () => { /* stop work */ });
trayManager.on('showDetails', () => { /* open full window */ });

// Cleanup
trayManager.destroy();
```

### Progress State Object

```typescript
interface ProgressState {
  phase: 'idle' | 'running' | 'paused' | 'complete' | 'error';
  processed: number;
  total: number;
  updated?: number;
  recordsPerSecond?: number;
  bytesPerSecond?: number;
  elapsedMs?: number;
  etaMs?: number;
  currentItem?: string;
  warnings?: Array<{ type: string; message: string }>;
  error?: string;
}
```

## Icon States

| State | Icon | Tooltip |
|-------|------|---------|
| Idle | ⚪ | "Ready" |
| Running | 🔵 (animated) | "Processing: 67%" |
| Paused | 🟡 | "Paused: 67%" |
| Complete | 🟢 | "Complete: 5,000 items" |
| Error | 🔴 | "Error: {message}" |

## Integration Examples

### With Place Disambiguation

```javascript
const { TrayProgressManager } = require('./labs/electron-tray-progress/TrayProgressManager');

// In your Electron main process
const tray = new TrayProgressManager({
  title: 'Place Disambiguation',
  iconSet: 'places'  // Uses place-specific icons
});

await tray.init();

// Connect to the disambiguation SSE endpoint
tray.connectToSSE('http://localhost:3100/sse/disambiguation-progress');

// Handle controls
tray.on('pause', () => disambiguator.pause());
tray.on('stop', () => disambiguator.stop());
tray.on('showDetails', () => {
  // Open the full disambiguation dashboard
  mainWindow.show();
  mainWindow.loadURL('http://localhost:3100/dashboard');
});
```

### With Analysis Backfill

```javascript
const tray = new TrayProgressManager({
  title: 'Analysis Backfill'
});

await tray.init();
tray.connectToSSE('http://localhost:3099/sse/analysis-progress');
```

### Manual Progress Updates

```javascript
const tray = new TrayProgressManager({ title: 'Custom Process' });
await tray.init();

// Update manually from your process
for (let i = 0; i < total; i++) {
  await processItem(items[i]);
  tray.updateProgress({
    phase: 'running',
    processed: i + 1,
    total,
    currentItem: items[i].name
  });
}

tray.updateProgress({ phase: 'complete', processed: total, total });
```

## Popup Customization

### Custom Popup HTML

```javascript
const tray = new TrayProgressManager({
  title: 'My Process',
  popupHtml: path.join(__dirname, 'my-custom-popup.html')
});
```

### Popup Communication

The popup receives updates via IPC:

```javascript
// In popup.js
const { ipcRenderer } = require('electron');

ipcRenderer.on('progress-update', (event, state) => {
  updateUI(state);
});

// Send control commands back
document.getElementById('btn-pause').onclick = () => {
  ipcRenderer.send('tray-command', 'pause');
};
```

## Best Practices

1. **Always call `destroy()`** when the app exits to clean up tray icon
2. **Handle SSE reconnection** - TrayProgressManager auto-reconnects on error
3. **Provide fallback polling** - For environments where SSE is unreliable
4. **Use appropriate icons** - Create process-specific icon sets for clarity
5. **Keep popup lightweight** - Complex UI should be in the main window

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Escape | Hide popup |
| Space | Toggle pause/resume |
| Q | Quit (with confirmation if running) |

## Testing

```bash
# Run the demo with simulated progress
npx electron labs/electron-tray-progress/main.js --demo

# Smoke test (starts, shows tray, exits)
npx electron labs/electron-tray-progress/main.js --smoke
```
