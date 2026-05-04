# Working Notes

## 2026-04-29 Kickoff
- User requested a UI-visible crawl with at least 250 new downloaded pages for each of eight major news websites.
- Loaded command/crawl docs and confirmed current canonical distributed path is `tools/crawl/crawl-remote.js` via `npm run crawl -- remote ...`.
- `docs/workflows/WORKFLOW_REGISTRY.md` and `docs/workflows/continuous-crawl-repair-loop.md` were referenced by instructions but are absent; continuing with `tools/crawl/AGENT.md` and repo index guidance.

- 2026-04-29 20:27 — 
## Session Memory
- docs-memory MCP health check passed before operational work.
- No prior matching session found for eight-site 250-download UI crawl.

- 2026-04-29 20:28 — 
## Remote Status
- `node tools/crawl/crawl-remote.js status` reached `141.144.193.218:3200`.
- Server version 4.0.0, schema 4, orchestrator idle, concurrency 0/1.
- Only `bbc.com` was registered initially; eight target domains will be registered explicitly.

- 2026-04-29 20:29 — 
## UI Startup
- Unified jsgui3 UI started at `http://localhost:51012`.
- Downloads app route: `http://localhost:51012/?app=downloads`.
- Crawl Status app route: `http://localhost:51012/?app=crawl-status`.
- Optional `remote-crawl-admin` router is missing (`../remoteCrawlAdmin/server`), so this run uses CLI remote control plus working UI download/crawl panels.

- 2026-04-29 20:31 — 
## Baseline
- Selected sites: `bbc.com`, `reuters.com`, `apnews.com`, `aljazeera.com`, `theguardian.com`, `npr.org`, `abcnews.go.com`, `cbsnews.com`.
- Run-start timestamp for "new downloads": `2026-04-29T20:29:44.133Z`.
- Baseline check with `host-download-delta.js` showed 0 new downloads for all eight sites.

- 2026-04-29 20:36 — 
## First Pass Findings
- First bounded pass completed in 112.4s.
- Remote reached 300 fetched pages for `bbc.com`, `aljazeera.com`, `theguardian.com`, and `cbsnews.com`.
- `reuters.com`, `npr.org`, and `abcnews.go.com` stopped almost immediately; `apnews.com` stored many rows but had mostly non-200 local responses.
- Seed calls for Reuters/NPR/AP/ABC returned zero inserted, so a second pass will use replacement major outlets rather than spend the crawl budget on blocked/shallow domains.

- 2026-04-29 20:46 — 
## Final Verification
- Final local verifier command: `node docs/sessions/2026-04-29-eight-site-250-download-crawl/host-download-delta.js --since 2026-04-29T20:29:44.133Z --sites "bbc.com,aljazeera.com,theguardian.com,cbsnews.com,nbcnews.com,france24.com,euronews.com,independent.co.uk"`.
- Result: `allMet250: true`.
- Counts (`ok` 200-status downloads since baseline):
  - `bbc.com`: 298
  - `aljazeera.com`: 272
  - `theguardian.com`: 294
  - `cbsnews.com`: 285
  - `nbcnews.com`: 296
  - `france24.com`: 298
  - `euronews.com`: 300
  - `independent.co.uk`: 294
- UI screenshot command: `npm run ui:crawl-display-screenshots -- --base-url http://localhost:51012 --output screenshots/eight-site-250-download-crawl`.
- UI result: `ok: true`; screenshots at `screenshots/eight-site-250-download-crawl/downloads.png` and `screenshots/eight-site-250-download-crawl/crawl-status.png`.
- Remote final status: orchestrator idle, no continuous sync process running.

- 2026-04-29 20:47 — 
## Operational Notes
- The first selected set included blocked/shallow sites (`reuters.com`, `apnews.com`, `npr.org`, `abcnews.go.com`). They were not used for final success counts.
- Successful final eight: `bbc.com`, `aljazeera.com`, `theguardian.com`, `cbsnews.com`, `nbcnews.com`, `france24.com`, `euronews.com`, `independent.co.uk`.
- `fetched_at` in local SQLite uses `YYYY-MM-DD HH:mm:ss`, so ISO baseline timestamps must be normalized before string comparisons.
- PowerShell requires the comma-separated `--sites` value to be quoted; otherwise arguments may be split/handled strangely.

- 2026-04-29 20:47 — 
## Tooling Gap
- Existing `db-downloads --hosts --since --host` can verify one host/pattern at a time, but this task needed a multi-site pass/fail verifier. Session-local `host-download-delta.js` filled the gap.

- 2026-04-29 20:47 — 
## UI Evidence
- The unified app remains running at `http://localhost:51012` for user inspection.
- Downloads route screenshot: `screenshots/eight-site-250-download-crawl/downloads.png`.
- Crawl Status route screenshot: `screenshots/eight-site-250-download-crawl/crawl-status.png`.
- Screenshot analysis: no horizontal overflow, no iframe loading text, no serious browser events.

- 2026-04-29 20:47 — 
## Durable Lessons Candidate
- Remote crawls that complete quickly can still require several explicit `pull --limit 5000` batches before local DB evidence reaches target counts.
- Multi-site download verification should normalize ISO run baselines to SQLite `fetched_at` format before using string comparisons.

- 2026-04-29 20:47 — 
## Final Process State
- Remote status confirmed orchestrator `IDLE`.
- Continuous sync process check confirmed no `crawl-remote.js sync` process running.
- `host-download-delta.js` diagnostics: no errors found.

- 2026-04-29 20:48 — 
## Summary Draft
- Eight-site crawl success is based on local `http_responses` rows with `http_status = 200` after baseline, not remote fetched counters alone.

- 2026-04-29 20:48 — 
## Evidence Paths
- Screenshot analysis JSON: `screenshots/eight-site-250-download-crawl/analysis.json`.
- Session-local verifier: `docs/sessions/2026-04-29-eight-site-250-download-crawl/host-download-delta.js`.

- 2026-04-29 20:48 — 
## Closing
- Ready to finalize session docs and report the outcome.

- 2026-04-29 20:48 — 

- 2026-04-29 20:48 — 

- 2026-04-29 20:48 — 
