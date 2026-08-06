# Assessment of the three unreachable SQL files

**Date:** 2026-08-07 (cycle 226)
**Status:** assessment complete — verdicts below, **nothing deleted**
**Owner instruction:** "Check to see if that functionality is implemented
anywhere. Conceptually they look useful, but if they have not been wired up, it
seems like they were made in error. Review them to determine the quality and
difficulty to integrate."

The owner's read was right in spirit and wrong in one specific: these were not
made in error. Two were **superseded by better implementations that also exist
in the tree**, and one of those successors is itself unwired — which is the
actual finding.

---

## 1. `pageCategoryDetector.js` (461 lines, 5 SQL sites)

**Verdict: RETIRE — but wire its successor.**

Is the functionality implemented elsewhere? **Yes, twice over, and neither is
live.**

| implementation | approach | status |
|---|---|---|
| `pageCategoryDetector.js` | hardcoded regex arrays + inline SQL | unwired, no config, no tests |
| `decisionTreeEngine.js` + `config/decision-trees/page-categories.json` | JSON-configured decision trees, confidence, audit path, compact storage encoding, JSON schema | unwired, but configured, schema'd and documented |
| `CategoryClassifier.js` + `config/category-keywords.json` | keyword scoring | **LIVE** (3 callers) — but a *different job* |

The decisive evidence: `pageCategoryDetector` and
`config/decision-trees/page-categories.json` define **exactly the same five
categories** — in-depth, opinion, live, explainer, multimedia. The engine is
the same feature, done better. `CategoryClassifier` is not a competitor at all;
its taxonomy is Politics / Technology / Sports / Business / Entertainment /
Science / Health, i.e. *topic* classification rather than *page-type*
classification.

Quality: the detector is decent code — documented, sensible heuristics, and
its SQL correctly joins the real chain (`urls → http_responses →
content_storage → content_analysis`). It is simply the older of two designs.

**The real finding is about the successor.** `decisionTreeEngine` has a config
file, a JSON schema, a book chapter (`docs/books/…/06-decision-tree-configuration.md`),
five architecture diagrams, and a viewer check — an unusual amount of
investment for something with no callers. Its only entry point,
`test-decision-tree.js`, **was broken**: it built the config path as
`src/config/decision-trees/…` when `__dirname` is `src/intelligence/analysis`,
one level short, so it died with ENOENT and the engine could not be exercised
at all. Fixed this cycle (resolved from the project root). It now runs
**7 tests, 7 passing**, producing exactly what you would want:

```
TEST: Guardian Long Read Hub
Match: In-Depth   Confidence: 90%   Reason: url-pattern-long-read
Decision Path: in-depth-root: url matches [long-read, long-form, longform...] → YES
Compact Storage: {"cat":"in-depth","m":1,"c":90,"r":"url-pattern-long-read","p":"depth-ro:Y"}
```

Difficulty to integrate: **low-to-moderate.** The engine is pure and takes a
context object (`url`, `title`, `classification`, `article_links_count`,
`section_avg_word_count`, `domain_avg_word_count`). Everything it needs is
already computed during analysis. The work is: call it where pages are
analysed, and store the compact result. The `page_categories` table
`pageCategoryDetector` expected does not exist, so a storage decision is
needed — the engine's compact encoding is small enough to live in an existing
analysis column.

---

## 2. `ContextAnalysisMatcher.js` (177 lines, 1 SQL site)

**Verdict: RETIRE.**

Superseded by `ArticlePlaceMatcher` (9 callers, live), which absorbed the whole
tiered design. `ContextAnalysisMatcher` describes itself as "Rule Level 2:
String matching with context and frequency analysis" and wraps
`BasicStringMatcher` (Level 1). `ArticlePlaceMatcher` implements the same
ladder internally — its rule levels include `2: 'context_aware'` ("Considers
position, frequency, context") with confidence thresholds and scoring.

So this is not a lost feature; it is the earlier, un-absorbed half of a design
that was completed elsewhere. Nothing to integrate.

---

## 3. `articleCompression.js` (239 lines, 6 SQL sites)

**Verdict: RETIRE — lower confidence than the other two.**

Its three exports (`decompressArticleHtml`, `compressAndStoreArticleHtml`,
`getArticleCompressionStatus`) are article-specific wrappers over compression.
The live surface is `CompressionFacade` (19 callers) delegating to
`compression.js`, which exposes a generic `compressAndStore`, plus the
`CompressionTask` / `CompressionLifecycleTask` pipeline that actually
compresses stored content in production.

I am less certain here than for the other two: I confirmed the generic
primitives are live and that nothing references these three symbols, but I did
not trace whether every article-specific behaviour (the per-article status
report in particular) has an exact equivalent. If that matters, the safe
version of this verdict is "retire the two compress/decompress wrappers, check
`getArticleCompressionStatus` against the compression dashboard first".

---

## Recommendation

1. **Wire `decisionTreeEngine`** — that is the genuinely useful unwired
   feature, and it is close to ready. Its broken entry point is already fixed.
2. Retire `pageCategoryDetector.js` and `ContextAnalysisMatcher.js` once (1) is
   decided — both are superseded, and keeping a worse duplicate of a feature
   you are about to wire is the worst of both.
3. Retire `articleCompression.js`, or check `getArticleCompressionStatus`
   first if the compression dashboard reports per-article status.

Nothing was deleted this cycle, per the instruction.
