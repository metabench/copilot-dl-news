# jsgui3 SSR + Client Activation Progress Lab

## Purpose

Investigate using jsgui3 server-side rendering with client-side activation to create reusable progress display components with a minimal, flexible API.

## Goals

1. **Minimal API** - Simple interface for wrapping any async process with progress
2. **SSR + Activation** - Server renders initial HTML, client activates and binds events
3. **Flexible Progress Source** - Works with observables, callbacks, or polling
4. **Encapsulated** - Self-contained controls that can be dropped into any jsgui3 app

## Quick Start

```bash
# Run the demo server
node labs/jsgui3-ssr-progress/server.js

# Open in browser
# http://localhost:3101
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser                                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  ProgressWrapperControl (activated)                   │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  ProgressBarControl                             │  │  │
│  │  │  - Renders progress bar                         │  │  │
│  │  │  - Updates via setProgress(n, total)            │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  Content Slot (hidden until complete)           │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                         ▲                                    │
│                         │ SSE / Polling / Callback           │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│  Server (Express)       │                                    │
│  ┌──────────────────────┴────────────────────────────────┐  │
│  │  SSR: ProgressWrapperControl.all_html_render()        │  │
│  │  SSE: /sse/progress (real-time updates)               │  │
│  │  API: /api/progress (polling fallback)                │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## API Design

### Server-Side Usage

```javascript
const { ProgressWrapperControl } = require('./controls');

// Create a progress wrapper that encapsulates any async operation
const wrapper = new ProgressWrapperControl({
  context,
  title: 'Processing Records',
  description: 'Analyzing content...',
  progressSource: '/sse/analysis-progress',  // SSE endpoint
  pollFallback: '/api/analysis/state',       // Polling endpoint (optional)
  showEta: true,
  showThroughput: true
});

const html = wrapper.all_html_render();
```

### Client-Side Activation

```javascript
// Client automatically activates controls and connects to progress source
const wrapper = new ProgressWrapperControl({ context, el: existingEl });
wrapper.activate();

// Progress updates flow through automatically
wrapper.on('complete', (result) => {
  console.log('Done!', result);
});
```

### Minimal API (Direct Use)

```javascript
// Wrap any async function with progress
const result = await withProgress({
  title: 'Downloading',
  task: async (onProgress) => {
    for (let i = 0; i < 100; i++) {
      await doWork();
      onProgress(i + 1, 100);
    }
    return 'done';
  }
});
```

## Files

| File | Purpose |
|------|---------|
| `server.js` | Express server with SSE and SSR |
| `controls/ProgressBarControl.js` | Standalone progress bar control |
| `controls/ProgressWrapperControl.js` | Full-featured progress wrapper |
| `controls/index.js` | Control exports |
| `client/index.js` | Client-side bundle entry |
| `public/` | Static assets |

## Control Features

### ProgressBarControl

- Minimal progress bar with percentage
- Server-renders initial state
- Client-side `setProgress(current, total)` updates

### ProgressWrapperControl

- Wraps ProgressBarControl with additional UI
- Title, description, ETA, throughput
- Auto-connects to SSE or polls API
- Emits events: `progress`, `complete`, `error`
- Optional content slot (revealed on completion)

## Key Patterns Demonstrated

### 1. Conditional Compose

```javascript
constructor(spec) {
  super(spec);
  this.data = spec.data;
  // Only compose if not activating existing DOM
  if (!spec.el) this.compose();
}
```

### 2. Data Attributes for Activation

```javascript
compose() {
  this.dom.attributes['data-jsgui-control'] = 'progress-wrapper';
  this.dom.attributes['data-progress-source'] = this.progressSource;
}
```

### 3. Client Activation Flow

```javascript
activate() {
  if (this.__active) return;
  this.__active = true;
  
  const el = this.dom?.el;
  const source = el.getAttribute('data-progress-source');
  this._connectToSource(source);
}
```

### 4. SSE with Polling Fallback

```javascript
_connectToSource(source) {
  this._eventSource = new EventSource(source);
  this._eventSource.onerror = () => {
    this._startPolling();
  };
}
```

## Testing

```bash
# Run the demo with simulated progress
node labs/jsgui3-ssr-progress/server.js --demo

# Check control renders correctly
node labs/jsgui3-ssr-progress/checks/progress-bar.check.js
```
