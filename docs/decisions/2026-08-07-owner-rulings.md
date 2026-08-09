---
decision: DEC-OWNER-RULINGS-C223
status: answered
question: Four decisions put to the owner in cycle 223 — live-db writes, ui-debt, dedup policies, unreachable files
answered: All four answered; three live-db writes approved, the two pending migrations refused. See the document.
---

# Owner rulings, cycle 223

Four decisions that had been accumulating for six cycles were put to the owner
and answered. Recorded here verbatim in substance, because three of them are
instructions for *how* to do work rather than simple yes/no approvals, and
that nuance is exactly what gets lost when a ruling lives only in a chat log.

## 1. Live-database writes — THREE of four approved

Approved:

- **Reclaim the 15,061 orphaned `content_storage` rows** (7.3% of the table)
  plus a VACUUM. c221 established there is no live producer.
- **Backfill `host` on the 91,013 host-less `urls` rows** (4.9% of 1.87M).
- **Normalise timestamp storage** — the ~870k-row rewrite that unblocks 13
  timestamp site fixes and lets every query use the fast indexed form.

**Not approved** (not selected): running the two pending migrations,
`normalize-fetches` (54,485 rows) and `normalize-place-hub-candidates` (673).
These stay pending. Do not run them.

Execution conditions before any of the three: verify the two guarded backups
still exist, and start the work at the beginning of a cycle rather than the
end — a rewrite of the busiest table in the database is not a tail-end task.

## 2. ui-debt — not dropped; scoped properly instead

> "If possible, use references to keep the monorepo code functional, though
> express it elsewhere. Do a detailed review of what is actually still debt."

Two instructions, and the second comes first:

1. **Review what is actually still debt.** The 351 number has never been
   broken down. c223 established the surface is *live* — electron alone is 248
   files with five `package.json` scripts and a commit from three days ago — so
   "351 files to extract" is almost certainly not "351 files of debt". Measure
   what is genuinely stale versus what is maintained, operational UI.
2. **Extract by reference, not by amputation.** Where code does move to
   news-crawler-ui, the monorepo must keep working by depending on the
   extracted package rather than losing the functionality. This rules out the
   "move it and delete the copy" pattern the ui-debt ratchet currently rewards,
   and means the ratchet's definition of a win needs revisiting.

## 3. Three dedup scoring policies — investigate, then recommend

> "Investigate and recommend"

Do not unify them yet. Compare the three implementations against real
gazetteer data, **measure how often they actually disagree** on a survivor,
and bring back a recommendation. The disagreement rate is the missing fact: if
they diverge on 0.1% of merges this is documentation work, and if they diverge
on 30% it is a correctness problem.

## 4. Three unreachable files — assess before deleting

> "Check to see if that functionality is implemented anywhere. Conceptually
> they look useful, but if they have not been wired up, it seems like they were
> made in error. Review them to determine the quality and difficulty to
> integrate."

So: **not a deletion, an assessment.** For each of
`pageCategoryDetector.js` (461 lines), `articleCompression.js` (239) and
`ContextAnalysisMatcher.js` (177), answer three questions with evidence:

- Is this functionality implemented anywhere else in either repo?
- Is the code any good — would wiring it up produce something worth having?
- How hard is integration: what does it depend on, what would call it, and what
  would have to change?

The owner's framing is that these look conceptually useful and were probably
written and then forgotten rather than deliberately abandoned. Deleting them
was the wrong instinct; the right output is a verdict per file — wire it,
retire it, or leave it — backed by a read of the actual code.
