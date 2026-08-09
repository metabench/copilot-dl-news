---
decision: DEC-ORPHANED-CONTENT
status: open
question: What happens to 15,061 content_storage rows whose parent response is gone but which back 16.8% of content_analysis?
options: [leave, re-link, delete-content-and-analysis]
blocks: [CR-DB]
---

# 15,061 orphaned `content_storage` rows — measured, not attributed

**Date:** 2026-08-05 (cycle 220)
**Status:** ❌ **CANCELLED (cycle 224) — THE PREMISE WAS WRONG.** The reclaim
was approved on my analysis that these rows were unreachable dead weight. They
are not. **15,055 of the 15,061 carry `content_analysis` rows**, and only 6 are
freely deletable. Do not run this.

## Cycle 224: the correction

The delete was attempted with the approval in hand and failed immediately on
`SQLITE_CONSTRAINT_FOREIGNKEY` — inside a transaction, so nothing was written.
The cause:

```
content_analysis.content_id INTEGER NOT NULL REFERENCES content_storage(id)
```

I had measured reachability from **one direction only** — whether a
`content_storage` row's parent `http_responses` row still existed. It does
not. But these rows are reachable from the *other* side, via
`content_analysis`, and that analysis is substantive: sampled rows carry
`classification`, `title`, `word_count` and `analysis_json`.

Deleting them would have destroyed the content backing **15,055 analysis rows
— 16.8% of all `content_analysis`**.

So the earlier description of them as rows "no query can reach" was false, and
the approval it produced was obtained on bad information. The 7.3% figure is
still correct as a count; the characterisation was not.

### What these rows actually are

Content blobs whose HTTP response record was deleted while their extracted
analysis survived. That is a real inconsistency worth understanding — a
deleter removed `http_responses` rows without removing the content, and the
content is still doing useful work. But it is emphatically **not reclaimable
space**, and the right question is now "why was the response row deleted?"
rather than "how do we free the blobs?".

### Remaining honest options

1. **Leave them.** They cost disk but back live analysis. Default.
2. **Re-link them** — if the deleted `http_responses` rows can be reconstructed
   or the FK repointed, the inconsistency goes away without data loss.
3. **Delete content AND analysis together** — frees the most space, destroys
   16.8% of the analysis corpus. Needs a separate, explicit decision made with
   *this* information rather than the earlier framing.
**Measured on:** live `data/news.db`, read-only

## Cycle 221: the producer hunt, and why it came back empty

c220 recommended finding the producer before reclaiming. That was done, and
the answer is that **no current code path can create these rows.** Every
deleter of `http_responses` was censused across both repos:

| deleter | behaviour | verdict |
|---|---|---|
| ncdb `remoteCrawler.ts` | selects the response ids per chunk, deletes `content_storage` first, then the responses — all in one transaction | correct |
| copilot `tools/db/dedup-http-responses.js` | deletes content, then responses | correct |
| ncdb `legacy-httpResponseCache.ts` | atomic child-then-parent (fixed in c220) | correct |
| ncdb `crawlerAppDiagnostics.clearCrawlerAppHttpResponses()` | `DELETE FROM http_responses` — **no WHERE, no child cleanup** | would orphan everything, but **has no production callers**: the only references are its own interface declaration and its own test |

And the schema itself blocks the naive case. `content_storage.http_response_id`
carries `REFERENCES http_responses(id)` with no `ON DELETE` clause, so with
foreign keys enforced a parent delete *fails* rather than orphaning. Proved
rather than assumed:

```
foreign_keys=1: BLOCKED: FOREIGN KEY constraint failed
foreign_keys=0: SUCCEEDED -> 1 orphan(s) created
```

`ensureDb` sets `foreign_keys = 1`, so the mainstream connection is protected.

**So the 15,061 rows are historical residue from a period when enforcement was
off.** Two code paths still disable it deliberately and briefly —
`legacy-dataMigration` and `legacy-gazetteerClone`, both of which restore it
afterwards — and those are plausible historical windows. **Which one, or
whether it was code that no longer exists, is not determinable**, and no
attribution is claimed.

### What this changes

The c220 advice ("fix the producer first") no longer applies: there is nothing
to fix. Reclaiming the 15,061 rows plus a VACUUM is a straightforward
owner-gated live-db write, and it will not silently refill.

---

*Original cycle-220 write-up follows.*

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
