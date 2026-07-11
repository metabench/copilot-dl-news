# Hub Loop — Run 5: P2 COMPLETE on real data + P3 started (hub identifier)

## P2 completed — topic lexicon seeded, composites resolve fully on production

Added `coverage.upsertTopicSlugs(entries)` (additive, idempotent by slug; tsc 0). Seeded 20 curated event/theme topics (war, trade, crisis, election, protest, floods, earthquake, wildfire, ceasefire, summit, sanctions, conflict, strike, referendum, coup, pandemic, drought, famine, migration, inflation) into `non_geo_topic_slugs`. Sample-proven first (accessor upserted 20; "war" resolves), THEN applied to **production news.db** (additive DATA write, permitted by mission + named on next:).

**Result on production data (p2-topic-seed.js --db data/news.db):**
- russia-ukraine-war → **[place:russia, place:ukraine, topic:war]** — full composite, 0 unresolved
- israel-gaza-war → [place:israel, place:gaza, topic:war]
- us-china-trade → [place:us, place:china, topic:trade]
- new-caledonia → [place:new-caledonia] (ONE place)

The composite-hub flexibility is now end-to-end on real gazetteer + topic data. P2 DONE.

## P3 started — hubIdentifier (URL → slug → segment → persist)

`src/core/crawler/hubs/hubIdentifier.js`: `slugFromHubUrl(url)` (extracts hub slug; rejects article paths via date-segment / length / .html heuristics) + `identifyAndPersistHub({host,url,adapter,segment?})` (segments via slugLexicon, upserts hub+members through coverage.upsertHub, skips unresolved/low-confidence/article URLs). Pure orchestration; DB only via accessors; segmenter injectable for tests.

Tests **10/10**: composite + place persistence with ordered members, unresolved-skip (no write), article-URL-skip, and all slugFromHubUrl heuristics.

Remaining P3 (next run): wire identifyAndPersistHub into the live hub-discovery path (GuessPlaceHubsOperation / PageExecutionService place-hub detection) so real crawls populate the hubs table, then verify on a bounded crawl.

## Files changed (UNCOMMITTED)
copilot-dl-news: src/core/crawler/hubs/{hubIdentifier.js, __tests__/hubIdentifier.test.js} + tools/crawl/p2-topic-seed.js. news-crawler-db: coverage.ts (upsertTopicSlugs), types.ts. Production news.db: +20 non_geo_topic_slugs rows (additive data).
