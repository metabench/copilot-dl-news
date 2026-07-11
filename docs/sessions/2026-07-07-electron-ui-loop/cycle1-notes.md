# Electron UI Loop — Cycle 1: L1 GREEN, L2 started, L3 feasibility mapped

## ORIENT corrections

- `src/electron` does not exist. The Electron app is **`src/ui/electron/*`** — five apps (unifiedApp, crawlerApp, taskMonitor, backgroundTasksMonitor, placeHubGuessingApp); package.json scripts `electron:*`; electron pinned `^40.6.0`.
- `unifiedApp/main.js` (290 lines): spawns the unified UI server as a child (`node server.js --port N`, env DB_PATH + UI_ALLOW_MULTI_JOBS), waits for HTTP, wraps it in a BrowserWindow (contextIsolation on, nodeIntegration off). **Already ships `--smoke` and `--screenshot` modes with timeouts** — purpose-built for the L3 smoke test. No pre-existing tests.

## Sandbox display-stack probes (2026-07-07)

xvfb-run + Xvfb: PRESENT. Electron shared libs: ALL present EXCEPT **libgtk-3 (0 hits)** (libnss3/libasound/libatk/libcups/libdrm/libgbm/libxkbcommon all present). apt exists but uid 1003, no sudo → system installs impossible. Workaround for L3: download libgtk-3 .deb (+ small closure: libgdk-pixbuf, pango bits if missing) and `dpkg -x` extract user-space → LD_LIBRARY_PATH; no system modification.

## L1 — PROVEN (agent drives the UI over HTTP from the sandbox)

Boot: `cd /tmp/work && UI_ALLOW_MULTI_JOBS=true PORT=3123 NODE_PATH=/tmp/shim/node_modules node --require /tmp/work/cifix.js src/ui/server/unifiedApp/server.js`.
Evidence: `GET /` → 200, 105557B, `<title>Unified App Shell</title>`; `GET /api/apps` → 200; `GET /api/v1/crawl/availability?operations=true` → operation catalog (basicArticleCrawl + options schema); `POST /api/v1/crawl/operations/basicArticleCrawl/start` (fixture startUrl, overrides dbPath/maxDownloads=3) → jobId → polled running → **completed**; sample DB ledger: 2 http_responses rows. Fixture: `node /tmp/work/tools/crawl/local-fixture-server.js --preset small --port 41901` (use ABSOLUTE paths for backgrounded procs — cwd does not chain across `&`).

## L2 — first slice green

New `src/ui/electron/unifiedApp/__tests__/main.headless.test.js` (electron mocked virtual): 4/4 —
security prefs pinned; `--app`/`--url-path` URL contract; spawn contract (server entry path, --port, DB_PATH default, UI_ALLOW_MULTI_JOBS from --allow-multi-jobs); no-spawn with --use-existing-server. UNCOMMITTED. Remaining L2: the other four apps' main.js.

## Defect candidates / observations

1. Fixture crawl completed with content_storage=0 (2 fetches recorded) — fixture pages may not classify as articles; overlaps working-well-loop backlog #5 (scorecard vs PROGRESS anomaly). Diagnose before treating as engine bug.
2. Unified server warns `Failed to create router for remote-crawl-admin: Cannot find module '../remoteCrawlAdmin/server'` in the shadow — verify whether src/ui/server/remoteCrawlAdmin exists on host (shadow copy gap vs real repo defect).

## L3 plan (GATED — next run)

Downloads (~115MB total, named): electron v40.6.x linux-x64 zip via npm registry tarball/postinstall mirror (resumable ranged downloader, ~8-10 calls at trickle speed) + libgtk-3-0 .deb closure extracted to /tmp/gtklibs. Then: `xvfb-run -a electron main.js --port 3123 --use-existing-server --smoke --screenshot /tmp/l3.png --no-sandbox` with throwaway HOME; assert exit 0 + screenshot non-empty + renderer loaded. ldd the binary FIRST; abort with evidence if closure explodes.
