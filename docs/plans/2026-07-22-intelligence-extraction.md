# Intelligence-layer module delegation — sequenced plan + cycle-74 finding

**Status:** ACTIVE. Cycle 74 (2026-07-22, Opus 4.8) did the FIRST intelligence-layer
delegation attempt under the [module-ecosystem directive](2026-07-22-module-ecosystem.md):
wire `news-crawler-url-intelligence`, prove equivalence against copilot's own URL
classifier, and delegate the safest consumer *if* safe. **Result: the delegation is
BLOCKED (RED gate) — and that is the correct, evidence-backed outcome.** The module,
loader, adapter, and the differential-equivalence harness are all committed; the
delegation itself waits for a deliberate reconciliation (or, better, an *additive*
repositioning — see §4).

---

## 1. Sequenced plan (three intelligence modules, in dependency/risk order)

The ordering is deliberate — purity and blast-radius both increase down the list, so
the smallest, purest surface de-risks the whole ecosystem-delegation pattern first.

| # | Module | Scope | Risk | State |
|---|--------|-------|------|-------|
| **1** | **`news-crawler-url-intelligence`** | URL-string-only classification (`analyze_url`), pure + deterministic, zero runtime deps, ESM-only | LOW mechanically (one pure fn) / **MEDIUM–HIGH semantically** (taxonomy mismatch) | **THIS cycle — wired + harness; delegation BLOCKED (§3)** |
| 2 | `news-crawler-document-intelligence` | Whole-page/body signals — the Stage2/Stage3 content analysis behind `evaluateArticleCandidate` / `classifyWithCascade(html)` | HIGH — impure (reads parsed HTML/analysis blobs; full cascade adds Puppeteer/network), many consumers; a module equivalent must accept copilot's already-parsed document, not re-fetch | **SCOUTED cycle 80 — drop-in BLOCKED, wired + measured (see §6)** |
| 3 | `news-crawler-places-intelligence` | Place-hub detection — `PlaceHubUrlIndex.classifyUrl`, gazetteer resolution, host-learned `place_hub_url_patterns`, non-geo veto, confidence gates | HIGHEST — stateful + DB-backed; structurally *not* reproducible from URL facts; a genuine capability move, not a repoint; needs its own DB-adapter contract | later cycle |

**Do #2 only after #1's harness+adapter pattern is proven** — document-intelligence
needs the same differential harness but over page fixtures, not URL strings.

## 2. What was verified about the module (cycle 74)

- `analyze_url(url: string)` is a **named export, SYNCHRONOUS** (returns the result
  object directly; only the ESM `import()` is async), **pure + deterministic** for a
  given URL string (no network/FS/randomness; only `processing_time_ms` is wall-clock
  and is not part of the label/confidence), **zero runtime dependencies**, and **never
  throws on a string** (empty/malformed/relative → `unknown`). It has **no `typeof`
  guard** — a non-string throws `TypeError` (`url.trim()`), so every bridge call guards
  `typeof === 'string'` + absolute-URL first.
- Taxonomy (7): `article_candidate, listing_page, media_page, navigation_page,
  api_endpoint, static_asset, unknown`.
- CJS→ESM bridge: `src/intelligence/urlIntelligence.js` mirrors the proven
  `tools/crawl/lib/graph-feedback-loader.js` dual-candidate dynamic-`import()` pattern
  (installed specifier first, then sibling `dist/` file-URL fallback; loud throw on
  total failure — never silently degrades). Because `analyze_url` is sync, a consumer
  loads the module **once** (`createUrlClassifier()`) and then calls synchronously —
  the async surface never leaks into a hot predicate.

## 3. The delegation attempt: target, adapter, harness, GATE, result

**Target (safest first consumer):** `ArticleSignalsService.isArticleShapedUrl` — a
pure static boolean URL predicate, two production callsites (both in
`src/ui/server/unifiedApp/server.js`: injected as `preferArticleShaped` into ncdb
`selectDueFrontier`, and one `.filter`), already unit-tested, already copy-pasted
inline in `tools/dev-bridge/checks/report-fresh-headlines.js:80`. Its own docstring
says it was designed to be injectable — the ideal low-blast-radius first target.

**Adapter (module label → copilot boolean):** only `article_candidate` → `true`; all
other labels → `false` (`moduleLabelIsArticleShaped`, shared by the harness and any
future consumer).

**Harness:** `tools/intelligence/url-intel-diff.js` — pulls a stratified real-URL
sample from `news.db` through the WAL-safe `tools/db/timed-probe.js` child process
(never opens the DB in-process — [[live-db-probe-gotcha]]), runs BOTH classifiers,
and reports the divergence rate bucketed by cause. Reusable for #2/#3 by swapping the
two classifiers.

**GATE (green = ship a real delegation):** divergence ≤ 2% on a ≥1,800-URL real
sample **AND** zero section-hub-regression-direction divergences (the task-#48
frontier headline lever is a hard zero — even a few re-admit hub titles to frontier
batches).

**RESULT — RED, decisively.** On 1,800 live URLs (150 each × 12 news hosts):

```
AGREE 1195 (66.4%)   [both-article 869, both-not 326]
DIVERGENCE BAND (not one scalar — an adversarial-verify pass corrected an
                 earlier "33.6%" headline that conflated abstention with disagreement):
   strict adapter (article_candidate only)         : 33.6%  (605)  <- upper bound
   treating module 'unknown' as ABSTENTION          : 21.2%  (381)  [224 abstentions]
   + media_page/listing_page counted article-shaped : 12.9%  (233)  <- lower bound
GATE: RED  — lower-bound 12.9% ≫ 2% AND section-hub regressions 89 ≫ 0
             (the section-hub hard-zero is mapping-INDEPENDENT — genuine
              module-says-article/copilot-says-no, not abstention — so RED is
              robust across the whole mapping band).
```

**Sample caveat (adversarial-verify):** this is a deliberately divergence-ENRICHED
stress sample (newest-first, equal-weight per host), NOT a frequency-representative
population estimate. Divergence is dominated by systematic per-host gaps — `www.dw.com`
is 150/150 (its `/a-<digits>` and `/video-<id>` scheme → module `unknown`, copilot
article-shaped): ONE module blind-spot pseudo-replicated 150×, not 150 independent
disagreements. The band, not any single number, is the honest characterization.

Divergence by cause (the analytical payload):

| n | bucket | who is arguably right |
|---|--------|-----------------------|
| 224 | `module-unknown` — module blind to a deep slug/section scheme (e.g. dw.com `/a-<digits>`) | **copilot** (module coverage hole) |
| 136 | `copilot-misses-deep-article` — copilot's trailing-slash / short-id rule rejects a real article (nytimes `/athletic/.../<slug>/`, bbc `/sport/.../articles/<shortid>`) | **module** (copilot under-selects real articles) |
| 115 | `module-media_page` — video/gallery; copilot calls it article | debatable (do you want video in the frontier?) |
| 89 | `module-overcalls-shallow-section` — module promotes a weak word signal with no date/slug (`/athletic/rss/news/`, `/news/2026/1/`) | **copilot** (this is the task-#48 risk) |
| 33 | `module-listing_page` — live-blog `?page=with:block` / pagination fragments; copilot calls it article | **module** (copilot over-selects live-blog fragments) |
| 8 | `module-navigation_page` — author/tag index; copilot calls it article | **module** |

**The finding is not "the module is worse" — it is that the two classifiers embody
different, and in several buckets *better*, judgments.** Two are concrete copilot
frontier-quality bugs the harness surfaced: copilot **under-selects** 136 real
articles (trailing-slash + short-id rules too strict) and **over-selects** live-blog
pagination fragments (33) that flood the frontier. Both are candidates for a future
*product* cycle on `isArticleShapedUrl` — independent of any module swap.

## 4. Why the delegation is a repoint-in-disguise, and the ADDITIVE path forward

The mapping analysis (cycle-74 workflow) found `clean_delegation_feasible: false`:
- **Not a bijection.** 3 of 7 module labels (`media_page`, `api_endpoint`,
  `static_asset`) have no home in copilot's operational taxonomy; 2 load-bearing
  copilot concepts (section `hub`, DB+gazetteer `place-hub`) have no module equivalent
  and cannot be reconstructed from URL facts.
- **Copilot has no single taxonomy to map TO** — the decision tree emits
  `{article,hub,nav,unknown}`, `isArticleShapedUrl`/`looksLikeArticle` emit booleans,
  `PlaceHubUrlIndex` emits a place-hub+place object. Each consumer needs its own
  translation + confidence recalibration.
- **The place-hub pipeline is stateful/DB-backed** — the URL-only module structurally
  cannot deliver it.

**Additive SELECTION pre-filter — MEASURED REDUNDANT (cycle 77), do NOT ship.** The
plan proposed using the module as a URL-only negative veto to drop
`static_asset`/`api_endpoint` (and maybe `media_page`) URLs from frontier SELECTION
before copilot's classifiers run. Cycle 77 measured this on a 5,000-URL real frontier
sample and found it obviated:
- copilot's cycle-75 hardened `isArticleShapedUrl` already ADMITS ZERO of the
  non-content classes as article-shaped: `media_page` 410→**0**, `static_asset` 5→**0**,
  `api_endpoint` 10→**0**, `navigation_page` 78→**0**. So the veto adds nothing to the
  article-preference ordering — copilot already ranks every non-content URL below all
  article-shaped ones.
- the non-content classes are tiny (asset+api = **0.3%** of the recent frontier), and
- `selectDueFrontier` is HOST-SCOPED, so the bulky junk — ~17k cross-host social-share
  links (twitter/facebook/whatsapp/linkedin/…) — is never selected regardless.
Shipping the veto would add scaffold (a new injected `excludeUrl` predicate + an ncdb
change + an electron restart) for ~0 measurable benefit — the BLOATING pattern. So the
module's real leverage in the frontier is **OBSERVABILITY, not selection**:
`tools/crawl/frontier-composition.js` (cycle 77) is the first real url-intelligence
consumer — a repeatable frontier-health + junk-growth report (module label
distribution × copilot-admit overlap × cross-host share-junk count). The ~17k share-junk
rows are host-scoped-unreachable dead weight; removing them is a DATA deletion (owner-
gated), and preventing their future storage is a crawler-engine (news-crawler-itself)
discovery-time change — both deferred, neither a selection veto.

**Subset-delegation nuance (adversarial-verify D).** "No clean subset delegation" is
true only in the POSITIVE direction — the module cannot *positively* decide
article-shape for copilot (224 `unknown` coverage holes + 89 section over-calls). A
NEGATIVE-label **veto** is the feasible subset: use the module ONLY to REJECT URLs it
confidently labels `static_asset` / `api_endpoint` (copilot's genuine blind spots,
near-zero false-article risk), keeping copilot's own positive article/hub/place-hub
detection. Do NOT include `media_page` in the veto without first measuring its
real-article fraction (115 cases, "debatable" — some `/video/<slug>` are legitimate
frontier targets); shipping that veto blind would violate this plan's own
don't-ship-without-measurement gate. The additive pre-filter above IS this veto,
scoped to the safe labels.

**Two copilot product bugs the harness surfaced (independent of any module use).**
`isArticleShapedUrl` **under-selects** 136 real articles (its trailing-slash rejection
and `[a-f0-9]{12,}|\d{6,}` short-id test drop e.g. bbc `/sport/.../articles/<shortid>`
and nytimes `/athletic/.../<slug>/`), and **over-selects** 33 live-blog
`?page=with:block` pagination fragments (its date-path regex matches them). Both are
candidates for a deliberate, reviewed edit to copilot's OWN predicate — the correct
home for these fixes, not a foreign-taxonomy swap.

## 6. Extraction #2 — document-intelligence: SCOUTED cycle 80, drop-in BLOCKED, wired + measured

A 3-reader measure-before-build scout + a page-fixture harness found the first
document-intelligence delegation is a **repoint-in-disguise on THREE independent
axes** — do NOT repoint any copilot content-signal/classification consumer onto it:

1. **INPUT** — `analyze_document(html, url)` re-parses the HTML with its OWN
   `cheerio.load` (+2 whole-DOM clones for visible/body text). Copilot already parses
   each page ONCE and shares that `$` across process/canonical/analysis
   (ArticleProcessor.js:86). Delegating on the crawl worker hot path adds a 2nd/3rd
   full parse — directly reversing task #46's triple→single collapse. There is NO seam
   to hand the module a pre-parsed `$` (the `extract_*_nodes` builders are un-exported),
   and the cheerio versions differ (copilot 1.1.2 vs module 1.2.0). Worst of all, the
   extra parse buys **ZERO decision value**: copilot's `isArticle` is
   `looksLikeArticle(url) || Readability wordCount>150` (ArticleProcessor.js:97) —
   `contentSignals` are computed + persisted but never gate article-vs-hub.
2. **OUTPUT-SHAPE** — copilot's consumers (`combineSignals`, Stage2, `evaluateArticleCandidate`)
   branch on a WEIGHTED numeric `schema.score` (0–8, thresholds ≥6/≥3.5/>0.5) the module
   NEVER emits (it gives flat booleans; no `h2`/`h3`/`schemaWordCount`). Wiring existing
   consumers to it = a consumer rewrite (the ncdb normalized-shape trap), not a swap.
3. **TAXONOMY** — module `{article,hub,unknown}` + a 9-value detailed label set vs
   copilot `{article,hub,nav,other}`; `nav`/`other` have no module source.

**The module's real value is NEW capability, not a substitute.** The page-fixture harness
(`tools/intelligence/doc-intel-diff.js`, over 80 real decompressed `content_storage`
pages) measured that **46% of pages get a detailed label copilot has no content-signal
home for** (organization_page, opinion_article, product_page, login_page,
error_page). **But** spot checks show the module MISLABELS real pages (a news article
→ `login_page`, `/about` → `opinion_article`), so its labels are NOT trustworthy as-is —
any ADDITIVE-OFFLINE adoption (on `detect-articles`/`analyse-pages`, where a re-parse is
free — NEVER the crawl hot path) needs a labelled-fixture accuracy pass first.

**Wired this cycle (not consumed):** `src/intelligence/documentIntelligence.js`
(`createDocumentClassifier()`, mirrors urlIntelligence.js — dynamic import, load-once,
sync `classifyDocument(html,url)`, crash-proof guards; 10 tests) +
`tools/intelligence/doc-intel-diff.js` (the page-fixture harness). Same honest outcome
as extraction #1 (url-intelligence): wired + measured + correctly blocked.

**OFFLINE ADOPTION also NO-GO — accuracy gate FAILED (cycle 81).** The cycle-80 harness
said an ADDITIVE-OFFLINE adoption needs a labelled-fixture accuracy pass first (the
module mislabels real pages). Cycle 81 ran it (`doc-intel-diff.js --accuracy`, ground
truth = copilot's `content_analysis.classification='article'`, 300 confirmed articles):
the module calls a confirmed article "article" only **38%** of the time and produces a
**39% HARD false-positive rate** (real news articles → `login_page`/`product_page`/
`organization_page`/`error_page` — e.g. "Trump says China's Xi to visit" → product_page,
"Newsom orders… clearing encampments" → login_page). GATE = ≥80% recall AND ≤5% hard-FP →
**FAIL**. The module's document classifier is **miscalibrated for news content** — it
over-fires its distinctive labels on real articles, so it is NOT usable offline as-is,
even for tagging. **Feed-back for the module owner:** news-content recalibration
(thresholds/priority order for login/product/organization vs news_article) is required
before `news-crawler-document-intelligence` is adoptable by copilot on any path. The
`--accuracy` gate is committed and repeatable to re-check after any recalibration.

## 7. Extraction #3 — places-intelligence: SCOUTED cycle 83, FEASIBLE-in-practice, quality gate not yet passed

The third and highest-value module (`@metabench/news-crawler-places-intelligence`,
multilingual place detection). **Unlike #1 and #2, this one is FEASIBLE — the first
extraction to reach LIVE instantiation against copilot's own data.** A 3-reader
understand workflow + my own validation confirmed feasibility on every axis that
blocked the earlier two:

- **INPUT boundary GREEN:** the engine detects in TEXT + URL (`find_in_text(text,
  {article_lang})`), not HTML — copilot already has `content_analysis.body_text`, so
  NO re-parse (the exact blocker that killed #2).
- **GAZETTEER data present:** news.db has `place_names` (810k), `places` (14.5k),
  `place_external_ids` (16k); tier2 loads 561,609 names across **491 languages**.
- **ncdb ACCESS interface matches EXACTLY:** the module reads via an ncdb
  `SqliteGazetteerAccess` object (zero SQL of its own); ncdb's class already implements
  the four methods the module needs (`listPlaceNameRowsForIndex` +314/342/362) — the two
  were co-designed, so it plugs in with **no adapter gap** (`createDbAdapter({type:'sqlite',
  path, readonly}).gazetteer`).

**Instantiated live** (bridge `src/intelligence/placesIntelligence.js`): engine builds in
~41s / ~510MB RSS (a heavy ONE-TIME offline cost, not a hot-path cost — construction is
async, `find_in_text` is sync at ~27ms p50/article). It correctly **suppresses English
common-word traps** ("reading the news *may* bring hope to the *world*…" → 0 places) that
copilot's experimental `basic_string_match` (`ArticlePlaceMatcher`, the source of the
`world`→place_id-999999 FP) tags verbatim, and detects CJK/Arabic places (北京, القاهرة).

**But the curated precision gate (hand-labeled, non-circular) FAILS on both tiers — a
precision/recall trade-off with no usable operating point as-configured:**

| tier | common-word traps rejected | real-place recall | note |
| --- | --- | --- | --- |
| tier2 (city-only) | 87.5% | 72.7% | structurally can't see countries |
| tier1 (country/region/city) | **50%** | 90.9% | function-word homographs (It/and/to/is/be) flood in |

Real-article sample (60 rows): 27.4 places/article (over-detection), ~7.4% obvious
function-word/≤2-char FPs (As→Aš, most→Most, at→Ât), and **inflected-language misses**
(Russian "Москве" — locative of Moscow — unmatched; gazetteer holds only nominative
"Москва"). All returned matches carry `verdict:'place'`.

**VERDICT:** places-intelligence is the **strongest candidate of the three** — feasible,
structurally sound, and its weaknesses are *tunable* (a stop-word/min-confidence layer +
tier choice), NOT the fundamental miscalibration that blocked #2 (38% recall). It is still
NOT shippable as a drop-in this cycle: adoption is **ADDITIVE-OFFLINE** (an
`analyse-places` enrichment pass over `body_text`), behind (a) tier1 for country coverage,
(b) a stop-word/confidence post-filter to kill the function-word FPs, and (c) a
language-tagged multilingual accuracy pass. Never the crawl hot path, never a silent
repoint of the `article_places`(name-string)/`article_place_relations`(place_id-FK)
consumers. Repeatable gate: `tools/intelligence/places-intel-diff.js --gate --sample`.
Feed-back for the module owner: the function-word-homograph FP class (tier1) + inflected
name matching are the two levers that would make it directly adoptable.

### 7a. ADOPTED (cycle 84) — precision post-filter flips the gate to PASS + a shipped enrichment

Cycle 84 turned the cycle-83 "tunable" into a shipped, measured adoption. The FPs were
measured (not guessed) to be DOMINATED by function-word homographs matched to 2-letter ISO
codes / tiny places (It→IT, and→AND-Andorra, to→TO-Tonga, El→"the"-es) at confidence ≤0.80,
while real places score ≥0.85. So a two-lever precision post-filter was added to the bridge
(`src/intelligence/placesIntelligence.js`): a **multilingual function-word stop set**
(`DEFAULT_STOP_WORDS`, en+es/pt/it/fr/de/nl + observed non-Latin) matched on the lowercased
surface form, plus a **min-confidence floor** (`DEFAULT_MIN_CONFIDENCE=0.75`). It is opt-in
(`filter:true` or `{stopWords,minConfidence}`) so the harness still A/Bs raw-vs-filtered.

**Result — the curated gate FLIPS to PASS at tier1 with the filter:** common-word traps
rejected 8/8 (100%, was 50%), real recall 10/11 (90.9%, unchanged) — the sole miss is
"Moscow" (a module recall gap on the English exonym, present even raw). Real-article sample
(80 rows): places/article 27.4 → **9.2** (the FP tail removed), likely-FP indicator 7.4% →
3.3%, and the 3.3% residue is now dominated by DEFENSIBLE abbreviations (UK→UK, EU→ÉU) that
the ≤2-char heuristic over-flags, not clear errors.

**Shipped the first real CONSUMER** — `tools/intelligence/enrich-places.js` (dry-run default,
`--commit`, idempotent delete-then-insert, `--out-db` for tests): runs the filtered engine
over stored `body_text` and records mentions into a NEW ADDITIVE table
`article_place_mentions` (keyed `content_analysis.id` + `places.id`), **never touching**
`article_places`/`article_place_relations`. Committed 11,822 mentions across 500 articles;
verified the existing tables are UNCHANGED (9808/73), **0 orphan place_ids** (every place_id
resolves to a real `places` row — the concrete quality win over the incumbent
`basic_string_match`'s 999999 sentinel that breaks the places join), idempotent on re-run,
app healthy, dedup holds. Tests: bridge 23/23, enrich write-path 6/6. **NOTE (measured):**
`content_analysis.body_text` and `.language` are populated in DISJOINT eras (overlap=0), so a
language-TAGGED body_text accuracy pass isn't possible on stored data — irrelevant to
detection (the module is script-driven, not article_lang-driven). Adoption stays
ADDITIVE-OFFLINE; the existing consumers are untouched.

## 5. Artifacts committed this cycle

- `src/intelligence/urlIntelligence.js` — the CJS→ESM bridge (loader + guards + adapter + `createUrlClassifier`).
- `tools/intelligence/url-intel-diff.js` — the differential-equivalence harness (reusable for #2/#3).
- `src/intelligence/__tests__/urlIntelligence.test.js` — 11 tests (pure helpers, loader fallback/loud-fail, crash-proof guards, real-module integration).
- This plan.

Not done (deliberately, gated by evidence): any change to `isArticleShapedUrl` or its
callsites; any package.json hard `file:../` dep (premature while the delegation is
blocked — the bridge reaches the sibling `dist/` exactly like `news-db-analysis`;
promotion is the future additive-consumer cycle's step).
