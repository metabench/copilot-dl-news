# Working Notes – Multi-modal crawl review and parallelization

- 2026-01-06 — Session created via CLI. Add incremental notes here.

## 2026-01-06 – Review & Refactor Notes

- Audited multi-modal crawl SQL usage; moved all SQL into SQLite adapter queries.
- Fixed multi-modal bugs:
  - `totalPatternssLearned` typo, `playookUpdates` typo.
  - Corrected invalid SQL assumptions (no `url_links`, no `content_analysis.url_id`).
  - Added `analysisVersion` wiring to analysis observable/direct analysis.
- Added multi-domain support via `MultiModalCrawlManager` and SSE server changes.
- Updated UnifiedShell client to handle multi-domain event payloads.
- Updated integration book chapters (Ch 4, Ch 8, Ch 16) with multi-modal coverage.
- Added tests:
  - `src/db/__tests__/multiModalCrawlQueries.test.js`
  - `src/crawler/multimodal/__tests__/MultiModalCrawlManager.test.js`

### Test Attempts

- `npm run test:by-path src/db/__tests__/multiModalCrawlQueries.test.js` → FAIL (`node: bad option --localstorage-file=...` in `jest_careful_runner.mjs`).
- `npm run test:file -- src/db/__tests__/multiModalCrawlQueries.test.js` → FAIL (Jest CLI flag mismatch: `testPathPattern` vs `testPathPatterns`).
- `npm run test:studio:by-path -- src/db/__tests__/multiModalCrawlQueries.test.js` → FAIL (Jest config error: setup file not found despite `tests/jest.setup.js` existing).

## 2026-01-06 – Multi-Modal Default + Hub Guessing

- Hardened Jest runner for unsupported `--localstorage-file` flags; updated `test:file` CLI flag; removed noisy `jest.setup` log.
- Multi-modal hub discovery now runs hub sequence + hub guessing, with priority batches and safer candidate filtering.
- CLI improvements: `tools/crawl-multi-modal.js` adds `--status-interval`, hub sequence/guessing flags, and `--quiet` output.
- Default crawl mode now uses multi-modal (`crawlDefaults.mode: "multi-modal"` + config).
- ADR recorded: `docs/decisions/2026-01-06-multi-modal-default.md`.
- Book chapters updated (Ch 4, Ch 16) for default mode + CLI options.

### Test Runs

- `npm run test:by-path -- src/db/__tests__/multiModalCrawlQueries.test.js src/crawler/multimodal/__tests__/MultiModalCrawlManager.test.js` → FAIL (better-sqlite3 invalid ELF header).
- `npm rebuild better-sqlite3` → FAIL (EACCES/EIO on Windows-mounted node_modules).
- `npm run test:by-path -- src/db/__tests__/multiModalCrawlQueries.test.js src/crawler/multimodal/__tests__/MultiModalCrawlManager.test.js` → PASS with skips (DB tests skipped due to better-sqlite3 not loadable in WSL).

### SQL Boundary Scan

- `rg -n "\\b(SELECT|INSERT|UPDATE|DELETE)\\b" src -g "*.js" -g "!src/db/**"` → many SQL statements remain in non-adapter modules (crawler, queue, background tasks, deprecated UI, tests). No migration performed in this pass.
