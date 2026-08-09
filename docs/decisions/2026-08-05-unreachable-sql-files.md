---
decision: DEC-UNREACHABLE-SQL-FILES
status: answered
question: What happens to the three unreachable SQL-holding files found by the reachability pass?
answered: Assessed in cycle 226: two superseded, one an unwired feature. Verdicts in 2026-08-07-unreachable-file-assessment.md.
---

# Four unreachable SQL-holding files — one retired, three are owner calls

**Date:** 2026-08-05 (cycle 217)
**Status:** one retired; three OPEN
**Found by:** the reachability pass added to `tools/dev/ncdb-debt-scan.js`

## How they were found

The ncdb-debt list ranked dead code first two cycles running (c216's spent
migration, then this one). The scanner now measures, for every file it counts,
how many other files `require()` it and whether it has an entry guard — so
"nothing can reach this" is a reported fact rather than a per-cycle discovery.

Four files hold SQL that **nothing in the repo can execute**: zero requires,
no `require.main === module` guard, not under `src/tools/` (which is a CLI
surface reachable by path — c213 proved the guard is not a reliable tell
there, since `gazetteer-cleanup.js` called `main()` unguarded at module
scope).

Each was verified individually, repo-wide, by filename **and** by every symbol
it exports. All returned zero.

| file | lines | SQL | verdict |
|---|---|---|---|
| `src/bootstrap/bootstrapDbLoader.js` | 408 | 13 | **RETIRED this cycle** |
| `src/intelligence/analysis/pageCategoryDetector.js` | 461 | 5 | open — unwired *feature* |
| `src/shared/utils/articleCompression.js` | 239 | 6 | open — superseded copy |
| `src/intelligence/matching/ContextAnalysisMatcher.js` | 177 | 1 | open — superseded copy |

## Why bootstrapDbLoader was retired without asking

It is **superseded by an explicit, completed delegation**. Bootstrap seeding
moved to news-crawler-db at B10c; the live path is
`ensureNewsDb.loadBootstrapData` → `readBootstrapJson` →
`ncdb.ensureSqliteNewsDatabase({ bootstrapData })`. (Note the name collision:
`ensureNewsDb.js` defines its own `loadBootstrapData`, which is *not* this
file's.)

It also has no `main()` and no entry guard, so it could not be run by path
even deliberately — it was inert in every sense.

And it was **costing maintenance while dead**: B10c repointed it as if it were
a live consumer, and the 2026-07-18 owner-directed 10MB seed-file sweep edited
it again. Two rounds of work on a file that nothing could call. Retiring it
stops the third. Git history keeps it.

## Why the other three were not

**`pageCategoryDetector.js` is not a corpse — it is an unfinished feature.**
461 lines defining category taxonomies (in-depth, opinion, live, explainer,
multimedia), URL-pattern detection, and a `page_categories` table. Nothing
else in the repo mentions `page_categories` at all. This was written and never
wired up. Deleting it destroys intent, not debt. The question is whether the
feature is still wanted — if yes it should be wired, if no it should go, and
either answer is the owner's.

**`articleCompression.js` and `ContextAnalysisMatcher.js` look superseded.**
Both date to a single 2026-01-29 bulk commit ("Add all pending work") and have
never been referenced. Compression is now served by `CompressionFacade.js` (19
callers) plus the `CompressionTask` pipeline; matching by `ArticlePlaceMatcher`
(9 callers). But "looks superseded" is weaker evidence than bootstrapDbLoader's
"a delegation explicitly replaced it", so they are reported, not removed.

## The ratchet was deliberately NOT lowered

Retiring bootstrapDbLoader moved the raw total **195 → 182**. The ceiling
stays at **195**.

Deleting an unreachable file lowers the number without delegating anything,
and a ratchet that can be satisfied by deletion measures tidiness rather than
progress. The honest figure is the scanner's new `candidateSignatures` — the
SQL in files that are actually reachable and actually delegatable — and that
number did **not** move this cycle: **118 before, 118 after.**

For context, of the 195 signatures the scan reported at the start of this
cycle:

- **118** were genuinely delegatable
- **52** sat in one-off `normalize-*` / `populate-*` migrations (three of them
  measured spent in c216)
- **25** sat in unreachable files

Only the first group is the mission's north star. The other 77 were inflating
it.
