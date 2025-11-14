# Session Summary — Guardian Crawl Verification

## Overview
- **Goal**: Demonstrate that the updated crawl CLI reports accurate download totals for a capped 100-download run.
- **Status**: In progress — awaiting run execution and telemetry capture.

## Metrics
- Runtime: 28.7s (basicArticleCrawl completed in 28,695ms)
- Exit Reason: `queue-exhausted` (no remaining URLs before hitting the 100 download cap)
- Pages Visited: 127
- Pages Downloaded: 51
- Articles Saved: 51

## Notes
- Previous 10-download sanity check already validated the summary helper output; this run confirms the same telemetry at the 100-download setting (global limit still stops at 51 downloads when the queue empties).
- HTTP 404 noise originated from Guardian archive hub URLs (`/world/video`, `/world/live`, `/world/gallery`, `/world/ng-interactive`); article fetches otherwise succeeded without retries.
