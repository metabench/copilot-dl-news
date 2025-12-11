# Session Summary – Streaming SSR + Virtual Scrolling

## Accomplishments
- Created lab harness 015 (streaming + virtual 2x2) at `src/ui/lab/experiments/015-streaming-virtual-harness/check.js`, added to lab manifest.
- Ran harness: virtual cuts rendered items from 2000 → 40; streaming alone raises chunk count (10) without reducing bytes; streaming + virtual keeps smallest activation (~0ms in synthetic loop).

## Metrics / Evidence
- `node src/ui/lab/experiments/015-streaming-virtual-harness/check.js` — outputs chunk counts, rendered items, bytes, render/activation timings.

## Decisions
- None yet (synthetic harness only).

## Next Steps
- Build a minimal SSR streaming harness (Node/Express or lab-only) to emit real HTTP chunks and measure TTFB/first-chunk with virtual on/off.
- Add client-side scroll-jank/timing measurements via Puppeteer (single browser) on large lists.
- Evaluate applying virtual slice to queues renderer `src/ui/express/views/queues/renderQueuesTable.js` without breaking streaming semantics.
