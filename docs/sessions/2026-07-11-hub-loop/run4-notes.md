# Hub Loop — Run 4: P2 slug segmentation engine — PROVEN (with a data-gap finding)

## The engine

`src/core/crawler/hubs/slugSegmenter.js` — PURE longest-match-with-place-preference segmenter (injectable lexicon), + `slugLexicon.js` `segmentSlugAsync` (DB-backed, resolves coverage like the sitemap cache: adapter.coverage / adapter.db.coverage / _getCoverageAccess). Emits `{hubKind: place|topic|composite|unknown, members:[{memberType, placeSlug|topicSlug, placeId, role, position}], confidence, unresolved, alternatives}`. Roles: places → subject/counterpart in order, topics → theme.

DB lexicon accessors added to news-crawler-db coverage: `lookupPlaceByNormalized(phrase)` (place_names.normalized, indexed; multi-variant space/hyphen), `lookupTopicByTerm(phrase)` (topic_keywords + non_geo_topic_slugs). tsc 0. Reconciled a linter-duplicated interface block in types.ts.

## Proof

**Unit (injected lexicon), 10/10** — every composite required by STATE: russia-ukraine-war → `[place:russia, place:ukraine, topic:war]` (ordered, roles subject/counterpart/theme); israel-gaza-war; us-china-trade; **new-caledonia → ONE place** (longest-match beats new+caledonia); unresolved-token handling; confidence.

**Real gazetteer (production news.db, read-only)** — place side works on live 737K-row data: russia→placeId 388, new-caledonia→placeId 488 (ONE place), zimbabwe/israel/gaza/china all resolve. Segmentation of new-caledonia against real data = one place ✓.

## FINDING: topic lexicon under-populated (blocks composites on real data)

`war` and `trade` return null from the real topic lexicon (73 topic_keywords + 12 non_geo_topic_slugs — no event/theme terms). So russia-ukraine-war on REAL data → `[place:russia, place:ukraine]` + unresolved `war`. The engine is correct; the DATA is thin. Fix (bounded, additive, sample-then-production DATA write — NOT schema): seed curated topics (war, trade, crisis, election, protest, floods, earthquake, ceasefire, wildfire…) into non_geo_topic_slugs via a module accessor. Added to plan §3b. This is the P2 completion item and the natural start of run 5.

## Files changed (UNCOMMITTED)
copilot-dl-news: src/core/crawler/hubs/{slugSegmenter.js, slugLexicon.js, __tests__/slugSegmenter.test.js} + tools/crawl/{p2-lexicon-probe.js, p2-segment-proof.js}. news-crawler-db: coverage.ts (lexicon accessors), types.ts (dedup + lexicon interface). Plan §3b added.
