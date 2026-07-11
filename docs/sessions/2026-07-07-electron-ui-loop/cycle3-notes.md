# Electron UI Loop — Cycle 3: defect fixed, L2 complete, scorecard mystery solved

## 1. FIXED — dead remote-crawl-admin registration (UNCOMMITTED)

`src/ui/server/unifiedApp/server.js`: added `fs` import; the remote-crawl-admin module entry now carries `requiresModulePath` and the modules array filters entries whose source is absent, logging one info-level "Skipping optional module" line instead of an error-level failure every boot. Boot-verified in shadow: `/api/apps` 200, old error-warn count 0, clean skip line present. (`tools/crawl/run.js` still references the app id ~line 1446 — harmless, but remove together with the entry if the feature is confirmed abandoned.)

Mount gotcha (recurred): after host-side edits, the VM mount served the new content truncated to the OLD byte length (file ends mid-line). Repair: delete the partial last line VM-side, append the missing tail from a host-side Read. Same failure mode as c15's sitemap.js.

## 2. L2 COMPLETE — all app mains under contract tests

New `src/ui/electron/__tests__/appMains.contract.test.js` (static, parametrized over every `<app>/main.js` — six apps found incl. trayMonitor): window security prefs locked (contextIsolation true, nodeIntegration false, no webSecurity:false), referenced preload scripts exist, and every preload-invoked IPC channel has a matching `ipcMain.handle/on`. **18 passed, 1 skipped** (an app that constructs no windows). Dynamic coverage for unifiedApp remains from c1 (4/4). UNCOMMITTED.

## 3. DIAGNOSED — content_storage=0 + the false-FAIL scorecard (cross-loop root cause)

Fixture crawl stored nothing because only robots + the 823-byte fixture ROOT (hub page) were fetched — hub pages aren't article content; expected behavior, not a writer bug. (Open sub-question: why link-following stopped before maxDownloads=3 on the fixture — likely tiny preset/link classification; low priority.)

The deeper find: **the `fetches` table is NEVER populated** (0 rows in every sample DB; writers land in `http_responses`). `tools/crawl/lib/sample-db-signals.js` handles the drift for the download count (line ~243 picks http_responses when fetches is empty) but **host-coverage (line ~294) reads `FROM fetches` unconditionally** — and throughput-meter.js/crawl-progress-monitor.js also read `fetches`. Consequence: crawls that demonstrably succeeded score FAIL on host coverage — c15.db has http_responses:12 AND content_storage:3 (the Guardian articles WERE stored) yet the c15 runs scored "0 downloads / 0 hosts". **This resolves working-well-loop backlog #5** — the fix (point those readers at http_responses, or populate fetches) belongs to that loop; its scorecard-based verdicts from c15 should be re-read as PASSES.

## L4 checklist (draft — Windows/operator-side only)

Everything else is sandbox-provable. Remaining for Windows: electron-builder packaging + installer smoke; native menu/tray behavior (trayMonitor especially); real-GPU rendering (sandbox runs --disable-gpu); proper font stack (icon glyphs tofu in sandbox); auto-update flow if configured.

## Loop status

L1 GREEN · L2 COMPLETE (dynamic + static) · L3 PROVEN · L4 drafted above. Uncommitted work: c1 test file, c3 test file, server.js guard fix. Remaining backlog: optional fonts extraction; operator commit gate.
