# Plan: Electron 500 Download Crawl

Objective: Use the Electron unified app as the visible crawl/download UI and verify at least 500 new local 200-status downloads per site for eight major news websites.

Done when:
- Electron unified app is launched in long-lived mode and remains open after crawl completion.
- Baseline timestamp is recorded before the 500-run.
- Eight major news websites are crawled remotely with enough page budget to exceed 500 local OK downloads each.
- Remote data is synced/pulled into `data/news.db`.
- Local DB verification shows at least 500 new `http_status = 200` downloads per selected host.
- UI evidence is captured from the Electron-backed app/server while the app remains loaded.

Change set:
- `docs/sessions/2026-04-29-electron-500-download-crawl/*`
- `docs/sessions/SESSIONS_HUB.md`
- Possible session/local verification script only if needed.

Risks/assumptions:
- Some domains that handled 300 pages may still need higher remote caps and multiple pull batches before local counts cross 500.
- Electron default long-lived mode should remain open unless run with `--smoke` or `--screenshot`; this run will avoid those flags.
- Remote sync backlog can lag behind remote completion; explicit large pulls may be needed.

Operational workflow:
- Electron UI branch: launch `npm run electron:unified -- --url-path /?app=downloads --port <port>` without smoke/screenshot flags.
- Crawl branch: remote v2 bounded crawl plus local sync/pull verification.

Tests/checks:
- Electron process still running after crawl completion.
- Remote status/health snapshots.
- Per-host local DB delta check with target 500.
- UI screenshot/analysis evidence from the Electron app's localhost server.
