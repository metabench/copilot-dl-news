---
decision: DEC-PENDING-MIGRATIONS
status: open
question: Run the two pending URL migrations? normalize-fetches (54,485 rows) and normalize-place-hub-candidates (673).
options: [run-both, run-fetches-only, leave-pending]
blocks: [CR-DB]
---

# Three URL-normalization migrations are spent — retire them?

**Date:** 2026-08-05 (cycle 216)
**Status:** ✅ **RESOLVED in cycle 218** — owner ruled "I don't need to keep
migration one-offs". The three SPENT migrations were retired (option 1), along
with the c216 behaviour-pin test. Git history keeps them.
**Affects:** `src/tools/normalize-urls/`

## Cycle 218 outcome — including one correction

Before deleting, the verdicts were re-measured rather than trusted, and the
probe was widened from a fresh `ensureDb` schema to the **live** `data/news.db`
(read-only). The two agree on all five tables, which is what made the deletion
safe.

Widening the probe caught something c216 missed. This document said `fetches`
and `place_hub_candidates` were "not applied / by design" and left the question
open. They are not by design — they were **never run**, and the directory
README claimed the opposite: "Phase 2 Complete ✅ … 100% of Phase 2 targets",
listing `fetches` as "✅ 479 rows migrated". The live database has 54,485
`fetches` rows and **no `url_id` column at all**; `place_hub_candidates` has
673 rows and no `candidate_url_id`. The README has been corrected.

Both pending tools **were kept**, deliberately. The owner's ruling is about
one-offs that are *done*; deleting a migration that has never run would
silently decide those two tables will never be normalized, which is a schema
decision rather than a cleanup. Both add their own column via `ALTER TABLE …
ADD COLUMN`, so they are genuinely runnable pending work.

The separable `ensureDb()` hazard below is now moot for the retired three. For
the two survivors it does not apply: both already accept `[db-path]`.

---

*Original cycle-216 write-up follows.*

## What was found

`normalize-article-places.js` came up as the next ncdb-debt delegation target
(15 raw-SQL sites). Building its test harness first — the pattern that made
cycle 214's delegation a one-run proof — revealed it should **not** be
delegated at all.

These tools migrate a legacy `*_url` TEXT column to a normalized `*_url_id`
foreign key. Measured against the current schema (`ensureDb` on a fresh
temp db):

| tool | legacy source column | present today? | `*_url_id` present? | status |
|---|---|---|---|---|
| `normalize-article-places` | `article_places.article_url` | **GONE** | yes | **spent** |
| `normalize-place-hubs` | `place_hubs.url` | **GONE** | yes | **spent** |
| `normalize-place-hub-unknown-terms` | `place_hub_unknown_terms.url` | **GONE** | yes | **spent** |
| `normalize-fetches` | `fetches.url` | present | no | not applied / by design |
| `normalize-place-hub-candidates` | `place_hub_candidates.candidate_url` | present | no | not applied / by design |

The three marked **spent** read a column the schema no longer has. They
detect this and no-op — `normalize-article-places` prints "already
normalized — legacy article_url column not found" and returns success.

## Why this matters for the ratchet

Their SQL still counts toward `ncdb-debt` (15 + 11 sites among them).
Delegating it into news-crawler-db would move **dead code into a shared
library** — the opposite of what the ratchet is for. Retiring them removes
the same count honestly.

## Why nothing was deleted

A migration script is also a record of how the schema got here. Cycle 208
established that destroying a point-in-time record to tidy the present is a
bad trade, and these are load-bearing history for anyone reconstructing the
url-normalization work. Deleting them is cheap; deciding they are worthless
is not mine to do.

Also unresolved: the two "not applied" rows above. `fetches.url` and
`place_hub_candidates.candidate_url` may be **pending migrations** or may be
columns those tables legitimately keep. I did not determine which.

## A second, separable hazard

Four of the five call `ensureDb()` with **no argument**, so they can only
ever run against the live 30GB `data/news.db`:

```js
const db = ensureDb();   // normalize-place-hub-candidates, -unknown-terms,
                         // normalize-fetches, normalize-place-hubs
```

Only `normalizeArticlePlaces(dbPath)` accepts a path, which is the sole
reason it could be harnessed. Making the other four accept an optional path
(defaulting to today's behaviour) is a small, safe change that would let them
be tested at all — worth doing regardless of the retirement decision.

## Options

1. **Retire the three spent tools** (git history keeps them). Removes their
   sites from ncdb-debt honestly.
2. **Keep them, exclude from the ratchet** with a documented reason, as
   `archive/` and built bundles already are for silent-catches.
3. **Keep and count them** — status quo; the number stays slightly dishonest.

Recommendation: (2) if they have documentary value, (1) if not. Either way,
make the four `ensureDb()` calls path-injectable.

## What cycle 216 did do

Pinned the actual present-day behaviour in
`src/tools/normalize-urls/__tests__/normalize-article-places.test.js` (3
tests): on a current-schema database the tool detects the completed
migration, changes nothing, and is safely repeatable. The first test asserts
the premise itself — if a future schema re-introduces `article_url`, it fails
loudly rather than passing quietly.
