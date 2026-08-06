# The `urls` table has eight insert shapes across two repos

**Date:** 2026-08-05 (cycle 219)
**Status:** two writers fixed; the wider divergence is OPEN
**Measured on:** live `data/news.db`, read-only

## The measurement

`urls` is the most central table in the schema — 1,867,208 rows, referenced by
`article_places`, `place_hubs`, `place_hub_unknown_terms`, `http_responses` and
more. Its column fill rates:

| column | NULL rows | share |
|---|---|---|
| `host` | 91,013 | 4.9% |
| `last_seen_at` | 90,088 | 4.8% |
| `created_at` | 71,318 | 3.8% |
| `canonical_url` | 1,844,172 | 98.8% |

17,460 distinct non-null hosts are present, so `host` is a column the system
genuinely uses — the 91,013 gaps are absences, not an unused field.

## The cause is structural, and only partly attributable

At least **eight different insert shapes** write to this table:

| shape | where |
|---|---|
| `(url, host, created_at, last_seen_at)` | copilot `HttpRequestResponseFacade` |
| `(url, created_at)` | copilot `UrlResolver`, `PostgresUrlResolver`, ncdb `legacy-SQLiteNewsDatabase`, ncdb `postgresV1-analysisAnalysePagesCore` |
| `(url)` | ncdb `coverageDatabase`, ncdb `legacy-patternLearning` |
| `(url, host, created_at)` | ncdb `legacy-hubDiscoveryDiagnostics` |
| `(url, host, path, status, depth, discovered_from)` | ncdb `legacy-remoteCrawlServer` |
| `(url, canonical_url, created_at, last_seen_at, analysis, host)` | ncdb `legacy-SQLiteNewsDatabase` |
| `(url, first_seen_at, last_seen_at)` | ncdb `PostgresNewsDatabase` |
| `(url, host, created_at, last_seen_at)` + backfill | ncdb `legacy-urlHelpers.ensureUrlId` ✅ |

**No cause is claimed for the 91,013 rows.** With eight writers sharing the
table, which one produced which row is not determinable from the data, and
attributing it to any single writer would be inference dressed as measurement.
What can be said is that at least five of the eight cannot populate `host` at
all, because their column list has no room for it.

## What cycle 219 fixed

The two writers in *this* repo now both call ncdb's `ensureUrlId`, which
already existed and is already exported — no new ncdb code was needed. It
derives and lowercases the host, sets `created_at` and `last_seen_at`, and
**backfills `host` on an existing host-less row** rather than duplicating it,
which means every future resolve of one of the 91,013 repairs it in passing.

This was timely rather than cosmetic. `UrlResolver`'s only callers are the two
migrations that have **not yet run** — `normalize-fetches` (54,485 rows) and
`normalize-place-hub-candidates` (673). Running them on the old code would have
added tens of thousands of fresh host-less rows.

Two deliberate behaviour changes came with it, neither hidden:

- the host is now lowercased (`urlObj.hostname` already was, so this only
  affects `UrlResolver`, which wrote no host at all)
- a malformed url yields a row with a null host instead of `new URL()`
  throwing out of a cache write
- `ensureUrlId` touches `last_seen_at` on every call, so the facade's read
  path now does one extra indexed UPDATE by rowid. Judged acceptable and
  arguably correct — `last_seen_at` should move when a url is seen — but it is
  a real added write on a hot path and is recorded here rather than glossed.

## What is still open

The six ncdb-side writers were **not** touched. They are in the library that
owns the table, several are legacy compatibility surfaces with their own
callers, and changing them is a much larger piece of work than a repoint. The
question for the owner is whether `ensureUrlId` should become the single
enforced entry point for url creation across both repos — and if so, whether
the five shapes that cannot express `host` get migrated or deleted.

A cheaper intermediate step, if the full unification is too large: a backfill
pass that derives `host` from `url` for the 91,013 rows. That is a live-db
write and therefore owner-gated.
