# 15,061 orphaned `content_storage` rows — measured, not attributed

**Date:** 2026-08-05 (cycle 220)
**Status:** OPEN — reported, no cause claimed
**Measured on:** live `data/news.db`, read-only

## The measurement

While delegating `HttpRequestResponseFacade`'s cache SQL, the two tables it
writes were probed:

| metric | count |
|---|---|
| `http_responses` rows | 315,064 |
| …of which carry a `cache_key` (the facade's own rows) | **33** |
| …expired but still present | 33 |
| `content_storage` rows | 205,942 |
| **orphaned `content_storage` rows** (pointing at a deleted `http_responses` row) | **15,061** |
| cache rows with no content (half-completed delete) | 0 |

7.3% of `content_storage` is unreachable: the parent response row it belongs
to is gone, so nothing can ever join to it or read it.

## Why the facade is NOT the cause

The facade deletes from `content_storage` and `http_responses` as two
independent statements, so a failure between them would leave exactly this
signature. That made it the obvious suspect — and it is ruled out **by
scale**: the facade has only ever written **33** rows to these tables. Thirty
three rows cannot produce fifteen thousand orphans.

The other writers of `content_storage` — ncdb's `legacy-ArticleOperations`,
`legacy-compressionCompat`, `pipeline/storage`, and the compression
lifecycle/backfill tasks — account for essentially all 205,942 rows, and the
orphans must have come from a deleter on that side. **Which one is not
determinable from the data.** Naming a culprit here would be a story, not a
measurement.

What *is* established: the deletion path that produced them does not clean up
its child rows, and 15,061 rows' worth of compressed blobs are occupying space
no query can reach.

## What cycle 220 did fix

The facade's own two-step delete is now a single atomic ncdb call
(`deleteCacheEntry`), proven by a test that induces the failure with a
`BEFORE DELETE` trigger and asserts the child delete rolls back. So this path
can no longer contribute to the orphan population, however small its
contribution would have been.

## Suggested next step

Two separable pieces of work, both for the owner to schedule:

1. **Find the deleter.** Census every `DELETE FROM http_responses` across both
   repos and check which ones delete their `content_storage` children first.
   That is a code question and needs no live-db access.
2. **Reclaim the space.** Deleting 15,061 orphaned rows plus a VACUUM is a
   live-db write and therefore owner-gated. Worth sizing first — the blobs are
   compressed article content, so the reclaim could be substantial.

Do (1) before (2): deleting the orphans without fixing the producer just means
measuring them again next quarter.
