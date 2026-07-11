# Stage 3 — Pending-Queue Safety (checklist)

## Facts established (live probes + code, 2026-07-04)

- Pending URLs are **DB-persisted**, not in-memory:
  `/api/queue/pending` counts via
  `remoteCrawlerDb.countPendingRemoteCrawlerUrlsForDomain()` against the
  server's SQLite DB. A restart does not lose them.
- Live counts: bbc.com 1273, theguardian.com 1482, apnews.com 1023,
  npr.org 398, others 0 → **total 4176** (the busy-guard's "1273" line is
  bbc only — undercount; STATE corrected).
- WAL state clean: `wal.pendingCheckpoints: 0`.
- Graceful shutdown exists: SIGINT/SIGTERM → `shutdown()` → `db.close()`
  (multi-domain-server.js ~1660-1740); pm2 stop sends SIGINT with grace.
- The remote install script explicitly preserves data/: it `rm -rf`s ONLY
  code paths (deploy, src, vendor, lib, server js, configs, package files,
  node_modules/news-crawler-db) before `tar -xzf`; the tarball contains no
  data/ directory.

## Residual risks

1. `npm install --omit=dev` failure mid-deploy leaves the service DOWN
   (code deleted, deps missing). Mitigation lives in stage 5 (rollback);
   the pre-checkpoint here only confirms we accept a brief outage window.
2. Native rebuild (better-sqlite3) needs make/g++ on the VM — present
   (build 20260527 deployed the same way), and the script warns if missing.
3. A restart while the orchestrator is RUNNING interrupts active fetches
   (work is resumable from DB, but politeness/duplicate concerns apply).

## Pre-restart checkpoint (MUST all pass, in one call, before pm2 stop)

- [ ] `/api/status`: `orchestrator.running == false` and
      `currentlyRunning == 0`
- [ ] `/api/status`: `throughput.fetchesPerSec == 0` and
      `writesPerSec == 0`
- [ ] `/api/status`: `wal.pendingCheckpoints == 0`
- [ ] `/api/queue/pending`: record full per-domain counts verbatim in STATE
      notes (baseline for post-restart comparison)
- [ ] Explicit operator approval for the restart given IN-CHAT after seeing
      the above (hard rail — never assume)

## Post-restart verification

- [ ] `/api/status` reachable, new `buildId` reported
- [ ] `/api/queue/pending` returns the SAME per-domain counts as baseline
      (server was idle, so ±0 expected; any drop = investigate before
      declaring success)
- [ ] `wal.pendingCheckpoints == 0` again after startup

## Exit criterion

Checklist exists with live-verified facts; queue survival mechanism named
(DB-backed) and clobber path ruled out (script preserves data/).
