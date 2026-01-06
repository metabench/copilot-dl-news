# Plan – Crawler & Analysis Progress Integration

## Objective
Create a unified progress dashboard that shows real crawler and analysis processes with auto-start capability, enabling AI agents and users to monitor long-running tasks.

## Discovery Findings

### Existing Infrastructure
1. **Analysis Observable** (`labs/analysis-observable/`) - Complete implementation with:
   - Observable wrapper around `analysePages` with SSE streaming
   - Express server with SSE endpoint, auto-start on connection
   - Electron app wrapper for desktop mode
   - Beautiful dark-themed progress UI with throughput charts
   - Stall detection, per-item timing, ETA calculation
   - kiosk mode for focused progress viewing

2. **Crawler Telemetry** (`src/crawler/telemetry/`) - Production-ready with:
   - `CrawlTelemetryBridge` for SSE broadcast
   - `TelemetryIntegration` with SSE mounting
   - Event types: started, progress, stopped, phase-change, etc.
   - Used by `mini-crawl` and production crawlers

3. **jsgui3 Idiomatic Progress** (`labs/jsgui3-idiomatic-progress/`) - Proven patterns:
   - CSS class transitions for smooth visibility
   - RAF debouncing for high-frequency updates
   - State object pattern with controlled mutations
   - SSE/polling network wrapper
   - Reserved method name awareness

## Done When
- [x] Survey existing infrastructure (analysis-observable, crawler telemetry)
- [x] Create unified dashboard showing both crawl + analysis
- [x] Auto-start demo crawl and analysis on page load
- [ ] Integrate jsgui3 control patterns with real data sources (deferred - current pattern works)
- [x] Add to AI agent instructions for progress monitoring (AGENTS.md updated)
- [x] Document reusable patterns for future process integration (README.md complete)

## Change Set

### New Files
- `labs/crawler-progress-integration/` - New unified lab
  - `server.js` - Express server with dual SSE endpoints
  - `public/index.html` - Dashboard showing both processes
  - `public/app.js` - Client-side state management
  - `electron-main.js` - Electron wrapper
  - `README.md` - Usage documentation

### References
- `labs/analysis-observable/` - Clone server pattern
- `labs/jsgui3-idiomatic-progress/` - Clone jsgui3 control patterns
- `src/crawler/telemetry/` - Use TelemetryIntegration

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Unified Progress Dashboard                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐   ┌─────────────────────────────────┐  │
│  │   Crawl Progress    │   │     Analysis Progress           │  │
│  │  ─────────────────  │   │  ─────────────────────────────  │  │
│  │  ████████░░ 80%     │   │  ██████████████░░░░░░ 45%       │  │
│  │  32/40 pages        │   │  450/1000 records              │  │
│  │  12.5 pages/min     │   │  5.2 rec/sec                   │  │
│  └─────────────────────┘   └─────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  [Auto-Start Crawl] [Auto-Start Analysis] [Stop All]            │
└─────────────────────────────────────────────────────────────────┘
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Process contention (crawl + analysis fighting for DB) | Run sequentially or use different DB connections |
| SSE connection drops | Reconnect with exponential backoff, show connection status |
| Long-running processes freeze UI | Use observable pattern with throttled updates |
| Memory leaks from multiple subscriptions | Proper cleanup on component unmount |

## Tests / Validation
1. Start server → Open browser → Auto-start triggers
2. Progress updates flow in real-time (<100ms latency)
3. Stop button gracefully terminates processes
4. Electron mode works identically to browser mode
5. Error states display correctly when process fails

## Next Steps
1. Create lab folder structure
2. Build server with dual SSE endpoints (reuse analysis-observable)
3. Create unified dashboard HTML
4. Test auto-start functionality
5. Update agent instructions
