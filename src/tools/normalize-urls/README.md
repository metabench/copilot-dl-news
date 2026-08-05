# Database URL Normalization Tools

**Status**: partially complete — three tables normalized, **two never migrated**.

These tools convert URL storage from denormalized TEXT columns to normalized
`url_id` foreign keys referencing the `urls` table.

## Measured status (2026-08-05, cycle 218)

This table was produced by reading `PRAGMA table_info` on **both** a fresh
`ensureDb` schema and the live `data/news.db` (read-only). The two agree.

| table | legacy column | `*_url_id` | live rows | status |
|---|---|---|---|---|
| `article_places` | gone | present | 9,808 | **done** — migration retired |
| `place_hubs` | gone | present | 435 | **done** — migration retired |
| `place_hub_unknown_terms` | gone | present | 4,157 | **done** — migration retired |
| `fetches` | **still present** | **absent** | **54,485** | **NOT MIGRATED** |
| `place_hub_candidates` | **still present** | **absent** | **673** | **NOT MIGRATED** |

### A correction

Until this cycle, this README said "Phase 2 Complete ✅ … 16,072 rows
normalized across 5 core tables (100% of Phase 2 targets)", and listed
`fetches` as "✅ 479 rows migrated, all URLs normalized".

That was not true, and the live database says so plainly: `fetches` has no
`url_id` column at all, and its row count has grown from the claimed 479 to
54,485. `place_hub_candidates` is in the same state with 673 rows. Three of
the five migrations really did complete; two were written, documented as
finished, and never run.

The lesson is worth keeping: a status claim in a README is a claim about a
database, and only the database can settle it.

## Tools

### `normalize-fetches.js` — PENDING, not yet run
Adds `fetches.url_id`, batch-resolves 54,485 URLs, indexes the result.

```bash
node normalize-fetches.js [db-path]
```

### `normalize-place-hub-candidates.js` — PENDING, not yet run
Adds `candidate_url_id` and `normalized_url_id`, resolves both per row (673
rows), indexes both.

```bash
node normalize-place-hub-candidates.js [db-path]
```

### `validate-url-normalization.js`
Reports normalization status across all five tables. This is the tool to
trust over any prose, including this file.

```bash
node validate-url-normalization.js [db-path]
```

## Retired migrations

`normalize-article-places.js`, `normalize-place-hubs.js` and
`normalize-place-hub-unknown-terms.js` were removed in cycle 218 by owner
ruling ("I don't need to keep migration one-offs"). Their source columns no
longer exist in either schema, so they could only detect a completed migration
and exit. Git history keeps them.

## Before running either pending migration

Both take a `[db-path]`. **Do not point them at the live database** without
the owner's go-ahead — repository policy gates live `news.db` writes, and
`normalize-fetches` would rewrite a 54,485-row table.

Both are idempotent (they check for their own column before adding it) and
both carry a no-progress guard that stops the batch loop rather than spinning
if a batch resolves nothing.

## Migration pattern

1. Pre-migration validation — table exists, count rows
2. Schema change — `ALTER TABLE … ADD COLUMN … REFERENCES urls(id)`
3. Data migration — batch-resolve URLs to ids via `UrlResolver`
4. Post-migration validation — no NULL ids left behind
5. Index creation on the new id column

## Dependencies

- `../../shared/utils/UrlResolver.js` — URL resolution
- `../../shared/utils/project-root.js` — project path resolution
- `../../data/db/sqlite/ensureDb.js` — database connection
