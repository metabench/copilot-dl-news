# Working Notes – Geo Import Dashboard Progress Bar Architecture

- 2025-12-21 — Session created via CLI.

---

## Investigation Summary

### Current State Assessment

#### What Exists (GeoImport System)

**Server-side (`geoImportServer.js`)**:
- ✅ SSE endpoint `/api/geo-import/events` for real-time updates
- ✅ REST API for start/pause/resume/cancel
- ✅ GeoImportStateManager wraps fnl observables
- ✅ Stage-based pipeline with emit events
- ✅ Database selector with stats

**State Manager (`GeoImportStateManager.js`)**:
- ✅ EventEmitter-based event dispatch
- ✅ Stage definitions with emoji/labels
- ✅ Progress tracking (current/total/percent)
- ✅ Stats tracking (processed/inserted/skipped/names/errors)
- ✅ Log buffering (max 200 entries)
- ⚠️ Pause/resume controls exist but `_controls` not properly wired to import observable

**Service Layer (`GeoImportService.js`)**:
- ✅ fnl observable-based import with progress events
- ✅ Line counting observable for total calculation
- ✅ Batch processing (default 1000 records)
- ✅ Emits progress with phase/current/total/percent/stats
- ✅ Staged pipeline wrapper with raiseStageEvent

**Dashboard Control (`GeoImportDashboard.js`)**:
- ✅ ProgressRing (SVG circular progress)
- ✅ StagesStepper (visual pipeline stages)
- ✅ LiveLog with filtering
- ✅ SourceCards for data sources
- ✅ Two-column layout with navigation
- ⚠️ No linear ProgressBar component used

**Client (`geoImport/index.js`)**:
- ✅ SSE connection with reconnection
- ✅ Real-time UI updates
- ✅ Stage timing tracking
- ✅ Speed calculation (records/sec)
- ✅ ETA estimation
- ✅ Toast notifications
- ⚠️ Metrics display created dynamically, not in SSR

### What Exists (General Progress Patterns)

**ProgressBarControl (`src/ui/controls/ProgressBar.js`)**:
- ✅ Reusable progress bar component
- ✅ Variants: standard, compact, striped
- ✅ Colors: emerald, gold, ruby, sapphire, amethyst
- ✅ Indeterminate mode support
- ✅ setValue/setLabel/setColor methods
- ✅ Animated transitions

**crawlDisplayAdapter (`src/ui/client/crawlDisplayAdapter.js`)**:
- ✅ Standardized interface for crawl state
- ✅ Event handling for all telemetry types
- ✅ Phase display configuration
- ✅ Progress normalization
- ✅ Duration/number formatting

**Lab Experiments**:
- `027-progressbar-sse-telemetry`: ProgressBar + SSE integration
- `028-jsgui3-server-sse-telemetry`: jsgui3-server with observable → SSE

**Telemetry System (`docs/TELEMETRY_AND_PROGRESS_COMPLETE.md`)**:
- ✅ Dual-level progress bars (main + sub-task)
- ✅ CrawlProgressIndicator component
- ✅ TelemetryDisplay for diagnostics
- ✅ Isomorphic rendering

---

## Gap Analysis

### What's Missing/Broken in GeoImport

1. **Pause/Resume Not Properly Wired**
   - `_controls` in GeoImportStateManager is never populated
   - The import$ observable returns control functions, but they're not captured

2. **No ProgressBar Component Used**
   - Dashboard uses ProgressRing (circular) only
   - No linear progress bar with percentage

3. **Metrics Created Dynamically on Client**
   - Speed/ETA/Elapsed metrics injected via DOM manipulation
   - Not in SSR output, not using jsgui3 patterns

4. **No Dual Progress Bar**
   - Single progress only (overall import)
   - Could show: overall + current batch/file

5. **No Stall/Stuck Detection**
   - No way to detect if import is stuck
   - No timeout or heartbeat monitoring

### Abstraction Opportunities

1. **ProgressObservableWrapper**: A reusable wrapper that:
   - Takes any fnl observable that emits progress
   - Normalizes to `{current, total, percent, phase, message}`
   - Adds timing (elapsed, speed, ETA)
   - Emits standardized events

2. **DualProgressControl**: A jsgui3 control that:
   - Shows primary + secondary progress bars
   - Handles indeterminate → determinate transitions
   - Displays speed/ETA/elapsed metrics

3. **ProgressTelemetryBridge**: Connects server observables to SSE:
   - Batches rapid updates (configurable interval)
   - Adds heartbeat for stall detection
   - Supports multiple concurrent progress streams

---

## Recommended Architecture

### Layer 1: Observable Progress Normalizer

```javascript
// src/services/ProgressObservableWrapper.js
function wrapProgressObservable(observable$, options = {}) {
  const { 
    batchIntervalMs = 100,
    staleThresholdMs = 5000 
  } = options;
  
  return observable((next, complete, error) => {
    let startTime = Date.now();
    let lastUpdate = startTime;
    let history = [];
    
    observable$.on('next', (raw) => {
      const now = Date.now();
      const normalized = {
        current: raw.current ?? raw.processed ?? 0,
        total: raw.total ?? null,
        percent: raw.percent ?? (raw.total ? (raw.current / raw.total * 100) : null),
        phase: raw.phase ?? raw.status ?? 'processing',
        message: raw.message ?? null,
        
        // Computed
        elapsed: now - startTime,
        speed: computeSpeed(history, raw.current, now),
        eta: computeEta(history, raw.current, raw.total, now),
        
        // Pass-through
        stats: raw.stats ?? {},
        _raw: raw
      };
      
      history.push({ current: normalized.current, time: now });
      if (history.length > 10) history.shift();
      lastUpdate = now;
      
      next(normalized);
    });
    
    observable$.on('complete', complete);
    observable$.on('error', error);
    
    // Stale detection heartbeat
    const heartbeat = setInterval(() => {
      if (Date.now() - lastUpdate > staleThresholdMs) {
        next({ _heartbeat: true, stale: true, lastUpdate });
      }
    }, staleThresholdMs / 2);
    
    return () => {
      clearInterval(heartbeat);
    };
  });
}
```

### Layer 2: SSE Progress Emitter

```javascript
// src/services/SseProgressEmitter.js
class SseProgressEmitter {
  constructor(options = {}) {
    this.batchIntervalMs = options.batchIntervalMs || 50;
    this.clients = new Set();
    this._pending = null;
    this._batchTimeout = null;
  }
  
  emit(eventType, data) {
    this._pending = { type: eventType, data, timestamp: Date.now() };
    if (!this._batchTimeout) {
      this._batchTimeout = setTimeout(() => this._flush(), this.batchIntervalMs);
    }
  }
  
  _flush() {
    if (this._pending) {
      const line = `event: ${this._pending.type}\ndata: ${JSON.stringify(this._pending.data)}\n\n`;
      for (const client of this.clients) {
        try { client.write(line); } catch {}
      }
      this._pending = null;
    }
    this._batchTimeout = null;
  }
}
```

### Layer 3: Dual Progress Control (jsgui3)

```javascript
// src/ui/controls/DualProgressControl.js
class DualProgressControl extends Control {
  constructor(spec = {}) {
    // Primary progress bar
    this._primary = new ProgressBarControl({ ... });
    
    // Secondary progress bar (optional, for sub-tasks)
    this._secondary = new ProgressBarControl({ variant: 'compact', ... });
    
    // Metrics display
    this._metrics = new MetricsRow({ ... });
  }
  
  updatePrimary(progress) {
    this._primary.setValue(progress.percent / 100);
    this._primary.setLabel(`${progress.current} / ${progress.total}`);
    this._updateMetrics(progress);
  }
  
  updateSecondary(progress) {
    this._secondary.setValue(progress.percent / 100);
  }
}
```

---

## Implementation Priority

### Phase 1: Fix Existing Issues (Low Effort, High Value)
1. Wire pause/resume controls properly in GeoImportStateManager
2. Add stall detection with heartbeat
3. Make import cancellable and resumable

### Phase 2: Add ProgressBar to Dashboard (Medium Effort)
1. Add linear ProgressBarControl to pipeline view
2. Show speed/ETA/elapsed in SSR output
3. Use data attributes for client-side updates

### Phase 3: Abstract Observable Wrapper (Medium Effort)
1. Create ProgressObservableWrapper
2. Refactor GeoImportService to use it
3. Apply to other long-running operations

### Phase 4: Dual Progress Bars (Future)
1. Create DualProgressControl
2. Show: overall import + current batch
3. Apply to geo import and other imports

---

## Related Patterns Discovered

1. **Lab 027/028**: Already demonstrate ProgressBar + SSE + observable pattern
2. **crawlDisplayAdapter**: Excellent model for state normalization
3. **TelemetryIntegration**: From deprecated-ui, shows batched SSE emission
4. **ProgressRing**: Good for summary view, but linear bar better for detailed view

## Files to Modify

- `src/services/GeoImportStateManager.js` - Fix controls wiring
- `src/ui/controls/GeoImportDashboard.js` - Add ProgressBarControl
- `src/ui/client/geoImport/index.js` - Wire progress bar updates
- (New) `src/services/ProgressObservableWrapper.js` - Reusable abstraction
