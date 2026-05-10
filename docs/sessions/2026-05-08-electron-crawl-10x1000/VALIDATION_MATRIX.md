# Validation Matrix: Electron Cloud Crawl 10x1000

| Check | Command / Evidence | Result |
| --- | --- | --- |
| Syntax: unified server | `C:\nvm4w\nodejs\node.exe --check src\ui\server\unifiedApp\server.js` | Passed; stray ternary syntax error fixed. |
| Syntax: remote CLI | `C:\nvm4w\nodejs\node.exe --check tools\crawl\crawl-remote.js` | Passed. |
| Syntax: remote server | `C:\nvm4w\nodejs\node.exe --check deploy\remote-crawler-v2\multi-domain-server.js` | Passed. |
| Profile expansion | `C:\nvm4w\nodejs\node.exe tools\crawl\index.js news-10x1000 --dry-run` | Expands to `crawl-remote.js run` with 10 domains, `--interval 5`, `--window 5`, `--limit 5`, `--prune-after-ingest`, `--no-backoff`. |
| Local fallback profile | `C:\nvm4w\nodejs\node.exe tools\crawl\index.js local-news-10x1000 --dry-run` | Expands to the old in-process `crawl-batch.js --preset news-10 ...` path. |
| Remote export indexes | Remote Node index verifier | All remote DB files checked had export-path indexes; timestamp query used `idx_urls_updated_at` or equivalent updated-at index. |
| Slow path baseline | Old sync task with `limit=500` and content enabled | 500-row full-content batches took 19-42s and timed out on some rounds. |
| Fast export benchmark | `C:\nvm4w\nodejs\node.exe tmp\_benchmark_remote_export.js 141.144.193.218:3200 since=2026-05-08T00:59:27Z limit=250 includeContent=false includeLinks=false` | `151ms`, 250 URLs, 68 responses, 0 content, 0 links, 154111 decoded bytes. |
| Exact-ID prune sync | `C:\nvm4w\nodejs\node.exe tools\crawl\crawl-remote.js sync --host 141.144.193.218:3200 --interval 1 --window 5 --limit 25 --rounds 1 --prune-after-ingest --no-backoff` | Corrected deployed path confirmed 25 URLs / 22 responses / 22 content / 1370 links locally, then pruned exactly 22 responses, 22 content rows, and 1370 links remotely. |
| Live confirmed-prune cadence | `npm run crawl -- news-10x1000` | With profile `limit=5`, after two heavy backlog batches, rounds 3-9 fetched in about `391-1103ms`, ingested in `16-53ms`, and pruned exact payloads every 5s. |
| Adaptive batching unit tests | `npm run test:by-path -- tests\tools\crawl\adaptive-sync-batching.test.js` | Passed: 7 tests, 1 suite, `EXIT_CODE=0`. |
| Adaptive profile dry-run | `C:\nvm4w\nodejs\node.exe tools\crawl\index.js news-10x1000 --dry-run` | Passed: expands to `--limit 5 --adaptive-limit --target-sync-ms 5000 --min-limit 1 --max-limit 25 --prune-after-ingest`. |
| Remote health after deploy | `C:\nvm4w\nodejs\node.exe tools\crawl\crawl-remote.js health --host 141.144.193.218:3200 --json` | Healthy, 10 domains, 4 running, 8058 stored immediately after API server deploy/restart; final check later showed 3 running and 9192 stored. |
| Electron Cloud Crawl launch | `npm run electron:cloud-crawl` | Electron unified app running on Cloud Crawl view. |
| Screenshot capture | `C:\nvm4w\nodejs\node.exe scripts\ui\capture-unified-crawl-display.js --base-url http://127.0.0.1:3170 --output docs\sessions\2026-05-08-electron-crawl-10x1000\screenshots --save-screenshots --save-dom-snapshots` | `ok: true`; desktop/mobile Cloud Crawl loaded with no horizontal overflow. |

Residual risk:
- The exact prune lane now protects future cleanup by requiring exported URL IDs. One earlier validation used watermark pruning before the correction; do not reintroduce watermark-only prune into automated crawler workflows.
