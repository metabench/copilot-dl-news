# Working Notes – Verify 1000-download test counts real downloads

- 2026-01-02 — Session created via CLI. Add incremental notes here.

- 2026-01-02 18:11 — 
## 2026-01-02
- Tightened `tests/e2e-features/guardian-1000-page-crawl-persists-to-db.e2e.test.js` to prove **real downloads**, not just URL rows: require `http_status=200`, `bytes_downloaded>0`, and `fetched_at IS NOT NULL` for `/page/%` URLs.
- Validation: ran `npm run test:by-path -- --silent tests/e2e-features/guardian-1000-page-crawl-persists-to-db.e2e.test.js` → PASS.
  - Test Studio run: `data/test-results/run-2026-01-02-180831838-14cda.json` (test duration 40.8s).

- 2026-01-02 18:30 — 
- Ran Test Studio UI (headful) Puppeteer E2E to visually show rerun progress while executing the 1000-download DB test:
  - Command: `PUPPETEER_HEADFUL=1 PUPPETEER_PAUSE_MS=15000 PUPPETEER_OUTPUT_DIR=testlogs/ui-e2e-headful3 npm run test:by-path -- tests/ui/e2e/test-studio-guardian-1000-db-rerun.puppeteer.e2e.test.js`
  - Result JSON: `data/test-results/run-2026-01-02-182831821-08d33.json` (PASS)
  - UI artifacts: `testlogs/ui-e2e-headful3/test-studio-guardian-1000-db-2026-01-02T18-28-32-842Z/` (includes `running.png` + `final.png`).
