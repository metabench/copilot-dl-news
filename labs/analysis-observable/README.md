# Analysis Observable Lab

## Quick Start for Agents

The simplest way to run analysis on all records with the latest version:

```bash
# Show version info only
node labs/analysis-observable/run-all.js --info

# Run all records to next version in Electron app (auto-detects version)
node labs/analysis-observable/run-all.js

# Run with a limit
node labs/analysis-observable/run-all.js --limit 1000

# Run headless (for CI/scripts)
node labs/analysis-observable/run-all.js --limit 100 --headless
```

The `run-all.js` script automatically:
1. Detects the current max analysis version in the database
2. Increments to the next version
3. Shows how many records need analysis
4. Launches the Electron app (or headless/browser mode)

---

This lab wraps the analysis backfill (`analysePages`) in an observable pattern with:
- Real-time progress streaming via SSE
- Performance metrics (bytes/sec, records/sec)
- Electron app for visual progress display
- E2E test fixtures with configurable limits

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Electron App                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Progress Display (HTML/CSS)                                 │    │
│  │  - Current page / total                                      │    │
│  │  - Bytes processed / per second                              │    │
│  │  - Records updated / per second                              │    │
│  │  - Elapsed time / ETA                                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              ▲                                       │
│                              │ SSE events                            │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────┐
│  Express Server (port 3099)  │                                       │
│  ┌───────────────────────────┴─────────────────────────────────┐    │
│  │  /sse/analysis-progress                                      │    │
│  │  - Streams AnalysisObservable events                         │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              ▲                                       │
│                              │ observer.next({ ... })               │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
┌──────────────────────────────┼──────────────────────────────────────┐
│  AnalysisObservable          │                                       │
│  ┌───────────────────────────┴─────────────────────────────────┐    │
│  │  Wraps analysePages() with:                                  │    │
│  │  - onProgress callback → observable.next()                  │    │
│  │  - Byte counting (compressed HTML size)                      │    │
│  │  - Throughput calculation (rolling window)                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                              ▲                                       │
│                              │ analysePages({ onProgress })          │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │  analyse-pages-core │
                    │  (existing module)  │
                    └─────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `run-all.js` | **Simple launcher** - auto-detects version, runs Electron |
| `run-lab.js` | Full-featured lab runner with all options |
| `analysis-observable.js` | Core observable wrapper for analysePages |
| `analysis-server.js` | Express server with SSE endpoint |
| `analysis-version.js` | Version detection utilities |
| `electron-main.js` | Electron app entry point |
| `public/index.html` | Progress display UI |
| `public/app.js` | Client-side SSE consumer |
| `e2e-test.js` | E2E test with limit 5 |

## Usage

### Run the lab
```bash
node labs/analysis-observable/run-lab.js --limit 5
```

### Run with Electron UI
```bash
node labs/analysis-observable/run-lab.js --limit 5 --electron
```

### Big progress bar (kiosk mode)

When you want a very visible progress bar (good for long runs), start the server (browser mode) and open:

- `http://localhost:3099/kiosk`

This enables a simplified, large progress display and auto-starts analysis.

### Run E2E test
```bash
node labs/analysis-observable/e2e-test.js
```

## Metrics Tracked

| Metric | Description |
|--------|-------------|
| `processed` | Pages analyzed so far |
| `total` | Total pages to analyze |
| `updated` | Pages with DB updates |
| `bytesProcessed` | Total compressed HTML bytes |
| `bytesPerSecond` | Rolling throughput (bytes/sec) |
| `recordsPerSecond` | Rolling throughput (records/sec) |
| `elapsedMs` | Time since start |
| `etaMs` | Estimated time remaining |

## SSE Event Format

```json
{
  "type": "next",
  "value": {
    "phase": "analyzing",
    "processed": 42,
    "total": 100,
    "updated": 38,
    "bytesProcessed": 1048576,
    "bytesPerSecond": 52428,
    "recordsPerSecond": 2.1,
    "elapsedMs": 20000,
    "etaMs": 27619,
    "currentUrl": "https://example.com/article/123",
    "lastError": null,
    "avgItemMs": 19800,
    "lastItemMs": 31300,
    "timeSinceProgressMs": 5000,
    "warnings": [
      {
        "type": "slow_item",
        "message": "Last item took 31s - likely JSDOM bottleneck",
        "lastItemMs": 31300
      }
    ],
    "timingBreakdown": {
      "overallMs": 31300,
      "preparationMs": 28500,
      "jsdomMs": 26000,
      "readabilityMs": 2200,
      "xpathExtractionMs": null,
      "usedXPath": false
    }
  }
}
```

### Timing Breakdown Fields

| Field | Description |
|-------|-------------|
| `overallMs` | Total time for analysis of last item |
| `preparationMs` | Time spent preparing content (extraction) |
| `jsdomMs` | Time in JSDOM parsing (the #1 bottleneck) |
| `readabilityMs` | Time in Readability extraction |
| `xpathExtractionMs` | Time using fast XPath path (when cached) |
| `usedXPath` | Boolean - true if fast path used |

The UI displays an **XPath ✓** badge (green) when the fast path is used, or **JSDOM** (yellow) when falling back to slow parsing.

## Stall and Bottleneck Detection

The observable automatically detects performance issues:

| Warning Type | Threshold | Meaning |
|-------------|-----------|---------|
| `stall` | 30+ seconds no progress | Process may be stuck on slow item |
| `slow_item` | 10+ seconds per item | JSDOM bottleneck likely |

### Why Items Can Be Slow

The #1 bottleneck is **JSDOM parsing**. When a domain doesn't have a cached XPath pattern,
the system falls back to Readability extraction which requires a full JSDOM parse.

**JSDOM timings by HTML size:**
- Small article (50KB): 2-5 seconds
- Medium article (200KB): 10-20 seconds
- Large article (500KB+): 30+ seconds

### Mitigation Strategies

1. **Check XPath coverage** - More cached patterns = fewer JSDOM fallbacks
2. **Pre-warm XPath patterns** - Analyze a few pages from each domain first
3. **Use smaller batches** - Better visibility into per-item timings
4. **Monitor warnings** - The observable surfaces bottleneck indicators

## Workflow: Rerunning Analysis

### 1. Pre-flight: Understand the scope

```bash
# Check current analysis versions
sqlite3 data/news.db "SELECT analysis_version, COUNT(*) FROM content_analysis GROUP BY analysis_version"

# Count pages that would be analyzed
sqlite3 data/news.db "SELECT COUNT(*) FROM content_analysis WHERE analysis_version < 1023"
```

### 2. Test with small batch

```bash
node labs/analysis-observable/run-lab.js --limit 5 --headless --analysis-version 1023
```

Watch the timing output. If you see `avg 20s+/item`, expect slow runs.

### 3. Run with UI for visibility

```bash
# Browser UI
node labs/analysis-observable/run-lab.js --limit 100 --analysis-version 1023

# Electron app (persists after terminal closes)
node labs/analysis-observable/run-lab.js --limit 100 --electron --analysis-version 1023
```

### 4. Interpret warnings

```
[analyzing] 15/100 (15.0%) | 0.1 rec/s | 0 B | ETA: 14:10 | avg 23.5s/item, last 28.3s
  ⚠️  Last item took 28s - likely JSDOM bottleneck
```

This tells you:
- ~24 seconds per page average
- Last page was especially slow (28s)
- ETA is calculated from actual per-item timing
- The warning identifies the likely cause (JSDOM)

## Future Improvements

### Potential Enhancements

1. **XPath Pattern Warming** — Pre-crawl domains to build XPath caches before large analysis runs
2. **Domain-Sorted Batches** — Process pages by domain to maximize XPath cache efficiency
3. **HTML Size Filtering** — Skip or queue large HTML files (>500KB) for separate processing
4. **Parallel Analysis** — Worker pool for multi-core analysis (respecting SQLite write limits)
5. **Resume Support** — Save progress checkpoints for interrupted runs
6. **Domain-Level Stats** — Aggregate timing stats by domain to identify problematic sources

### Known Limitations

1. **VS Code Simple Browser** — SSE connection may not work reliably; the UI falls back to polling, but a standalone browser is still more responsive
2. **Electron on some systems** — May have undici compatibility issues; fall back to browser mode
3. **Memory on large runs** — For 40k+ pages, consider batching in 5k chunks with restarts
