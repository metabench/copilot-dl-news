# Dedup investigation: the scoring is the small problem

**Date:** 2026-08-07 (cycle 228)
**Status:** ✅ **CLOSED in cycle 235. The scoring question is MOOT — there are
no genuine duplicates left to score.**

## Cycle 235: the answer, and why it is not A or C

The owner chose "investigate further first" rather than picking a policy. That
was the right call. Reading the 12 groups where A and C disagree shows that
**none of them are duplicates**:

```
Landkreis Kusel      vs Landkreis Kassel        grouped by Persian  "کسل"
province de Lérida   vs província de Girona     grouped by Armenian "Կիրոնա"
Ain / Aisne / Yonne / Gers / Cher               Greek, Hebrew, Cyrillic, Japanese
West Lothian         vs East Lothian            grouped by Telugu
```

The grouping matches on `place_names.normalized` across **every** alternate
name, including transliterations into other scripts. Two different French
departments each carry a Greek or Hebrew alternate that normalises to the same
string, so they collide. No scoring policy can make merging them correct.

None of these carry a `wikidata_qid`, which is why the c229 guard let them
through — it can only protect places that have one.

**All 31 survivors carried CONFLICTING EXTERNAL IDS**, so a second guard on the
same principle closes the gap:

```
live gazetteer merge candidates:  964  →  31 (qid guard, c229)  →  0 (ext-id guard, c235)
```

The schema makes this guard strong: `place_external_ids` has
`UNIQUE(source, ext_id)`, so two places cannot share an id — if both carry one
from the same source, those ids necessarily differ and the places are
necessarily different. That fact is pinned by its own test.

**So the live gazetteer contains zero genuine duplicate groups.** The dedup
tools have nothing legitimate to merge, and the choice between qid-first and
coords-first has no cases left to decide. If real duplicates appear later, the
question can be re-measured on that population; c228's recommendation of policy
A stands as the default should it ever be needed.

---

*Cycle 229 outcome and the original cycle-228 investigation follow.*

## Cycle 229 outcome

**The qid guard shipped** in all three grouping paths
(`listDuplicateNameGroups`, which `gazetteer-cleanup` and `populate-gazetteer`
share; `legacy-gazetteer-deduplication`'s own grouping; and
`mergeDuplicateCapitals`). Measured against the live gazetteer, read-only:

```
duplicate groups WITHOUT the qid guard : 964
duplicate groups WITH    the qid guard :  31
groups now protected from merging      : 933 (96.8%)
places protected                       : 6,733
```

**C's tie-break was bounded** — `(10000 - id)` moved out of the score and into
the comparator, so it applies only on an exact tie, and ncdb's documented
coords-first policy is now true in practice.

**A prediction of mine was wrong and is corrected here.** Step 2 below
predicted the A-vs-C divergence "will likely shrink" once the grouping was
honest and the tie-break bounded. Measured on the 31 guarded groups:

```
C with the unbounded (10000 - id) term : 13 (41.9%)
C with id as a real tie-break          : 12 (38.7%)
```

It barely moved. The divergence was never mostly an artifact of the id term —
on genuine duplicates, A (qid first) and C (coords first) simply disagree about
what makes a place record better. That is the real decision, and it is now
measured on a population where merging is actually correct.

---

*Original cycle-228 investigation follows.*
**Owner instruction:** "Investigate and recommend" — measure how often the three
scoring policies disagree, then advise.
**Method:** read-only measurement against the live gazetteer (14,544 places).

## The question asked: how often do the three policies disagree?

Formulas transcribed from source, not from a summary:

| | policy | formula |
|---|---|---|
| **A** | `gazetteer-cleanup` | qid 1000 + pop 500 + coords 200 + names×10 + extIds×50 − (restcountries ? 100) |
| **B** | `populate-gazetteer` | qid 1000 + pop 500 + names×10 − (restcountries ? 100) |
| **C** | ncdb `legacy-gazetteer-deduplication` | coords 1000 + qid 500 + pop 100 + (extIds>0 ? 50) + **(10000 − id)** |

Across **964** real duplicate groups:

| comparison | disagree on the survivor |
|---|---:|
| all three agree | 588 (61.0%) |
| A vs B | **13 (1.3%)** |
| A vs C | **368 (38.2%)** |
| B vs C | **373 (38.7%)** |

So the two copilot policies are effectively the same policy — 1.3% divergence,
which is documentation-level. **ncdb's disagrees with both on ~38%**, which by
the owner's own threshold is a correctness problem.

### Why C diverges, measured

`(10000 - p.id)` is commented "Prefer lower IDs (older records)" — written as a
tie-break. It is not one. Place ids run 1 → 1,003,390, so that term spans
**1,003,389** while every quality term combined maxes at **1,650** — a **608×**
difference. C is therefore, in practice, "keep the lowest id", and coords / qid
/ population / external-ids only matter between places whose ids are within
1,650 of each other.

That is a defect regardless of which scoring philosophy is preferred: the
formula does not do what its own comment says.

## The question that turned out to matter more

While grouping the duplicates, the grouping criterion itself — normalized name
+ country + kind, the one all three tools share — proved unsound on this data:

| | groups | places |
|---|---:|---:|
| duplicate groups total | 964 | — |
| **groups whose members carry MORE THAN ONE distinct `wikidata_qid`** | **933 (96.8%)** | **6,733** |
| …of those, groups with a non-empty normalized name | 730 | — |
| groups whose normalized name is EMPTY | 203 | 5,163 |

Two distinct failure modes, both real:

**Normalisation strips the distinguishing token.**
```
group "province"  AF/region
   id=1036  Q182493   Paktia Province
   id=1046  Q165376   Badakhshan Province
```
Two different provinces, merged because normalisation reduced both names to
"province".

**Legitimate homonyms are not duplicates.**
```
group "bella-vista"  AR/city
   id=5502  Q1886737  Bella Vista
   id=5560  Q55855    Bella Vista
```
Two genuinely different Argentinian towns that share a name. No scoring policy
can make merging them correct.

(A third: `梅塞德斯镇` normalises to `mersedesas` and collides with
`Mercedes (Buenos Aires)` — a transliteration collision.)

**`wikidata_qid` is the strongest identity evidence in the table, and the
grouping ignores it entirely.** Running any of the three policies against the
live gazetteer today would merge thousands of genuinely distinct places, and
the merge is a cascade delete — names, hierarchy, attributes, external ids.

The damage is prospective, not historical: these duplicates still exist, so the
cleanup evidently has not been run against the live database.

## Recommendation

**Do not unify the scoring policies yet — that is the 1.3%/38% problem. Fix the
grouping first, because that is the 96.8% problem.**

1. **Add a qid guard to the grouping**, in all three tools: a group whose
   members carry two or more distinct `wikidata_qid` values is not a duplicate
   set and must be skipped (or split by qid). This is a small change with a
   large protective effect, and it needs no policy decision — two different
   Wikidata entities are two different places by definition.
2. **Then** decide the scoring question. With the guard in place the remaining
   groups are genuine duplicates, and the A-vs-C 38% divergence can be re-measured
   on that honest population — it will likely shrink, since much of it is C's
   id-term picking arbitrarily among places that should never have been grouped.
3. **Independently, fix C's tie-break.** `(10000 - id)` should be a bounded
   tie-break — e.g. a small constant times a normalised rank, or simply moved
   to a comparator that only applies on an exact score tie. Its current form
   makes ncdb's stated policy (coords-first) false in practice.

My recommendation on the eventual scoring choice, for when step 2 arrives:
**A** (`gazetteer-cleanup`). It is the only one that uses every available
quality signal, B is a strict subset of it, and C's stated ordering is not what
it actually does.
