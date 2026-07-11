# Zimbabwe History Campaign — visual monitoring log (agent-reviewable, resumable)

## Campaign facts

Started 2026-07-11T03:24:06Z · deadline 05:24:06Z (2h) · operation `crawlCountryHubHistory` · target `https://www.theguardian.com/world/zimbabwe` · 20pp/leg, 10min leg budget · **screenshots every 5min** → `tools/dev-bridge/state/ui-shots/campaign-<epoch-ms>.png` (Crawl Observer page).

## How any session (including a fresh one) continues the review

1. Liveness: bridge heartbeat `tools/dev-bridge/state/hb-*.json` fresh ⇒ bridge up. Campaign state: `campaign-status` action or read `tools/dev-bridge/state/campaign-status.json` directly (host-readable).
2. Screenshots: list `tools/dev-bridge/state/ui-shots/campaign-*.png` (new files propagate through the mount; ls is reliable for NEW files) or grep "screenshot requested" in `tools/dev-bridge/logs/campaign.log`. Read the newest PNG with the host path and INTERPRET IT (top row of Task Events = current/latest job: watch Events count grow, Duration advance, Errors column stay ✓/-).
3. Healthy pattern: one new job row per ~11min (10min budget + gap), Events reaching ~20-26, no red/error marks, campaign-status legs[] appending `finalStatus:"completed"`.
4. Unhealthy: same top row frozen across 2+ frames with growing wall-clock, error ticks, legs with `skipped`/`failed`, or campaign-status state ≠ running before the deadline → investigate (`tail-log campaign`, job's `error` field), stop via `stop-campaign` action if needed.
5. APPEND each review below (frame filename → verdict). This file is the memory.

## Review log

- **03:24 frame** (`campaign-1783740246803.png`): campaign start capture; prior Zimbabwe tests 5559859f (21 ev ✓) and 330222bc (26 ev ✓) visible; baseline OK.
- **03:29 frame** (`campaign-1783740546829.png`): leg-1 job `9b44162b` mid-flight — 18 events, 4.8m, no errors; completed at 03:30 per campaign log (underBudget). VERDICT: healthy.
- **03:31**: leg 2 dispatched (log). Campaign on pace: ~10-11 legs expected by 05:24, articles pushing progressively deeper into the Zimbabwe archive (stored articles aren't refetched, so each leg digs further back).

- **03:34 frame** (`campaign-1783740846841.png`): leg-2 job `35ed83f4` mid-flight — 13 events, 2.8m, no errors; leg-1 `9b44162b` finalized at 21 events / 5.8m ✓. Pattern matches the healthy profile (new row per leg, events growing, all ✓). VERDICT: healthy, on pace.

## End-of-campaign checklist (for whichever session is live at ~05:24Z)

Final delta: `run-node tools/crawl/verify-crawl-delta.js --since 2026-07-11T03:24:06Z` (timeoutMs ≥300000) — expect all-guardian responses, 0×429, a couple hundred articles; spot-check `window.newest` URLs for /world/zimbabwe and older publication dates. Note known leakage: hub-exclusive mode picks up some sidebar links (~20% off-topic observed) — acceptable for now, tighten with URL include-patterns later.
