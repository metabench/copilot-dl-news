# Debugging Child Process Issues in News Crawler

**Status**: COMPLETE  
**Last Updated**: October 10, 2025  
**When to Read**: You're debugging child process hangs, missing output, or SSE issues with crawlers

## Overview

The UI server spawns crawlers as **child processes**. Understanding how output is captured and displayed is critical for debugging.

## How Child Process Output Works

### Architecture

```
Browser Client
    ↓ HTTP POST /api/crawl
UI Server (Express)
    ↓ spawn('node', ['crawl.js', ...args])
Child Process (Crawler)
    ↓ stdout/stderr
JobEventHandlerService
    ↓ Parse & Broadcast
SSE Stream → Browser
```

### Output Handling

**File**: `src/ui/express/services/core/JobEventHandlerService.js`

The `JobEventHandlerService` attaches to child process stdout/stderr and handles two types of output:

1. **Structured Output** (Parsed & Broadcast):
   - `PROGRESS {...}` → Progress updates
   - `MILESTONE {...}` → Milestone events
   - `TELEMETRY {...}` → Telemetry events
   - `QUEUE {...}` → Queue events
   - `PROBLEM {...}` → Problem reports
   - `ERROR {...}` → Error events

2. **Regular Output** (Logged as-is):
   - Everything else goes through SSE as log events
   - Visible in browser console if logs are enabled
   - Some patterns logged to server console with `[child:stdout]` prefix

## Debugging Techniques

### ✅ Method 1: Use MILESTONE Events (PREFERRED)

**Why**: MILESTONE events are structured, parsed by the server, and guaranteed to be visible in the browser.

**How**:
```javascript
// In crawler code (child process)
this.telemetry.milestoneOnce('debug:my-checkpoint', {
  kind: 'debug',
  message: 'Reached checkpoint X',
  details: { additionalInfo: 'value' }
});
```

**View**: Browser console or SSE event stream

### ✅ Method 2: Use process.stderr.write()

**Why**: stderr output is captured and sent through SSE as log events.

**How**:
```javascript
// In crawler code (child process)
process.stderr.write('[MyModule] Starting operation X...\n');
```

**View**: Browser console (if logs enabled) or server terminal

### ❌ Method 3: console.log() (NOT RECOMMENDED)

**Why**: console.log goes to stdout, which is buffered and may not appear until the process completes or buffer flushes.

### ✅ Method 4: Direct Test Script

**Why**: Run crawler directly in same process to see all console output immediately.

**How**:
```javascript
// test-my-feature.js
const NewsCrawler = require('./src/crawl');
const crawler = new NewsCrawler('https://example.com', {
  dbPath: '/path/to/temp.db',
  crawlType: 'geography',
  // ...options
});

crawler.crawlConcurrent({ maxPages: 1 })
  .then(() => console.log('Success'))
  .catch(err => console.error('Failed:', err));
```

**Run**: `node test-my-feature.js`

**View**: Terminal output directly

## Example: Geography Crawl Hang Diagnosis

### Problem

Geography crawl starts but never emits telemetry → appears to hang.

### Solution Applied

1. **Added MILESTONE events** around suspected blocking operations:
   ```javascript
   // Before pipeline configuration
   this.telemetry.milestoneOnce('gazetteer:configuring-pipeline', {...});
   
   // After pipeline configuration
   this.telemetry.milestoneOnce('gazetteer:pipeline-configured', {...});
   
   // Before controller initialization
   this.telemetry.milestoneOnce('gazetteer:initializing-controller', {...});
   ```

2. **Added stderr diagnostics** in constructor-level operations:
   ```javascript
   process.stderr.write('[WikidataCountryIngestor] Constructor starting...\n');
   process.stderr.write('[WikidataCountryIngestor] Creating prepared statements...\n');
   process.stderr.write('[WikidataCountryIngestor] Constructor complete\n');
   ```

3. **Added timeout protection**:
   ```javascript
   await Promise.race([
     prepareGazetteer(),
     new Promise((_, reject) => 
       setTimeout(() => reject(new Error('Timeout after 30s')), 30000)
     )
   ]);
   ```

### How to Verify

1. Start server: `npm run gui`
2. Open browser: http://localhost:41001
3. Open browser DevTools → Console tab
4. Select "Geography" crawl type
5. Click "Start Crawl"
6. Watch console for:
   - `gazetteer:configuring-pipeline` milestone
   - `gazetteer:pipeline-configured` milestone
   - `gazetteer:initializing-controller` milestone
   - `gazetteer-mode:init-complete` milestone
   - stderr diagnostic messages

### Expected Flow

```
MILESTONE: gazetteer:configuring-pipeline
  [WikidataCountryIngestor] Constructor starting...
  [createIngestionStatements] Starting to create prepared statements...
  [createIngestionStatements] Attribute statements created
  [createIngestionStatements] All statements created successfully
  [WikidataCountryIngestor] Creating prepared statements...
  [WikidataCountryIngestor] Constructor complete
  [OsmBoundaryIngestor] Constructor starting...
  [OsmBoundaryIngestor] Creating boundary statements...
  [OsmBoundaryIngestor] Statements created
  [OsmBoundaryIngestor] Constructor complete
MILESTONE: gazetteer:pipeline-configured
MILESTONE: gazetteer:initializing-controller
  [GazetteerModeController] initialize() starting...
MILESTONE: gazetteer-mode:init-complete
```

If output stops at any point, that's where the hang occurs.

## Common Issues

### Issue: No output at all

**Cause**: Child process failed to start or crashed immediately.

**Fix**: Check server terminal for spawn errors.

### Issue: Output stops mid-sequence

**Cause**: Synchronous blocking operation (DB prepare, file I/O).

**Fix**: 
1. Add stderr diagnostics before/after suspected operation
2. Add timeout protection with Promise.race()
3. Consider making operation async

### Issue: "Cannot see my console.log statements"

**Cause**: stdout is buffered by Node.js and may not flush immediately.

**Fix**: Use `process.stderr.write()` or MILESTONE events instead.

### Issue: "Timeout triggers but operation still hangs"

**Cause**: Promise.race() only rejects the Promise, doesn't kill blocking synchronous code.

**Fix**: Identify the blocking operation and make it async or move to worker thread.

## Viewing SSE Logs

### Method 1: Browser Console

MILESTONE events appear automatically in console if telemetry is enabled.

### Method 2: Network Tab

1. Open DevTools → Network tab
2. Filter: "events" or "/events"
3. Click on the SSE connection
4. View "EventStream" or "Messages" tab
5. See all events including raw log messages

### Method 3: Direct SSE Endpoint

Open in browser: `http://localhost:41001/events?logs=1`

This enables verbose logging and shows all child process output.

## Files Modified (October 2025)

### Core Logic
- `src/crawl.js` - Added MILESTONE events in `_runGazetteerMode()`
- `src/crawler/gazetteer/GazetteerModeController.js` - Enhanced init telemetry

### Ingestors
- `src/crawler/gazetteer/ingestors/WikidataCountryIngestor.js` - Added stderr diagnostics
- `src/crawler/gazetteer/ingestors/OsmBoundaryIngestor.js` - Added stderr diagnostics
- `src/db/sqlite/queries/gazetteer.ingest.js` - Added stderr diagnostics

### Documentation
- `AGENTS.md` - Updated "Debugging Child Process Issues" section
- `DEBUGGING_CHILD_PROCESSES.md` - This comprehensive guide

## Summary

**Key Principles**:
1. Use structured output (MILESTONE, TELEMETRY) for critical checkpoints
2. Use process.stderr.write() for detailed diagnostics
3. Add timeout protection for async operations
4. Create direct test scripts for complex debugging
5. View SSE stream to see all child process output

**Tools Available**:
- Browser console (MILESTONE events)
- Network tab → EventStream (all output)
- `/events?logs=1` endpoint (verbose logging)
- Server terminal (some stdout patterns)
- Direct test scripts (immediate output)
