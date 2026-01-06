# Plan – Dashboard Controls Extraction & Stress Testing

## Objective
Extract reusable jsgui3 progress controls from labs, add anti-jitter patterns, and create UI stress tests for rapid updates.

## Goals (from user)
1. **Stress test / benchmark for rapid UI updates** — Many items updating quickly should not cause layout jitter
2. **Anti-jitter patterns** — CSS containment, fixed dimensions, RAF batching, virtual scrolling for large lists
3. **Reusable jsgui3 dashboard controls** — Labs should produce artifacts that can be imported and used elsewhere

## Done When
- [x] Shared dashboard controls extracted from labs → `src/ui/controls/dashboard/`
- [x] Anti-jitter patterns documented and demonstrated (CSS containment, RAF batching)
- [x] Stress test lab created with rapid update simulation (100+ updates/sec)
- [ ] Layout stability verified (no reflow/repaint on individual item updates) — needs Chrome profiling
- [x] Controls work in both SSR and client activation modes
- [x] Documentation and examples in README

## Architecture

### Control Extraction Path
```
labs/jsgui3-idiomatic-progress/controls/
├── ProgressBarEl.js            ─┐
├── ProgressDisplayControl.js    ├─► Extract common patterns to
├── ProgressConnectorControl.js ─┘   src/ui/controls/dashboard/

src/ui/controls/dashboard/        (NEW - reusable dashboard kit)
├── index.js                      Module entry point
├── ProgressBar.js                Pure progress bar component
├── ProgressCard.js               Self-contained progress display
├── StatsGrid.js                  Grid of stat items
├── StatusBadge.js                Animated status indicator
├── SSEConnector.js               SSE connection helper (mixin)
└── antiJitter.css                CSS containment rules
```

### Anti-Jitter Patterns

| Pattern | Purpose | Implementation |
|---------|---------|----------------|
| `contain: layout style` | Isolate reflow | CSS on cards/items |
| `will-change: transform` | GPU layers | For animating elements |
| Fixed dimensions | Prevent layout shift | Set width/height explicitly |
| `font-variant-numeric: tabular-nums` | Stable number widths | For counters/stats |
| RAF batching | Coalesce updates | Single frame update |
| Virtual scrolling | Large lists | Only render visible items |

### Stress Test Scenarios

| Scenario | Items | Updates/sec | Expected |
|----------|-------|-------------|----------|
| Single item | 1 | 60 | Smooth 60fps |
| Many items | 50 | 10 each (500 total) | No jitter |
| Large list | 1000 | 100 (random) | Viewport only |

## Change Set
- `src/ui/controls/dashboard/index.js` — Module entry
- `src/ui/controls/dashboard/ProgressBar.js` — Extracted progress bar
- `src/ui/controls/dashboard/ProgressCard.js` — Card with bar + stats
- `src/ui/controls/dashboard/StatsGrid.js` — Stats display grid
- `src/ui/controls/dashboard/StatusBadge.js` — Status indicator
- `src/ui/controls/dashboard/styles.css` — Anti-jitter CSS
- `labs/dashboard-stress-test/` — Stress test lab
- `labs/dashboard-stress-test/server.js` — Express server with SSE flood
- `labs/dashboard-stress-test/public/index.html` — Test dashboard
- `checks/dashboard-controls.check.js` — Validation script

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| jsgui3 activation quirks | Test both SSR and client activation paths |
| Browser differences | Test in Chrome, check requestAnimationFrame support |
| Large list performance | Implement virtual scrolling or windowing |
| CSS containment breaking layouts | Test thoroughly, provide fallback |

## Tests / Validation
- [ ] Run check script: `node checks/dashboard-controls.check.js`
- [ ] Start stress test: `node labs/dashboard-stress-test/server.js`
- [ ] Open in browser and verify no layout jitter at 500 updates/sec
- [ ] Import controls into existing dashboard and verify they work
- [ ] Profile in Chrome DevTools → no layout thrashing
