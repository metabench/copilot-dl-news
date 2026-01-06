# Chapter 9: The Analysis Observable

> **Implementation Status**: ✅ Fully implemented as a lab prototype with Electron app.

## Codebase Quick Reference

| Component | File Location | Status |
|-----------|---------------|--------|
| Observable wrapper | `labs/analysis-observable/analysis-observable.js` | ✅ 420 lines |
| Lab runner | `labs/analysis-observable/run-lab.js` | ✅ Complete |
| Batch runner | `labs/analysis-observable/run-all.js` | ✅ Complete |
| SSE server | `labs/analysis-observable/server.js` | ✅ Express SSE |
| Electron main | `labs/analysis-observable/electron/main.js` | ✅ Complete |
| Electron preload | `labs/analysis-observable/electron/preload.js` | ✅ IPC bridge |
| HTML UI | `labs/analysis-observable/public/index.html` | ✅ Complete |

## What Is It?

The Analysis Observable (`labs/analysis-observable/`) wraps the core analysis pipeline with:

- **Progress streaming** via Server-Sent Events (SSE)
- **Timing breakdown** for bottleneck detection
- **Electron UI** for visual monitoring
- **Graceful stop** support

It transforms a batch process into a visible, controllable operation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ENTRY POINTS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────────┐    │
│  │  run-lab.js    │    │  run-all.js    │    │  Electron App      │    │
│  │  (single run)  │    │  (full backfill)│    │  (labs/electron/)  │    │
│  └───────┬────────┘    └───────┬────────┘    └─────────┬──────────┘    │
│          │                     │                       │               │
│          └─────────────────────┼───────────────────────┘               │
│                                │                                        │
└────────────────────────────────┼────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        OBSERVABLE LAYER                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                  AnalysisObservable                               │  │
│  │                                                                   │  │
│  │  Observable.create(subscriber => {                                │  │
│  │    for (page of pages) {                                          │  │
│  │      const result = await analyze(page);                          │  │
│  │      subscriber.next({ type: 'progress', ... });                  │  │
│  │    }                                                              │  │
│  │    subscriber.complete();                                         │  │
│  │  })                                                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                              │                                          │
│                              ▼                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     SSE Server (Express)                          │  │
│  │                                                                   │  │
│  │  GET /progress → text/event-stream                               │  │
│  │  data: {"type":"progress","current":5,"total":100,...}           │  │
│  │  data: {"type":"progress","current":6,"total":100,...}           │  │
│  │  data: {"type":"complete"}                                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          UI CONSUMERS                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────────┐    │
│  │  Browser UI    │    │  Electron App  │    │  Terminal (--json) │    │
│  │  localhost:3000│    │  BrowserWindow │    │  line-by-line      │    │
│  └────────────────┘    └────────────────┘    └────────────────────┘    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Test with Small Batch

```powershell
# Run 5 pages headlessly
node labs/analysis-observable/run-lab.js --limit 5 --headless --verbose

# Check the timing output
# Look for: averages.analysis.preparation.jsdomMs
```

### Run with UI

```powershell
# Browser UI (opens localhost:3000)
node labs/analysis-observable/run-all.js --limit 100

# Electron app (more reliable for long runs)
node labs/analysis-observable/run-all.js --limit 1000 --electron
```

### Full Backfill

```powershell
# All pending pages with Electron UI
node labs/analysis-observable/run-all.js --electron
```

---

## Event Types

### Progress Event

```javascript
{
  type: 'progress',
  current: 42,
  total: 1000,
  page: {
    url: 'https://example.com/article',
    title: 'Article Title',
    wordCount: 1234,
    categories: ['politics', 'uk'],
    placeMentions: 5
  },
  timings: {
    decompression: { ms: 5 },
    extraction: { 
      method: 'xpath',  // or 'readability'
      xpathMs: 45,
      jsdomMs: 0  // 0 when xpath used
    },
    classification: { ms: 12 },
    facts: { ms: 3 },
    places: { ms: 28 },
    database: { ms: 8 }
  },
  averages: {
    totalMs: 101,
    extraction: { jsdomMs: 1234, xpathMs: 45 }
  },
  rate: 2.5,  // pages/second
  eta: 383,   // seconds remaining
  elapsed: 168  // seconds since start
}
```

### Status Event

```javascript
{
  type: 'status',
  phase: 'running',  // 'starting', 'running', 'stopping', 'complete'
  message: 'Processing page 42 of 1000'
}
```

### Complete Event

```javascript
{
  type: 'complete',
  summary: {
    processed: 1000,
    succeeded: 987,
    failed: 13,
    totalMs: 400000,
    avgMs: 400
  }
}
```

### Error Event

```javascript
{
  type: 'error',
  url: 'https://example.com/broken',
  message: 'Failed to decompress: invalid zstd frame',
  recoverable: true
}
```

---

## Timing Breakdown

### What Gets Measured

| Component | What It Includes |
|-----------|-----------------|
| `decompression` | Zstd decompress from cache |
| `extraction.xpathMs` | XPath-based text extraction |
| `extraction.jsdomMs` | JSDOM + Readability fallback |
| `classification` | Category/topic assignment |
| `facts` | Boolean fact extraction |
| `places` | Place mention detection |
| `database` | Writing results |

### UI Indicators

```
┌─────────────────────────────────────────────────────────────────┐
│ Progress: 42/1000 (4.2%)                                        │
│ Rate: 2.5 pages/sec │ ETA: 6:23                                │
├─────────────────────────────────────────────────────────────────┤
│ Current: https://bbc.com/news/world/article                     │
│ Method: XPath ✓ (green = fast path)                            │
├─────────────────────────────────────────────────────────────────┤
│ Timing Breakdown:                                               │
│   Decompress:     5ms  ████                                     │
│   Extraction:    45ms  ██████████████████████                   │
│   Classification: 12ms ██████                                   │
│   Facts:          3ms  ██                                       │
│   Places:        28ms  ██████████████                           │
│   Database:       8ms  ████                                     │
│   Total:        101ms                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Bottleneck Detection

The UI highlights slow components:

- 🟢 **XPath ✓** — Fast extraction path used
- 🟡 **JSDOM** — Slow path triggered (10-30s expected)
- 🔴 **Stalled** — No progress for 60+ seconds

---

## JSDOM: The Known Bottleneck

### Why It's Slow

JSDOM creates a full browser-like DOM:
- Parses entire HTML structure
- Executes some JavaScript
- Builds complete DOM tree
- For large HTML (500KB+): 20-30 seconds

### When It's Triggered

```
Has XPath pattern for domain?
        │
        ├── YES → XPath extraction (50-200ms) 🟢
        │
        └── NO → JSDOM + Readability (10-30s) 🟡
```

### Mitigation Strategies

1. **Add XPath patterns** for high-volume domains
2. **Skip analysis** for domains without patterns
3. **Cache extraction results** (already done via analysis version)
4. **Pre-warm patterns** by analyzing sample pages first

---

## Electron App

### Why Electron?

- **Survives terminal close** — Long runs continue
- **Rich UI** — Charts, progress bars, stop button
- **No browser SSE issues** — VS Code Simple Browser has SSE quirks

### Launching

```powershell
# Via run-all.js flag
node labs/analysis-observable/run-all.js --electron

# Direct launch
node labs/analysis-observable/electron/main.js
```

### UI Features

```
┌─────────────────────────────────────────────────────────────────┐
│ Analysis Progress                                    [■] [X]    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐│
│ │ Progress Bar: ████████████░░░░░░░░░░░░░ 42%                ││
│ └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│ Throughput Chart:                                               │
│   3 ┤        ╭──╮                                              │
│   2 ┤     ╭──╯  ╰──╮                                           │
│   1 ┤  ╭──╯        ╰──                                         │
│   0 └────────────────────────────────────────────              │
│       1min            2min            3min                      │
│                                                                 │
│ [Stop Gracefully]                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Graceful Stop

### How It Works

```javascript
let stopRequested = false;

app.post('/stop', (req, res) => {
  stopRequested = true;
  res.json({ status: 'stopping' });
});

// In analysis loop
for (const page of pages) {
  if (stopRequested) {
    subscriber.next({ type: 'status', phase: 'stopping' });
    break;
  }
  
  const result = await analyze(page);
  subscriber.next({ type: 'progress', ... });
}

subscriber.complete();
```

### User Flow

1. User clicks "Stop" button
2. UI sends POST /stop
3. Current page completes
4. Loop exits cleanly
5. Complete event sent
6. Progress saved (can resume)

---

## Run Options

### run-lab.js

Quick single runs for testing:

```powershell
node labs/analysis-observable/run-lab.js \
  --limit 10 \
  --headless \
  --verbose \
  --analysis-version 1022
```

| Flag | Purpose |
|------|---------|
| `--limit N` | Process N pages max |
| `--headless` | No browser UI |
| `--verbose` | Extra console output |
| `--analysis-version N` | Target version |

### run-all.js

Full backfill with progress:

```powershell
node labs/analysis-observable/run-all.js \
  --limit 1000 \
  --electron \
  --analysis-version 1022
```

| Flag | Purpose |
|------|---------|
| `--limit N` | Process N pages (omit for all) |
| `--electron` | Use Electron app |
| `--headless` | No UI at all |
| `--analysis-version N` | Target version |

---

## Integration Points

### Pre-Flight Check

```powershell
# How many pages need analysis?
node labs/analysis-observable/run-all.js --info

# Output:
# Pending: 47,234 pages (analysis_version < 1022)
# Estimated time: 4-8 hours
```

### Post-Analysis

```powershell
# Verify analysis completed
sqlite3 data/news.db "SELECT analysis_version, COUNT(*) FROM content_analysis GROUP BY 1"

# Check for failures
node labs/analysis-observable/report.js --failures
```

---

## Error Handling

### Recoverable Errors

- Decompression failure → Skip, log, continue
- Extraction timeout → Skip, log, continue
- Database write error → Retry once, then skip

### Fatal Errors

- Database connection lost → Stop, save progress
- Out of memory → Stop immediately
- Unhandled exception → Log, stop

### Error Recovery

```javascript
async function analyzeWithRecovery(page) {
  try {
    return await analyzePage(page);
  } catch (error) {
    if (isRecoverable(error)) {
      await logError(page.url, error);
      return { url: page.url, failed: true, error: error.message };
    }
    throw error;  // Fatal, stop everything
  }
}
```

---

## Next Chapter

[Chapter 10: Place Disambiguation →](10-place-disambiguation.md)
