# Working Notes – Cloud Crawl 15m Validation

- 2026-05-09 — Session created via CLI. Add incremental notes here.

- 2026-05-09 16:52 — 
## 2026-05-09 Implementation Notes
- Added `tools/crawl/lib/cloud-crawl-e2e-validation.js` for strict 15-minute budget planning, DB/ledger evidence checks, log metric parsing, and benchmark stats.
- Added `tools/crawl/cloud-crawl-e2e.js` plus profile `news-10x1000-15m-e2e` and package script `crawl:e2e:15m`.
- Found and fixed a live wiring gap in `tools/crawl/crawl-remote.js`: `cmdRun` now uses `.crawl-remote-ledger.json` with append/confirm/prune tracking, matching the `sync` loop.

## 2026-05-10 Live Validation Notes
- Deployed the updated remote `multi-domain-server.js` to `oracle-worker:/home/ubuntu/apps/remote-crawler-v2/multi-domain-server.js` and restarted PM2 process `crawl-server-v4`; `/api/throttle` now returns HTTP 200.
- First live run produced useful crawl data but exposed validator edge cases: ISO run windows did not match SQLite `fetched_at` strings, and a targeted recovery sync could regress the ledger watermark.
- Fixed evidence-window normalization in `tools/crawl/cloud-crawl-e2e.js`, non-regressing ledger watermarks in `tools/crawl/lib/sync-ledger.js`, and superseded unconfirmed ledger handling in `tools/crawl/lib/cloud-crawl-e2e-validation.js`.
- Final live report `artifacts/cloud-crawl-e2e-2026-05-09T23-58-42-010Z.json` passed: elapsed 879100ms, 1937 response/content rows added, 1909 successes, 28 failures, 4 recent hosts, ledger unconfirmed/unpruned both 0.
- Final benchmark stats from the passing report: 132.20 downloads/min, 130.29 successes/min, 132.20 content rows/min, p50/p95 fetch 1363/3472ms, ingest 244/582ms, round 1794/4343ms.
- Post-run remote status showed orchestrator stopped, currentlyRunning 0, all 10 domains idle, PM2 server healthy.

## 2026-05-10 Documentation Follow-Up
- Updated `tools/crawl/AGENT.md` with an explicit harnessed vs non-harnessed crawl mode guide, including dry-run, preflight, live validation, operator, direct remote, and local fallback commands.
- Updated `docs/cli/crawl.md`, `docs/INDEX.md`, and `tools/crawl/index.js` help text so future operators can distinguish strict 15-minute e2e validation from normal useful crawling and know which post-run checks are required.
