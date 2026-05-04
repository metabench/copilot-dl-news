# Dashboard Stress Test Lab

Tests UI performance under rapid update conditions using anti-jitter patterns.

## Quick Start

```bash
node labs/dashboard-stress-test/server.js
# Opens http://localhost:3105
```

## Test Modes

| Mode | Items | Updates/sec | Purpose |
|------|-------|-------------|---------|
| 🎯 Single | 1 | 60 | Verify 60fps animation |
| 📦 Many Items | 50 | 500 (10 each) | Test batch updates |
| 📋 Large List | 1000 | 100 (random) | Test virtual scrolling |

## Anti-Jitter Patterns Demonstrated

### 1. CSS Containment

```css
.mini-card {
  contain: layout style;  /* Isolates reflow calculations */
}
```

### 2. GPU-Accelerated Transforms

```css
.progress-fill {
  transform: scaleX(0.5);  /* Uses GPU, not width */
  will-change: transform;
  transition: transform 0.15s ease-out;
}
```

### 3. Tabular Numerics

```css
.metric-value {
  font-variant-numeric: tabular-nums;  /* Fixed digit widths */
}
```

### 4. RAF Batching

```javascript
_scheduleUpdate() {
  if (this._pendingFrame) return;  // Already scheduled
  this._pendingFrame = requestAnimationFrame(() => {
    this._pendingFrame = null;
    this._syncView();  // Single DOM update per frame
  });
}
```

### 5. Virtual Scrolling

For large lists (1000+ items), only render visible items:

```javascript
const itemHeight = 40;
const startIdx = Math.floor(scrollTop / itemHeight);
const endIdx = Math.min(startIdx + viewport, items.length);
// Only render items[startIdx..endIdx]
```

## Metrics Displayed

- **Updates** — Total SSE messages received
- **Updates/sec** — Current throughput
- **FPS** — Frame rate (should stay at 60)
- **Elapsed** — Test duration

## Expected Results

| Test | Expected FPS | Notes |
|------|-------------|-------|
| Single | 60 | Smooth progress animation |
| Many Items | 55-60 | Slight dip acceptable at 500/sec |
| Large List | 60 | Virtual scrolling keeps it smooth |

## Integration with Dashboard Controls

This lab uses the extracted `src/ui/controls/dashboard/` controls:

```javascript
const { createDashboardControls, STYLES } = require('../../src/ui/controls/dashboard');
const { ProgressBar, ProgressCard, StatsGrid, StatusBadge } = createDashboardControls(jsgui);
```

## Profiling

Open Chrome DevTools → Performance tab → Record while running tests:

1. Look for **Layout** events (should be minimal)
2. Check **Scripting** time per frame
3. Verify no **Long Tasks** (>50ms)

## Files

- `server.js` — Express server with SSE flood tests
- `public/` — Static assets (empty, all inline for simplicity)
