# Follow Ups – Analysis Backfill Observable with Electron UI

## High Priority

- [ ] **Add npm scripts for the lab**
  ```json
  "lab:analysis": "node labs/analysis-observable/run-lab.js",
  "lab:analysis:electron": "node labs/analysis-observable/run-lab.js --electron",
  "lab:analysis:test": "node labs/analysis-observable/e2e-test.js"
  ```

- [ ] **Enhance `analyse-pages-core.js` to emit bytes**
  - Add `bytesProcessed` to the onProgress callback
  - Track compressed HTML size from decompression pool

## Medium Priority

- [ ] **Add graceful stop support**
  - Currently `analysePages` doesn't check for stop signals
  - Need to pass a cancellation token or check flag in the loop

- [ ] **Improve ETA calculation**
  - Weight by average page processing time, not just count
  - Consider different page complexities

- [ ] **Add pause/resume support**
  - Allow pausing analysis and resuming later
  - Track last processed page ID

## Low Priority

- [ ] **Add throughput alerts**
  - Notify when records/sec drops below threshold
  - Log warnings for stalled analysis

- [ ] **Add history/replay**
  - Store analysis run history
  - Allow viewing past run metrics

## Related Sessions

- `2026-01-04-gazetteer-progress-ui` — Contains the place disambiguation book with Chapter 19_
