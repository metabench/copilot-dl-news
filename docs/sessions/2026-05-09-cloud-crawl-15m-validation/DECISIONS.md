# Decisions – Cloud Crawl 15m Validation

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2026-05-09 | Live cloud validation needs storage pressure/backpressure safety. | Require remote `/api/throttle` to pass preflight before live e2e runs. | Live run blocks when throttle is missing instead of silently crawling without backpressure controls. |
| 2026-05-10 | SQLite stores `fetched_at` as `YYYY-MM-DD HH:MM:SS`, while the validator's run bounds are ISO strings. | Normalize evidence query windows to SQLite UTC timestamp strings. | Host-spread/failure-ratio checks now agree with DB deltas during live validation. |
| 2026-05-10 | Targeted recovery pulls can revisit older remote windows after a failed/interrupted sync. | Preserve the newest ledger/watermark cursor and treat unconfirmed entries superseded by confirmed/pruned URL ids as non-blocking. | Recovery pulls no longer regress future sync cursors or poison e2e validation after data was safely recovered. |
