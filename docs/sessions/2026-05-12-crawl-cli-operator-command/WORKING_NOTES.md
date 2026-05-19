# Working Notes: Crawl CLI Operator Command

## 2026-05-12 Kickoff

- User asked to review the last crawl phase for better CLI tooling that does more in one command, ensures prerequisites are ready, and prints clearer terminal output about setup and features.
- Ownership: active implementation is in `copilot-dl-news`; future runtime ownership still points toward `news-crawler-itself`.
- Prior phase pain points:
  - Local DB/native SQLite setup had to be diagnosed manually before sync could work.
  - Remote health/status, domain registration, crawl start, sync/drain, prune, and local verification were separate operator steps.
  - The previous command output did not make the active features obvious enough: pruning mode, adaptive batching, storage budget, ledger/watermark files, local DB path, and verification target.
  - Final proof required a hand-written SQL query to count successful non-empty pages per host.
- Intended implementation shape: add a higher-level `collect` command to `tools/crawl/crawl-remote.js` and improve human output with colour and emojis while leaving JSON output machine-stable.

## 2026-05-12 Implementation Notes

- Added `collect` to `tools/crawl/crawl-remote.js`:
  - preflights remote health/status and local DB setup;
  - registers missing remote domains;
  - starts target hosts with a crawl-friendly default oversample cap (`target-pages * 1.5` when `--max-pages` is omitted);
  - runs export sync with confirmed ingest and exact-ID prune enabled by default;
  - verifies local successful stored downloads by host after sync rounds;
  - stops target crawls once the local completion threshold is met, then drains empty export rounds.
- Added coloured/emoji human output for setup, remote, DB, target, sync, prune, ledger, verification, stop/drain, and error states. `--json` remains raw machine output; `--no-color` and `--no-emoji` are available for plain terminals.
- Security/boundary correction after user review:
  - Removed ad hoc SQL from `tools/crawl/crawl-remote.js`.
  - Moved local setup inspection and per-host successful-download verification into `news-crawler-db` `SqliteRemoteCrawlerAccess`.
  - Host inputs are normalized conservatively, invalid hosts are ignored, SQL is fixed-shape prepared statements only, and `LIKE` host matching escapes `%`, `_`, and `\`.
  - `since` markers are parsed before querying; invalid markers throw instead of becoming broad/ambiguous SQLite datetime comparisons.
- Validation:
  - `news-crawler-db`: `npm run build` passed.
  - `news-crawler-db`: `npx vitest run src/db/__tests__/unit/sqlite/remoteCrawler.test.ts` passed (`6` tests).
  - `copilot-dl-news`: `node --check tools/crawl/crawl-remote.js` passed.
  - `copilot-dl-news`: DB module runtime export smoke check passed for `getRemoteCrawlerLocalSetupSnapshot` and `listRemoteCrawlerSuccessfulDownloadCountsByHost`.
  - `copilot-dl-news`: `npm run test:by-path -- tests/tools/crawl-remote-bounded.test.js tests/tools/crawl/crawl-backend.test.js` passed (`26` tests).

## 2026-05-12 Agent-Observable Guardian/BBC Profile

- Added `tools/crawl/profiles/remote-guardian-bbc-10-agent.json`.
  - Runs `remote collect` for `theguardian.com,bbc.com`.
  - Targets `10` locally verified successful stored pages per host.
  - Writes structured JSONL telemetry to `data/crawl-agent-runs/remote-guardian-bbc-10-{ts}.jsonl`.
  - Enables start retries and a status-failure guard so small validation runs fail with diagnostics rather than spinning.
- Added richer collect telemetry:
  - Remote start retry events and request timings.
  - Per-batch remote fetched time range, remote downloaded bytes/rate, remote-to-local raw/decoded bytes/rate, local saved time, ingest time, confirm/prune time, and batch limit.
  - Empty-round telemetry for agent analysis.
  - Final diagnostics for below-target runs.
- Live run command:
  - `node tools/crawl/index.js profile remote-guardian-bbc-10-agent`
- Live run result:
  - Start attempt 1 failed with `ECONNRESET` / `socket hang up`; attempt 2 succeeded.
  - Three export rounds returned no URL/content rows.
  - Four verification status checks failed with `socket hang up`.
  - The status guard exited after 3 empty rounds and 3 status-check failures.
  - Final verification was `0/2` hosts at `10+` pages, with `0` URL rows and `0` content rows pulled.
  - Agent log: `data/crawl-agent-runs/remote-guardian-bbc-10-2026-05-12T23-01-49-986Z.jsonl`.
- Post-run remote status:
  - Orchestrator idle, `0` currently running.
  - `bbc.com`: stopped, `fetched=0`, `pending=0`, existing stored content `185`.
  - `theguardian.com`: stopped, `fetched=0`, `pending=0`, existing stored content `1361`.
- Interpretation:
  - The CLI wrapper is now giving useful evidence, but the remote crawler did not perform a fresh crawl.
  - The target domains appear exhausted/empty on the remote node: they stop immediately with no pending URL queue.
  - Existing remote content predates the run's `since` marker, so it is not exported as new crawl output.
- Recommended next tooling:
  - Add a non-destructive requeue/reseed command for small validation crawls.
  - Add a pre-start queue diagnostic showing pending seed count, done count, newest `fetched_at`, newest stored content timestamp, and whether start will no-op.
  - Add request IDs and retry/backoff around status checks, not just start.
  - Surface remote API request latency/error codes in a single per-run summary table.
  - For validation profiles, consider `max-pages` above `target-pages` so redirects, blocked pages, duplicates, and empty bodies do not prevent reaching the target.

## 2026-05-13 Depth-4 Frontier Follow-Up

- Reviewed the remote v2 worker path for the "front page already downloaded" failure mode.
  - `run-worker.js` seeded front pages with `INSERT OR IGNORE`.
  - If a seed URL was already present as `done`, it did not become pending again.
  - If no other pending URLs existed, the worker exited without downloading anything.
  - Link following was hardcoded to `row.depth < 2`, so even when deeper hub/article paths existed the worker could not explore beyond depth 2.
- Added DB-owned frontier promotion in `news-crawler-db`.
  - `insertPendingRemoteCrawlerUrl` now reports whether a URL was actually inserted or already known.
  - `enqueueRemoteCrawlerDiscoveredLinksForDomain` promotes targets from completed hub/source pages into pending URLs only when those target URLs are not already known.
  - This avoids destructive reset/requeue behavior and keeps SQL inside the DB module.
- Updated remote worker/server behavior.
  - `run-worker.js` accepts `--max-depth`, tracks seed/new/known frontier counters, and calls DB-owned discovered-link promotion when pending work is empty.
  - `multi-domain-server.js` forwards `maxDepth`, domain seed URLs, and uses argument-array PM2 spawning instead of shell-building the start command.
  - `/api/seed` now queues only not-yet-known seed URLs through the DB adapter.
- Updated `remote-guardian-bbc-10-agent`.
  - Target remains `10` verified new local saves per host.
  - Remote cap is now `30` downloads per host so failures/duplicates/hubs do not prevent reaching 10 successful stored pages.
  - Remote depth is `4`.
  - Adds Guardian and BBC front/place/topic hub URLs as domain-specific frontier seeds.
- CLI output now reports:
  - remote depth and hub seed setup;
  - that the download target counts new local saves after the since marker;
  - frontier rows showing seed new/known, discovered new/known, pending count, and no-new reason when remote status includes it.
- Validation:
  - `news-crawler-db`: `npm run build` passed.
  - `news-crawler-db`: `npx vitest run src/db/__tests__/unit/sqlite/remoteCrawler.test.ts` passed (`7` tests).
  - `copilot-dl-news`: syntax checks passed for `tools/crawl/index.js`, `tools/crawl/crawl-remote.js`, `deploy/remote-crawler-v2/lib/run-worker.js`, and `deploy/remote-crawler-v2/multi-domain-server.js`.
  - `copilot-dl-news`: profile dry-run shows shell-quoted seed map and includes `--max-depth 4`.
  - `copilot-dl-news`: `npm run test:by-path -- tests/tools/crawl-index.test.js tests/tools/remote-crawler-server-config.test.js tests/tools/crawl-remote-bounded.test.js tests/tools/crawl/crawl-backend.test.js` passed (`46` tests).
- Operational note:
  - These runtime changes need to be deployed/restarted on `crawl-server-v4` before the live Oracle remote can honor `maxDepth`, seed URL maps, and frontier telemetry.

## 2026-05-13 Remote Server Deploy Tooling

- Reviewed existing deployment paths:
  - `scripts/deploy-remote.js` and `scripts/remote-deploy.sh` tar/scp `deploy/remote-crawler-v2` and restart `crawl-server-v4`, but do not check whether the crawler is busy before stopping it.
  - `tools/dev/remote-deploy.js` is a generic dry-run-first SSH/SCP helper, but its directory deployment path is intentionally limited and it does not know the crawler server package shape.
  - The remote v2 runtime imports `src/db/openNewsCrawlerDb.js`, which resolves `news-crawler-db`; the deploy package needs to include the compiled DB adapter, not only the server files.
- Added `tools/crawl/deploy-remote-server.js`.
  - Default is dry-run with `/api/status` busy check.
  - `--build-only` builds the local tarball without remote changes.
  - `--apply` builds, uploads, preserves remote `data/`, overwrites application code, installs production dependencies, and restarts PM2 `crawl-server-v4`.
  - If the server is busy, it exits without stopping/overwriting and prints a rerun command with `--apply --force`.
  - `--force` is required to intentionally interrupt active crawl work.
- Package shape:
  - `deploy/remote-crawler-v2/**`
  - `src/db/openNewsCrawlerDb.js`
  - vendored `news-crawler-db/dist/db/**`
  - generated production `package.json` with `express`, `better-sqlite3`, `drizzle-orm`, `dotenv`, `pg`, `postgres`, `lang-tools`, and local `news-crawler-db`.
- Wired the tool into `tools/crawl/index.js` as `remote-deploy`, so `npm run crawl -- remote-deploy --apply` works.
- Validation:
  - `node --check tools/crawl/deploy-remote-server.js` passed.
  - `node --check tools/crawl/index.js` passed.
  - `npm run test:by-path -- tests/tools/remote-crawler-deploy.test.js tests/tools/crawl-index.test.js` passed (`25` tests).
  - Dry-run against live `/api/status` reported the remote as idle and made no changes.
  - `node tools/crawl/deploy-remote-server.js --build-only --skip-busy-check --no-color --no-emoji` built `tmp/remote-crawler-v2-deploy/remote-crawler-v2-deploy.tar.gz` (`543 KiB`) without touching the remote.
  - JSON dry-run and JSON build-only modes were parsed successfully by downstream `JSON.parse`, so agent/machine consumers can call the deploy planner without scraping human output.

## 2026-05-13 Runner-Integrated Deploy-If-Needed

- Added timestamp build tracking to the deploy package.
  - Local builds write `tmp/remote-crawler-v2-deploy/build-manifest.json`.
  - The manifest records `buildId`, `builtAt`, `builtAtMs`, and the newest mtime across remote crawler source plus `news-crawler-db` source.
  - `--if-needed` reuses the local tarball when the manifest is newer than all tracked source files; otherwise it rebuilds.
- Added remote build metadata exposure.
  - Generated packages include `deploy/remote-crawler-v2/build-info.json`.
  - `multi-domain-server.js` exposes that object as `build` from `/api/status` and `/api/health`.
  - `deploy-remote-server.js --if-needed --apply` compares local `builtAtMs` with remote `build.builtAtMs` and skips deployment when remote is current.
- Integrated the preflight into runner entry points.
  - `tools/crawl/run.js` now runs the deploy-if-needed preflight before `--remote` batch launches.
  - `tools/crawl/index.js` now runs it before start-like `remote` tool commands/profiles (`launch`, `bounded`, `run`, `collect`, `start`).
  - Status/read-only remote commands do not run the deploy preflight.
  - Flags: `--remote-deploy auto|never|always`, `--no-remote-deploy`, `--remote-deploy-force`, `--remote-deploy-ssh-host`, `--remote-deploy-ssh-user`, `--remote-deploy-ssh-port`, `--remote-deploy-ssh-key`, `--remote-deploy-status-url`, `--remote-deploy-skip-db-build`.
- Live/non-destructive checks:
  - `node tools/crawl/deploy-remote-server.js --build-only --if-needed --skip-db-build --json` reused local build `20260512235636` and reported 533 tracked source files.
  - Dry-run profile and remote explain commands remain clean and do not deploy.
  - An intentional JSON apply probe reached SSH but failed before upload with `Permission denied (publickey)` for `ubuntu@141.144.193.218`; no remote files were changed. Automatic deploy now needs a working SSH target/key via env or CLI flags.
- Validation:
  - Syntax checks passed for deploy tool, preflight helper, run/index CLIs, and remote server.
  - `npm run test:by-path -- tests/tools/remote-crawler-deploy.test.js tests/tools/remote-deploy-preflight.test.js tests/tools/crawl-index.test.js tests/tools/crawl/run.test.js tests/tools/remote-crawler-server-config.test.js` passed (`91` tests).
  - `git diff --check` passed for the touched files.
