# Plan – Geo Import Dashboard Progress Bar Architecture

## Objective
Investigate and plan progress bar improvements for geo import using observables and reusable abstractions

## Done When
- [x] Investigation complete with current state assessment
- [x] Gap analysis documented (what's missing/broken)
- [x] Architecture recommendations defined
- [x] Implementation phases prioritized
- [ ] Phase 1 implementation (fix controls wiring + add ProgressBar)

## Current State Summary

The geo import system is **moderately advanced** with solid foundations:
- ✅ SSE real-time updates working
- ✅ Stage-based pipeline with visual stepper
- ✅ fnl observables for async import
- ✅ Circular progress ring display
- ⚠️ Pause/Resume controls **not wired** (bug)
- ⚠️ No linear progress bar with metrics
- ⚠️ Client-side metrics via DOM manipulation (not SSR)
- ⚠️ No stall/stuck detection

## Change Set

### Phase 1: Fix & Enhance (Immediate Priority)

| File | Changes |
|------|---------|
| `src/services/GeoImportStateManager.js` | Wire `_controls` from import$ observable |
| `src/ui/controls/GeoImportDashboard.js` | Add `ProgressBarControl` to pipeline view |
| `src/ui/client/geoImport/index.js` | Wire progress bar updates via SSE |
| `public/assets/controls.css` | Ensure progress bar styles included |

### Phase 2: Abstraction Layer (Future)

| File | Purpose |
|------|---------|
| `src/services/ProgressObservableWrapper.js` | Normalize any progress observable |
| `src/ui/controls/DualProgressControl.js` | Primary + secondary bars with metrics |
| `src/services/SseProgressEmitter.js` | Batched SSE emission with heartbeat |

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                               │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ ProgressBar     │  │ MetricsDisplay  │                  │
│  │ (jsgui3 ctrl)   │  │ (speed/ETA)     │                  │
│  └────────┬────────┘  └────────┬────────┘                  │
│           │                    │                            │
│           ▼                    ▼                            │
│  ┌─────────────────────────────────────────┐               │
│  │ SSE Event Handler (geoImport/index.js)  │               │
│  └─────────────────────────────────────────┘               │
└────────────────────────────┬────────────────────────────────┘
                             │ EventSource /api/geo-import/events
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                        SERVER                               │
│  ┌─────────────────────────────────────────┐               │
│  │ GeoImportStateManager (EventEmitter)    │               │
│  │ - stage tracking                        │               │
│  │ - progress aggregation                  │               │
│  │ - controls wiring (pause/resume)        │               │
│  └────────────────────────────────────────┘               │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────────────────────────────┐               │
│  │ GeoImportService (fnl observable)       │               │
│  │ - file streaming                        │               │
│  │ - batch processing                      │               │
│  │ - progress events                       │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Import may hang without user knowing | Add stall detection heartbeat |
| SSE connection drops | Already has reconnection logic ✅ |
| Large imports overwhelm SSE | Batch progress events (already ~5000 record intervals) |
| Pause/Resume break mid-transaction | Use SQLite transactions, resume from checkpoint |

## Tests / Validation

1. **Manual Test**: Start geo import, verify progress bar updates
2. **Pause/Resume Test**: Verify controls actually pause/resume the import
3. **Stall Test**: Artificially delay processing, verify stall detection fires
4. **Check Script**: Add `checks/geo-import-progress.check.js` for SSR output

## Related Resources

- Lab 027: `src/ui/lab/experiments/027-progressbar-sse-telemetry/`
- Lab 028: `src/ui/lab/experiments/028-jsgui3-server-sse-telemetry/`
- Telemetry docs: `docs/TELEMETRY_AND_PROGRESS_COMPLETE.md`
- ProgressBar: `src/ui/controls/ProgressBar.js`
- crawlDisplayAdapter: `src/ui/client/crawlDisplayAdapter.js`
