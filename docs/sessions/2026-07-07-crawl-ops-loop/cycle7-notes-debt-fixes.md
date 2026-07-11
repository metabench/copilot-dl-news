# Crawl Ops — Cycle 7 (2026-07-10): both engineering debts FIXED and PROVEN

## 1. Worker-mode job execution — the API-starvation fix

**Change:** `InProcessCrawlJobRegistry` gains a worker path (env `UI_CRAWL_WORKER=1`, or `workerMode` option; bridge `start-ui {workerMode:true}` sets it). Each operation crawl runs in a forked child (`crawl-operation-worker.js`); the child hooks the crawler's telemetry events with a shim and forwards them over IPC; the parent replays them onto a stand-in EventEmitter connected to the real CrawlTelemetryBridge — so the UI's live progress is identical. Stop → IPC message → `crawlerRef.stopAsync` in the child, with a 30s kill escalation. Failure reasons persist on the job record as before. Job records report `mode: "worker"`.

**Proof (live, 2026-07-10 ~20:33Z):** guardian 15pp worker job `daa0030a` — `mode:worker`, ran in child (PAGE/PROGRESS in log), **API latency DURING the crawl: avg 6ms, max 42ms, 0 failures** (in-process baseline: 15-20s stalls, timeouts), telemetry history live (crawl:progress items with the jobId — UI visibility confirmed), job **completed, error:none**. Existing registry suite 4/4 (in-process path untouched).

Rollout note: worker mode is opt-in via env. To make it the default, flip the env default in the registry constructor after a few more campaigns — in-process path remains as fallback.

## 2. Dead `fetches` readers

`throughput-meter.js` and `crawl-progress-monitor.js` now pick whichever of `http_responses`/`fetches` actually holds rows (fetches unpopulated since ~2026-03) and use `datetime()`-normalized timestamp comparisons. Monitor suite 24/24.

## Deferred (unchanged)

Depth-2 spec-purity L4 rep and fixture article-path storage proof (minor); screenshot regression harness; Windows-only Electron checklist. Commit manifest updated with groups 9-10.
