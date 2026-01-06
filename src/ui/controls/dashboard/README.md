# Dashboard Controls

Reusable jsgui3 controls for building progress dashboards with anti-jitter patterns.

## Installation

```javascript
const { createDashboardControls, STYLES } = require('./src/ui/controls/dashboard');
```

## Usage

### Server-Side Rendering (SSR)

```javascript
const jsgui = require('jsgui3-html');
const { createDashboardControls, STYLES } = require('./src/ui/controls/dashboard');

const { ProgressBar, ProgressCard, StatsGrid, StatusBadge } = createDashboardControls(jsgui);

// Create controls
const progressBar = new ProgressBar({ size: 'medium', variant: 'crawl' });
const statusBadge = new StatusBadge({ status: 'running', fixedWidth: true });
const statsGrid = new StatsGrid();

statsGrid.addStat({ id: 'pages', label: 'Pages', value: 0 });
statsGrid.addStat({ id: 'errors', label: 'Errors', value: 0, unit: '' });

// Render HTML
const html = `
<!DOCTYPE html>
<html>
<head>
  <style>${STYLES}</style>
</head>
<body>
  ${progressBar.all_html_process()}
  ${statusBadge.all_html_process()}
  ${statsGrid.all_html_process()}
</body>
</html>
`;
```

### Client-Side Activation

```javascript
// After SSR HTML is in DOM, activate controls
const jsgui = require('jsgui3-html');
const { createDashboardControls } = require('./src/ui/controls/dashboard');
const { ProgressBar, ProgressCard, StatsGrid, StatusBadge } = createDashboardControls(jsgui);

// Activate from existing DOM element
const activatedBar = ProgressBar.activate({ el: document.getElementById('my-progress-bar') });

// Now you can update it
activatedBar.setProgress(75, 100);
```

### With SSE Updates

```javascript
const { SSEHelper } = require('./src/ui/controls/dashboard');

const sse = new SSEHelper('/api/events');
sse.onMessage('progress', (data) => {
  progressBar.setProgress(data.current, data.total);
  statsGrid.updateStats({ pages: data.pages, errors: data.errors });
});
sse.connect();
```

## Controls

### ProgressBar

GPU-accelerated progress bar with no layout jitter.

```javascript
const bar = new ProgressBar({
  size: 'small' | 'medium' | 'large',  // Default: 'medium'
  variant: 'default' | 'success' | 'warning' | 'error' | 'crawl' | 'analysis'
});

bar.setProgress(current, total);  // 0-100% calculated automatically
bar.setVariant('success');
```

**Anti-Jitter Features:**
- Uses `transform: scaleX()` instead of `width` (GPU-accelerated)
- `contain: layout style` isolates reflow
- RAF batching coalesces rapid updates

### StatusBadge

Animated status indicator with fixed-width option.

```javascript
const badge = new StatusBadge({
  status: 'idle' | 'starting' | 'running' | 'complete' | 'success' | 'error' | 'warning',
  fixedWidth: true  // Prevents layout shift on status change
});

badge.setStatus('running');  // Triggers pulse animation
badge.setStatus('complete');
```

**Anti-Jitter Features:**
- Fixed width option prevents layout shift
- Smooth color transitions
- Pulse animation doesn't affect layout

### StatsGrid

Responsive grid of stat items with tabular numerics.

```javascript
const grid = new StatsGrid({
  columns: 4  // Default: 4 (responsive: 4 → 2 → 1)
});

// Add stats
grid.addStat({ id: 'pages', label: 'Pages', value: 0 });
grid.addStat({ id: 'bytes', label: 'Size', value: 0, unit: 'KB' });

// Update single stat
grid.updateStat('pages', 42);

// Batch update (more efficient)
grid.updateStats({ pages: 42, bytes: 1024 });
```

**Anti-Jitter Features:**
- `font-variant-numeric: tabular-nums` keeps digit widths stable
- RAF batching for batch updates
- Fixed row heights

### ProgressCard

Complete card combining StatusBadge + ProgressBar + StatsGrid.

```javascript
const card = new ProgressCard(
  { title: 'Crawl Progress', variant: 'crawl' },
  { ProgressBar, StatusBadge, StatsGrid }  // Dependencies
);

// Set all state at once
card.setState({
  status: 'running',
  current: 50,
  total: 100,
  message: 'Crawling pages...',
  warning: null,
  stats: { pages: 50, errors: 2, pending: 50 }
});

// Or individual updates
card.setProgress(75, 100);
card.setStatus('complete');
card.setMessage('Done!');
card.setWarning('3 pages had warnings');
```

### SSEHelper

Browser-side SSE connection with auto-reconnect.

```javascript
const sse = new SSEHelper('/api/events', {
  reconnectDelay: 1000,
  maxReconnectDelay: 30000
});

sse.onConnect(() => console.log('Connected'));
sse.onDisconnect(() => console.log('Disconnected'));
sse.onMessage('progress', (data) => { /* handle */ });
sse.onMessage('error', (data) => { /* handle */ });

sse.connect();
// Later: sse.disconnect();
```

## Styling

### Include Styles

```javascript
const { STYLES } = require('./src/ui/controls/dashboard');

// In HTML
<style>${STYLES}</style>
```

### Theme Customization

Override CSS custom properties:

```css
:root {
  /* ProgressBar */
  --dprogress-bg: #1a1a2e;
  --dprogress-fill: #4ecdc4;
  --dprogress-success: #28a745;
  --dprogress-warning: #ffc107;
  --dprogress-error: #dc3545;
  
  /* StatusBadge */
  --dstatus-idle: #6c757d;
  --dstatus-running: #17a2b8;
  --dstatus-success: #28a745;
  --dstatus-error: #dc3545;
  
  /* ProgressCard */
  --dcard-bg: #16213e;
  --dcard-border: #0f3460;
  --dcard-text: #e4e4e4;
}
```

## Anti-Jitter Patterns

All controls implement these performance patterns:

| Pattern | Implementation | Purpose |
|---------|---------------|---------|
| CSS Containment | `contain: layout style` | Isolate reflow calculations |
| GPU Animation | `transform: scaleX()` | Animate without layout |
| Tabular Numerics | `font-variant-numeric: tabular-nums` | Stable digit widths |
| RAF Batching | `requestAnimationFrame` | One DOM update per frame |
| Fixed Dimensions | `height`, `min-height` | Prevent content-based sizing |

## Testing

Run the stress test lab to verify performance:

```bash
node labs/dashboard-stress-test/server.js
# Open http://localhost:3105
```

## Factory Pattern

All controls use the factory pattern for jsgui3 compatibility:

```javascript
function createProgressBar(jsgui) {
  const { Control } = jsgui;
  
  class ProgressBar extends Control {
    // ...
  }
  
  return ProgressBar;
}
```

This allows:
- **SSR**: Bind to server-side jsgui instance
- **Client**: Bind to browser jsgui instance
- **Testing**: Mock jsgui for unit tests
