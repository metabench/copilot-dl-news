## 2026-05-08 — Electron 10x1000 crawl operator run

- Tactical session `docs/sessions/2026-05-08-electron-crawl-10x1000/` opened to run 10 major news sites at 1000 pages each through the Electron-hosted unified app.
- Scope includes a jsgui3 Crawl Status batch launcher, Electron `--app crawl-status --allow-multi-jobs` startup ergonomics, a real batch start against the Electron server, and screenshot evidence under the session folder.

## 2026-04-29 — Eight-site 250-download crawl with UI evidence

- Completed a distributed crawl producing at least 250 new local 200-status downloads for eight major news sites: `bbc.com`, `aljazeera.com`, `theguardian.com`, `cbsnews.com`, `nbcnews.com`, `france24.com`, `euronews.com`, and `independent.co.uk`.
- Verified success against `data/news.db`, not only remote counters; final local counts ranged from 272 to 300 OK downloads per site.
- Captured jsgui3 unified UI evidence from `http://localhost:51012` with screenshot analysis `ok: true` under `screenshots/eight-site-250-download-crawl/`.
- Gap found: optional `remote-crawl-admin` router is missing from the unified app, so distributed crawl control still depends on CLI while the UI displays download/crawl evidence.

## 2026-04-29 — Electron 500-download crawl with persistent UI

- Completed a second distributed crawl with a higher local evidence bar: at least 500 new local 200-status downloads per site across the same eight successful major outlets.
- Verified final local counts ranged from 572 to 595 OK downloads per site from baseline `2026-04-29T21:02:54.481Z`.
- Used the Electron unified app in long-lived mode at `http://127.0.0.1:51014/?app=downloads`; Electron PID 22172 remained loaded after crawl completion and after screenshot capture.
- Captured Electron-backed UI evidence under `screenshots/electron-500-download-crawl/` with screenshot analysis `ok: true`.

## 2026-05-10 - Local crawl throughput slice

- Tactical session `docs/sessions/2026-05-10-local-crawl-throughput/` opened to make local crawl throughput visible again after improved internet connectivity: explicit docs/sec and MB/sec metrics, replayable metrics artifacts, and a compact `/crawl-status` strip before any larger UI redesign.

## 2026-04-29 — Download verification UI

- Added a unified-shell `Download Verify` screen that joins recent `http_responses` to `content_storage` and compression metadata so operators can inspect downloaded/saved/compressed proof in the UI.
- Added reusable jsgui3 `DownloadVerificationPanelControl` plus focused render/query checks.
- Verified the screen in browser and Electron: latest rows show successful DB persistence and current imported rows report `gzip` via `storage_type` while correctly marking compression level as unrecorded.

# Working Notes – LT-001 Advanced Crawler + Advanced UI

- 2026-03-08 — Long-term session materialized because the hub already referenced LT-001 as the active strategic outcome, but the directory did not exist in the worktree.
- 2026-03-08 — Tactical planning session `docs/sessions/2026-03-08-v5-remote-crawler-application-plan/` added a concrete v5 plan centered on: remote unified shell, crawl control, bundle jobs, and article library/reader.
- 2026-03-08 — Immediate strategy choice: v5 should productize existing assets first (`remote-crawler-v2`, unified shell, Data Explorer, Article Viewer), not begin with a fresh crawler-engine rewrite.
- 2026-03-08 — Added execution-grade plan directory `docs/plans/2026-03-v5-remote-crawler-application/` so implementation can be staged across workstreams instead of relying on a single concept document.
- 2026-03-09 — Strategic scope tightened again: always-on hosting, responsiveness under load, auth before exposure, restart-safe run/job state, bundle integrity/retry semantics, and host-protection guardrails are now documented as first-class v5 requirements.
- 2026-03-09 — Intelligent crawling via place/topic hub guessing is now part of LT-001's core outcome, using existing hub-analysis, pattern-learning, and UI-query assets as the planned base rather than treating hub guessing as separate tooling.
- 2026-03-10 — Implementation has started with tactical session `docs/sessions/2026-03-10-v5-runtime-bootstrap/`, focused on the first backend slice: explicit `src/v5/remote/` boundary plus a minimal bootable and testable API contract.
- 2026-03-10 — First tactical slice landed: `src/v5/remote/server.js`, `src/v5/remote/runtime.js`, and `tests/v5/remote-server.test.js`. This establishes the v5 backend namespace, minimal health/status/domain/crawl-control contract, and a placeholder hub-suggestions contract without forcing a broad `remote-crawler-v2` restoration in the same pass.
- 2026-04-29 — Tactical session `docs/sessions/2026-04-29-simple-distributed-crawl-readiness/` opened to verify the smallest easy distributed crawl path, Oracle Cloud readiness, config/profile boundaries, and terminology around "simple" meaning low-scope rather than local-only.
- 2026-04-29 — Tactical session `docs/sessions/2026-04-29-ui-tools-review/` opened to review and tighten jsgui3 UI tooling, shared controls, and operator-facing UI integration.
- 2026-04-29 — UI tools review completed a focused integration repair: added reusable `SearchExplorerControl`, restored unified-shell activators/helpers, restored Crawl Status and Domain Registry support modules, documented focused checks, and got the unified server integration check passing.
- 2026-04-29 — Tactical session `docs/sessions/2026-04-29-electron-jsgui3-crawl-display/` opened to prove the real crawl -> jsgui3 UI -> Electron/screenshot display loop and iterate on any quality gaps.
- 2026-04-29 — Electron+jsgui3 crawl-display validation completed: the simple distributed smoke crawl produced fresh BBC evidence, Downloads and Crawl Status routes render cleanly in the unified shell, Electron route smokes pass, and `npm run ui:crawl-display-screenshots` now captures repeatable visual artifacts plus quality metrics.
- 2026-04-29 — Churn control salvage completed: disposable widget/app/lab shells stayed removed, while reusable jsgui3 patterns were promoted into shared controls (`ActionButtonGroupControl`, `OptionPickerControl`, `ActivityLogControl`, `CrawlProgressPanelControl`) with focused render checks and catalog documentation.
- 2026-05-04 — Tactical session `docs/sessions/2026-05-04-five-site-cloud-crawl-ui/` completed a five-site cloud crawl UI slice: added compact `CloudCrawlPanelControl`, mounted `/?app=cloud-crawl`, forwarded `--max-concurrent` through the remote CLI, ran five parallel cloud target crawls to 25/25 pages, synced 25 responses into local `data/news.db`, and captured screenshot evidence with final `analysis.json ok=true`.
- 2026-05-08 — Tactical session `docs/sessions/2026-05-08-electron-crawl-10x1000/` promoted Cloud Crawl to the 10-site x 1000-page operator path: in-process Electron crawling was rejected after UI starvation, remote 10x1000 was relaunched, Electron displayed live progress, and a 5-second metadata sync path was validated with sub-second remote export/ingest rounds.
