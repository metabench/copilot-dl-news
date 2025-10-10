# Geography Crawl Progress Bar Implementation

**When to Read**: Read this when implementing progress tracking for geography crawls, understanding PROGRESS event structure, or debugging missing progress updates in UI. Documents progress event format and broadcasting patterns.

## Overview

Added proper progress reporting for geography crawls to display real-time progress as countries are processed.

## Problem

Geography crawl would complete successfully but the progress bar only showed the startup phase, not the actual country processing progress. The ingestor was already emitting progress events, but the UI wasn't displaying them.

## Solution

### Backend (Already Implemented)

The `WikidataCountryIngestor` already emits detailed progress:

```javascript
// Discovery phase
this._emitProgress(emitProgress, { 
  phase: 'discovery-complete', 
  message: `Discovered ${bindings.length} countries`,
  totalItems: bindings.length,
  current: 0
});

// Processing phase (every 10 countries)
this._emitProgress(emitProgress, {
  phase: 'processing',
  current: i + 1,
  totalItems: bindings.length,
  message: `Processing countries: ${i + 1}/${bindings.length}`
});
```

This flows through:
1. `GazetteerIngestionCoordinator` → wraps progress with ingestor info
2. `GazetteerModeController` → adds to telemetry.progress with `gazetteer` patch
3. `JobEventHandlerService` → broadcasts via SSE
4. Browser receives progress event with `payload.gazetteer.payload` containing the details

### Frontend (Newly Added)

Modified `src/ui/public/index/sseHandlers.js` to handle gazetteer-specific progress:

```javascript
// Handle gazetteer-specific progress
if (payload.gazetteer && progress) {
  const gaz = payload.gazetteer;
  const p = gaz.payload;
  
  if (p.phase === 'processing' && is_defined(p.current) && is_defined(p.totalItems)) {
    const percent = Math.round((p.current / p.totalItems) * 100);
    progressText = `Processing: ${p.current}/${p.totalItems} (${percent}%) ${p.message || ''}`;
  } else if (p.phase === 'discovery-complete' && is_defined(p.totalItems)) {
    progressText = `Discovered ${p.totalItems} countries, starting processing...`;
  } else if (p.phase === 'ingestor-start') {
    progressText = `Starting ${p.ingestor || 'ingestor'}...`;
  } else if (p.phase === 'ingestor-complete') {
    progressText = `Completed ${p.ingestor || 'ingestor'} (${p.durationMs}ms)`;
  }
  
  progress.textContent = progressText;
}
```

## Expected User Experience

When geography crawl runs, user will see:

1. **Startup Phase**: "Preparing data directory..."
2. **Discovery**: "Discovered 195 countries, starting processing..."
3. **Processing Progress** (updates every 10 countries):
   - "Processing: 10/195 (5%) Processing countries: 10/195"
   - "Processing: 20/195 (10%) Processing countries: 20/195"
   - "Processing: 30/195 (15%) Processing countries: 30/195"
   - ... continues to 100%
4. **Completion**: "Completed wikidata-countries (45000ms)"

## Progress Data Flow

```
WikidataCountryIngestor.execute()
  ↓ emitProgress({ phase: 'processing', current: 10, totalItems: 195 })
GazetteerIngestionCoordinator
  ↓ wraps with ingestor info
GazetteerModeController._handleIngestionProgress()
  ↓ telemetry.progress({ patch: { gazetteer: { payload: {...} } } })
CrawlerTelemetry → CrawlerEvents
  ↓ events.emit('progress', ...)
JobEventHandlerService
  ↓ broadcastProgress(payload with gazetteer patch)
SSE Stream → Browser
  ↓ 'progress' event
sseHandlers.handleProgress()
  ↓ checks payload.gazetteer
DOM Update
  ↓ progress.textContent = "Processing: 10/195 (5%)..."
```

## Files Modified

1. **src/ui/public/index/sseHandlers.js**
   - Added gazetteer progress detection and formatting
   - Handles phases: discovery-complete, processing, ingestor-start, ingestor-complete
   - Displays current/total counts and percentage

2. **scripts/build-ui.js** (run to rebuild)
   - Bundled updated sseHandlers into production assets

## Testing

### Manual Test

1. Start server: `npm run gui`
2. Navigate to http://localhost:41001
3. Select "Geography" crawl type
4. Click "Start Crawl"
5. Watch progress bar - should show:
   - "Discovered N countries..." after SPARQL query
   - "Processing: X/N (P%)..." with live updates every ~1 second
   - Final completion message

### Verify Progress Events

Open browser DevTools → Console, you should see milestone events:
- `gazetteer:configuring-pipeline`
- `gazetteer:pipeline-configured`
- `gazetteer:initializing-controller`
- `gazetteer-mode:init-complete`
- `gazetteer-mode:start`
- Progress updates (throttled to 200ms)
- `gazetteer-mode:completed`

## Future Enhancements

### Multi-Stage Progress

Geography crawl has multiple stages:
1. Wikidata countries (195 items)
2. Wikidata ADM1 regions (~5000 items)
3. OSM boundaries (~5000 items)

Could enhance to show:
- Overall progress across all stages
- Per-stage progress with names
- Estimated time remaining

### Progress Bar Visual

Currently text-only. Could add:
- Visual progress bar with percentage fill
- Stage indicators
- Speed/rate display (items per second)

### Example Enhanced Display

```
Geography Crawl Progress
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 35%

Stage 1 of 3: Wikidata Countries
✓ Completed: 195/195 countries (100%)

Stage 2 of 3: Wikidata ADM1 Regions
⟳ Processing: 1750/5000 regions (35%)
  Rate: 45 items/sec
  Estimated: 1m 12s remaining

Stage 3 of 3: OSM Boundaries
⋯ Pending
```

## Related Documentation

- `DEBUGGING_CHILD_PROCESSES.md` - How to debug crawler progress issues
- `AGENTS.md` - "Debugging Child Process Issues" section
- `docs/GEOGRAPHY_CRAWL_TYPE.md` - Geography crawl architecture

## Summary

Geography crawl now provides detailed real-time progress information showing exactly which country is being processed out of the total count, with percentage completion. This gives users visibility into the crawl process and confirms it's working properly.
