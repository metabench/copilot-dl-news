# Adaptive Sync Batching Implementation Plan

Objective: Replace fixed remote sync batch sizing with an optional adaptive controller that keeps full-payload sync/prune rounds close to a target duration while preserving local-confirm-then-exact-prune safety.

## Goals

- Keep the operator command simple: profiles can say `--adaptive-limit --target-sync-ms 5000` instead of hard-coding a fragile batch size.
- Improve performance by growing the export limit when full batches are repeatedly fast.
- Preserve smoothness by shrinking quickly when fetch, ingest, verify, or prune work exceeds the target.
- Keep the policy pure and unit-testable, separate from HTTP, SQLite, and process lifecycle code.

## Non-Goals

- No remote worker throttling in this slice.
- No UI card for adaptive metrics in this slice.
- No change to exact-ID prune invariants.
- No schema changes.

## Design

Add `tools/crawl/lib/adaptive-sync-batching.js` with a small controller:

- `createAdaptiveBatchController(options)` returns a controller with `getLimit()`, `recordSuccess(metrics)`, `recordEmpty()`, and `recordError()`.
- Adaptive mode is enabled by `--adaptive-limit`, `--adaptive-batching`, or `--target-sync-ms`.
- `--limit` remains the initial limit.
- `--min-limit` and `--max-limit` bound all changes.
- Slow/error rounds halve the current limit down to the minimum.
- Fast full batches grow after a short streak, using a 1.5x step with at least +1.
- Partial fast batches do not grow because they do not prove backlog pressure.

Use total round work time for decisions: fetch + ingest + local verification + remote prune. This matters because remote storage drain performance depends on all four, not just export latency.

## CLI Flags

- `--adaptive-limit`: enable adaptive batch limit.
- `--adaptive-batching`: alias for `--adaptive-limit`.
- `--target-sync-ms <n>`: desired round work budget; also enables adaptive mode.
- `--min-limit <n>`: lower cap, default `1`.
- `--max-limit <n>`: upper cap, default at least the initial limit.

## Acceptance Criteria

- `crawl-remote.js sync` and `crawl-remote.js run` use the controller for their export `limit`.
- Fixed-limit behavior remains unchanged when adaptive mode is not enabled.
- Adaptive logs show limit changes without noisy output on every unchanged round.
- `news-10x1000` and `remote-news-10x1000` use adaptive confirmed-prune settings.
- Unit tests cover growth, shrinkage, disabled mode, partial batches, min/max caps, and target parsing.

## Validation Commands

- `C:\nvm4w\nodejs\node.exe --check tools\crawl\lib\adaptive-sync-batching.js`
- `C:\nvm4w\nodejs\node.exe --check tools\crawl\crawl-remote.js`
- `npm run test:by-path tests\tools\crawl\adaptive-sync-batching.test.js`
- `C:\nvm4w\nodejs\node.exe tools\crawl\index.js news-10x1000 --dry-run`

## Risks

- If growth is too aggressive, heavy pages can still produce long rounds. Mitigation: grow only after repeated fast full batches and shrink immediately on slow/error rounds.
- If max-limit is too high in a profile, adaptive can eventually climb into large payloads. Mitigation: profile caps start conservative.
- If adaptive state is only in memory, a restart begins from the initial limit. This is acceptable for the first slice; a future ledger can persist recent p95 values.