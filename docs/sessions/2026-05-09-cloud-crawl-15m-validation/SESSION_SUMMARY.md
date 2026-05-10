# Session Summary – Cloud Crawl 15m Validation

## Accomplishments
- Added the strict cloud crawl e2e validator (`tools/crawl/cloud-crawl-e2e.js`) plus reusable validation math, benchmark, and diagnostics helpers.
- Added profile `news-10x1000-15m-e2e`, npm script `crawl:e2e:15m`, and crawl launcher aliases/help so operators have a one-command 15-minute validation path.
- Wired `crawl-remote run` into the append-only sync ledger lifecycle and deployed the remote `/api/throttle` endpoint to `oracle-worker`.
- Fixed live edge cases found by validation: SQLite timestamp evidence windows, superseded unconfirmed ledger entries, and non-regressing ledger watermarks during targeted recovery pulls.

## Metrics / Evidence
- Final live artifact: `docs/sessions/2026-05-09-cloud-crawl-15m-validation/artifacts/cloud-crawl-e2e-2026-05-09T23-58-42-010Z.json`.
- Final result: PASS, live mode, elapsed 879100ms under the 900000ms cap.
- DB deltas: 141 URLs, 1937 responses, 1909 successful responses, 28 failed responses, 1937 content rows.
- Recent evidence: 141 downloads, 140 successes, 1 failure, 513111806 bytes, 4 distinct hosts.
- Benchmark: 132.20 downloads/min, 130.29 successes/min, 132.20 content rows/min; p50/p95 fetch 1363/3472ms, ingest 244/582ms, round 1794/4343ms.
- Ledger: unconfirmed 0, unpruned 0, completed 145, last watermark `2026-05-10 00:01:21`.
- Final focused tests: `data/test-results/run-2026-05-10-001517784-66f8d.json`, 4 suites passed, 35 tests passed.

## Decisions
- Use `/api/throttle` as a required preflight contract for live validation so storage pressure controls are not silently absent.
- Treat superseded unconfirmed ledger entries as non-blocking only when every URL id is covered by a later confirmed/pruned batch.
- Preserve the newest ledger/watermark cursor when targeted recovery pulls revisit older `--since` windows.

## Next Steps
- Backfill the missing workflow registry docs referenced by repo instructions; see `FOLLOW_UPS.md`.
- Consider adding a first-class ledger recovery command for superseded unconfirmed entries instead of relying on targeted sync plus summary logic.
