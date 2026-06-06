# RUNBOOK.md — Crawler Operations Runbook

**Status**: LEGACY — covers local crawling only  
**Last Updated**: December 12, 2025  
**When to Read**: You need to run the local UI server, trigger local crawls, run tests, or debug job/SSE behavior

> **⚠️ For remote/fleet crawl operations**, see [tools/crawl/AGENT.md](../tools/crawl/AGENT.md) instead. This runbook covers the legacy local `npm start` / `node src/crawl.js` entrypoint and the deprecated dashboard UI. The remote fleet system uses `crawl-remote.js` and the unified launcher (`npm run crawl`).

This runbook collects operational workflows so `AGENTS.md` can stay focused on architecture and contracts.

## Weekly focus

- **Current focus:** Keep crawl orchestration centered on named `crawlType` presets (especially `intelligent`) while deepening place-hub detection/telemetry and upgrading live analysis UX.
- **If blocked:** Leave a short note in the roadmap table (see `ROADMAP.md`) with a link to your branch or draft PR so the next agent can pick it up.
- **Definition of done this week:** Docs and tests match the crawler CLI flags; run a fast smoke test with `UI_FAKE_RUNNER=1` before handing off.

## Quick start for agents

- Install dependencies once per checkout: `npm install`.
- Current small/medium crawler reliability work starts with
  `node tools/crawl/crawl-packet.js plan --crawl-class tiny-local --json` and
  `node tools/crawl/monitored-small-crawl.js local-smoke --json`; use
  tokenized loopback fixture packets such as
  `node tools/crawl/crawl-packet.js plan --fixture-preset small --fixture-target-token small-YYYYMMDD-HHMM --local-smoke-report tmp/local-smoke-report.json --json`
  when internet target contact is not approved. See `tools/crawl/AGENT.md` for
  the full packet/watch/DB proof ladder.
- For medium fixture validation, require host coverage as well as fetch count:
  `watchFinal.minHostsMet` must be true and no requested host should appear in
  `missingLocalTargets` or `verification.hosts.missingRecentEvidence`.
- Treat `partial-launch` as a hard medium blocker even if accepted jobs later
  produce DB rows. Packet-generated fixture launches avoid operation-start
  retries, so a failed target is evidence to diagnose rather than a reason to
  retry blindly.
- If concurrent medium fixture launch is blocked, use the packet's sequential
  per-host helper, then compare packets file-only:
  `node tools/crawl/sequential-fixture-proof.js execute --fixture-port 41966 --target-token medium-YYYYMMDD-HHMM --artifact-prefix tmp/medium-sequential-live --local-smoke-report tmp/local-smoke-report.json --comparison tmp/local-smoke-comparison.json --compare-with <concurrent> --json --out tmp/medium-sequential-live-result.json`
  `node tools/crawl/crawl-packet.js compare --packet <concurrent> --packet <sequential> --json`.
  The current local reliability ladder prefers the clean sequential medium
  loopback proof until concurrent launch proves every requested host. Treat
  `job-still-running-after-db-proof` as an operator warning: DB persistence was
  proven, but the local operation job endpoint had not reached terminal state.
  Add `--wait-for-terminal --terminal-wait-timeout 15` only when you need a
  bounded post-DB-proof job endpoint diagnostic; incomplete terminal wait is a
  warning if DB and host proof are clean. During terminal wait the per-poll
  `/jobs/:jobId` budget is raised via `--watch-terminal-job-poll-timeout`
  (default 5000ms, clamped 1500–5000) so the in-process crawl cannot starve the
  job route; the outcome is classified as `terminal`, `timed-out`, or
  `endpoint-unavailable` (sub-taxonomy `job-terminal-wait-timed-out` vs
  `job-terminal-wait-endpoint-unavailable`).
- To compare the small and medium rungs at a glance with zero contact, run
  `node tools/crawl/crawl-packet.js cadence --small <small packet> --medium <medium packet> --json --out tmp/small-vs-medium-cadence-comparison.json`.
  It reads two saved reliability packets and emits per-rung summaries, a
  taxonomy diff, medium-minus-small deltas, and a `cadenceConsistent` boolean
  (exit 0 when consistent). No crawler start, no network, no DB writes.
- Active UI (Data Explorer, DB browsing): `npm run ui:data-explorer` (defaults to `http://localhost:3001`).
- Deprecated dashboard UI (still contains crawl start/pause/resume + SSE): `node src/deprecated-ui/express/server.js`.
- **Database migrations**: Check schema status before starting work. See `docs/DATABASE_MIGRATION_GUIDE_FOR_AGENTS.md` for migration procedures.
- The server auto-selects an available high-numbered port (41000+ range by default); watch the `GUI server listening ...` log or set `PORT` to override.
- Trigger a deterministic crawl preview (no network) by posting to `POST /api/crawl` with `UI_FAKE_RUNNER=1`.
- Run a focused Jest suite: `npm run test:by-path src/deprecated-ui/express/__tests__/server.args.test.js`.
- Refresh analysis + milestone prerequisites: `npm run analysis:run` (reuses `analysis-run.js`).
- Golden rule: if you change an HTTP, SSE, or CLI contract, update the relevant section in `AGENTS.md` and record the change in your session summary (`docs/sessions/.../SESSION_SUMMARY.md`).

## CLI entrypoints (two different tools)

- `npm start` runs `node src/crawl.js` (config-driven crawler entrypoint; exports `NewsCrawler`).
- `node crawl.js ...` runs the operations/sequences CLI (availability, run-sequence, place commands). See `docs/cli/crawl.md`.

## Guardrails & gotchas

- Deterministic deprecated-dashboard tests expect `UI_FAKE_RUNNER=1`; without it, suites may hang waiting for real network traffic.
- The deprecated dashboard lives under `src/deprecated-ui/express/`. The active Data Explorer UI lives under `src/ui/`.
- Keep the changelog lean: fold related edits into a single dated bullet instead of adding multiple entries per day.
- SQLite writes happen in the crawler; when running locally, avoid deleting the DB while a job is active to prevent `SQLITE_BUSY` issues.

- Parallel local runner DB handle: the multi-domain basic crawl (`runMultiModalCrawl` → `MultiModalCrawlManager`, default `maxParallel=30`) opens better-sqlite3 **once** at the boundary and injects the shared handle into every parallel orchestrator — it does not re-open the DB per runner, so the local fan-out does not recur the server-side per-operation synchronous-boot starvation. The shared handle means heavy synchronous writes still serialize on the single event loop, but this is bounded/benign relative to network waits.

- **Boot preflight for scaled runs (REQUIRED for size ≥ small):** the auto-spawned unified UI trips a **30s readiness timeout on first launch** (`auto-spawned unified UI did not become ready within 30s`). Before any crawl ≥ small, set `$env:CRAWL_RUN_SERVER_READY_TIMEOUT_MS = "120000"` (120s) in the shell, then start the run. Do not add harness start retries to work around it (duplicate-job risk). See `tools/crawl/AGENT.md` → "Boot Preflight for Scaled Runs".

- **Self-clocking progress monitor:** `crawl-progress-monitor` derives `elapsedSec` from DB `latestFetchedAt` deltas (reported as `elapsedSource: db-latest-fetched-delta`) rather than a harness wall-clock, which once produced a negative −3.5M ms reading. Pass `--baseline <snapshot.json>` (raw, `sample.totals`, or `production.totals` shapes) so `dbGrowth` is a true delta.


## Testing approach

- **Framework:** Jest; deprecated dashboard tests live in `src/deprecated-ui/express/__tests__/`.
- **Cheat sheet:**
  - Fast cycle (PowerShell): ``$env:UI_FAKE_RUNNER='1'; npm run test:by-path src/deprecated-ui/express/__tests__/server.args.test.js``
  - Full suite: `npm run test:all`
- **Pattern:** Spawn `src/deprecated-ui/express/server.js` on a random port (via `PORT=0`) and exercise HTTP/SSE with the Node `http` module.
- **Fake runner toggles:**
  - Set `UI_FAKE_RUNNER=1` to use a built-in fake child runner that emits realistic progress quickly for tests.
  - Set `UI_FORCE_SPAWN_FAIL=1` to simulate immediate spawn failure (`done` should appear fast).
- **Timing notes:** Tests read seeded progress/log frames shortly after `/api/crawl` returns 202 to ensure the UI shows immediate activity.

## Diagnosing "accepted but no DB rows" on concurrent local launches
- **Symptom:** A host's operation `/start` returns accepted (job `running`) yet the verify report lists it under `missingRecentEvidence`.
- **Most common cause:** *Late start.* Under `--batch-concurrency >1`, the in-process server boots the engine and opens better-sqlite3 synchronously per operation, blocking the event loop. A queued host's `/start` is not accepted until the prior crawl frees the loop (~one host-crawl later), so its job begins too late to commit rows inside the bounded `--watch-timeout` window. A second concurrent socket may instead reset with `read ECONNRESET`.
- **Confirm:** Compare job `createdAt`/`startedAt` across hosts in the launch report; a multi-second gap for the missing host (vs the proven host) confirms late start, not a crash.
- **Action:** Use the sequential rung (one in-flight `/start`) for the canonical local medium proof. Do NOT add harness start retries (duplicate-job risk). Durable fix is the server-side accept-before-boot change (approval-gated).
