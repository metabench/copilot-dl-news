# Electron UI Loop — Cycle 2: L3 PROVEN — real Electron runs in the sandbox

## L3 — PROVEN (2026-07-07)

Real Electron **40.6.0** (sha256-verified `900e5b74…36cc7` against mirror SHASUMS) boots under Xvfb in the sandbox, loads the unified UI, and captures a screenshot: exit 0, `cycle2-l3-smoke.png` (87KB) shows the full **Unified Control Center** — sidebar (Home, Cloud Crawl, Rate Limits, Crawl Observer, Crawl Status, Multi-Modal Crawl, Scheduler, Crawler Profiles, Domain Registry, Crawl Strategies, Crawler Monitor, Webhooks, Plugins, Admin), dashboard stats, Recent Crawl Activity table. The agent can now run and SEE the actual desktop app from the sandbox.

### Working recipe (all user-space, no root)

- Binary: parallel ranged downloader `/tmp/pdl.js` (10 conns × 2MB chunks) from `https://registry.npmmirror.com/-/binary/electron/40.6.0/electron-v40.6.0-linux-x64.zip` — **108MB in ONE 33s call** (npmmirror CDN is fast; nodejs.org/github are the slow hosts). Unzipped at `/tmp/electron/`.
- Libs: only libgtk-3 + libXdamage were missing → `dpkg -x`-style extraction (`ar x` + `tar -xf data.tar.*`) of `libgtk-3-0_3.24.33-1ubuntu2.2_amd64.deb` + `libxdamage1_1.1.5-2build2_amd64.deb` into `/tmp/gtklibs` → `ldd` missing-count 0.
- Smoke: boot UI server (port 3123), then
  `HOME=/tmp/ehome LD_LIBRARY_PATH=/tmp/gtklibs/usr/lib/x86_64-linux-gnu xvfb-run -a /tmp/electron/electron /tmp/work/src/ui/electron/unifiedApp/main.js --no-sandbox --disable-gpu --port 3123 --use-existing-server --smoke --screenshot /tmp/l3.png`
  main.js's built-in `--smoke`/`--screenshot` modes did exactly their job (exit 0 on did-finish-load, 1 on fail/timeout).
- Everything under /tmp is session-scoped: rebuild after reset = ~4 calls with this recipe.

## Defects / observations

1. **REAL DEFECT — dead router registration**: `src/ui/server/unifiedApp/server.js` registers a `remote-crawl-admin` router from `../remoteCrawlAdmin/server`, but `src/ui/server/remoteCrawlAdmin/` does not exist in the repo (verified host-side). Every boot logs an error-level warn. `tools/crawl/run.js` also references app id `remote-crawl-admin` (~line 1446). Fix options: (a) remove registration + run.js reference (if feature was abandoned), (b) guard with existsSync + downgrade to debug log (if planned). Needs a 1-line intent call; either fix is bounded + testable.
2. Fixture crawl `content_storage=0` despite 2 ledger fetches (carried from c1) — still to diagnose (classification vs writer).
3. Sandbox has no icon/emoji fonts — UI text renders fine, icon glyphs show as tofu boxes in screenshots. Environmental; if screenshots become regression evidence, extract a fonts .deb (fonts-noto-color-emoji) the same way.

## Screenshot-as-evidence pattern

`--screenshot` + host-side `Read` of the PNG = the agent visually verifies UI state. Use for future UI regression checks (screenshot per cycle, compare).

## Remaining

L2: headless contract tests for the other four app mains (crawlerApp, taskMonitor, backgroundTasksMonitor, placeHubGuessingApp). L4 checklist now tiny: Windows packaging/installer (electron-builder), native menus/tray behavior, real-GPU rendering, proper font stack — everything else is sandbox-provable.
