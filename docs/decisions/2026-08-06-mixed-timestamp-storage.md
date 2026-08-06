# Fifteen columns store timestamps in BOTH formats — normalise, or keep patching?

**Date:** 2026-08-06 (cycle 222)
**Status:** ✅ **APPROVED (cycle 223)** — owner authorised option 1, normalise
the stored data. NOT yet executed: a ~870k-row rewrite of the busiest table
should start a cycle, not end one, and the two guarded backups must be
verified present first. Scheduled for cycle 224.
**Measured on:** live `data/news.db`, read-only, **exact counts** (every
non-null value, no sampling)

## The measurement

| column | rows | ISO-8601 | SQLite format | minority |
|---|---:|---:|---:|---:|
| `urls.created_at` | 1,795,890 | 870,754 | 925,136 | **48.5%** |
| `urls.last_seen_at` | 1,777,120 | 849,939 | 927,181 | **47.8%** |
| `http_responses.request_started_at` | 315,064 | 246,124 | 68,940 | 21.9% |
| `http_responses.fetched_at` | 315,009 | 221,731 | 93,278 | 29.6% |
| `fetches.fetched_at` | 54,452 | 4,640 | 49,812 | 8.5% |
| `fetches.request_started_at` | 54,452 | 4,640 | 49,812 | 8.5% |
| `crawl_jobs.started_at` | 18,668 | 18,667 | 1 | 0.01% |
| `crawl_jobs.ended_at` | 17,584 | 17,583 | 1 | 0.01% |
| `errors.at` | 6,803 | 4,028 | 2,775 | 40.8% |
| `crawl_milestones.ts` | 3,952 | 3,951 | 1 | 0.03% |
| `place_page_mappings.last_seen_at` | 699 | 279 | 420 | 39.9% |
| `place_page_mappings.verified_at` | 520 | 488 | 32 | 6.2% |
| `place_hub_audit.created_at` | 161 | 160 | 1 | 0.6% |
| `crawl_runs.ended_at` | 50 | 24 | 26 | 48.0% |
| `news_websites.added_at` | 49 | 36 | 13 | 26.5% |

Uniform columns, for contrast: `links.discovered_at` (4,874,880 — all ISO),
`queue_events.ts` (1,670,293 — all ISO), `content_analysis.analyzed_at`
(89,532 — all SQLite format).

### A correction to cycle 221

c221 reported "64 columns store ISO-8601" from a `LIMIT 200` sample. `LIMIT`
without `ORDER BY` returns the oldest rowids, so the sample was biased toward
however the data was written years ago. Two examples of how wrong it was:

- `fetches.fetched_at` sampled as **100% ISO**; it is actually **8.5%**
- `urls.created_at` sampled as **82% ISO**; it is actually **48%**

The exact counts above supersede that. The lesson is cheap and worth keeping:
`LIMIT n` is not a sample, it is the first n rows.

## Why this makes the fix ambiguous

There are two ways to fix a broken comparison, and they are **not
interchangeable** — proved, not assumed. Two rows both at 15:00, threshold
12:00 the same day, so both are genuinely newer:

```
bound ISO threshold           ISO=1  SQLITE=0   <- wrong for the sqlite row
datetime(col) vs datetime()   ISO=1  SQLITE=1   <- correct for both
```

- `datetime(col) > datetime(threshold)` — correct for **any** format, but not
  sargable, so it defeats an index on the column.
- `col > ?` with a bound same-format threshold — keeps the index, but is
  correct **only if the column is 100% one format**.

So on a mixed column there is no fast correct fix. `urls` is 1.8M rows and
roughly half-and-half; every comparison against it must either scan or be
wrong.

## The choice

1. **Normalise the stored data** (recommended). One pass rewriting ISO values
   to SQLite format, or vice versa, per column. Afterwards every site can use
   the fast bound-threshold form, and the check's per-column table collapses
   to a single rule. This is a live-db write and therefore owner-gated; on
   `urls` it rewrites ~870k rows.
2. **Patch the 51 remaining call sites with `datetime()`** and accept the
   scans. Correct, mechanical, and permanently slower on the big tables.
3. **Do nothing.** The residual error is a boundary-day error on age-window
   queries — real but small, and it has evidently been tolerable for a long
   time. It is now measured and guarded against growth, which may be enough.

Option 1 fixes the cause; options 2 and 3 manage the symptom. The reason to
ask rather than act is that (1) is a bulk rewrite of the busiest table in the
database, and the decision about whether that is worth it is not mine.

## What cycle 222 did

- 8 sites fixed where the table is **empty**, so the wrap is free and the fix
  is purely latent-safe (ratchet 70 → 62).
- 3 sites identified as **not defects at all** — `content_analysis.analyzed_at`
  is uniformly SQLite format, so those comparisons were always correct. The
  check now records that so it stops reporting working code.
- The measured census is embedded in
  `tools/dev/checks/timestamp-comparison.check.js`, which now recommends the
  right fix **per site** rather than a blanket one.
