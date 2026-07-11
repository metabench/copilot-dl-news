# Hub Loop — Run 6: P3 pipeline PROVEN on production; dual-write wired

## Wiring

`HubSeeder._recordSeedInDatabase(host, hubUrl, meta)` — the crawl's single place-hub seed point — now DUAL-WRITES: after the legacy `recordPlaceHubSeed` (place_hubs, authoritative during transition), it fires `identifyAndPersistHub({host, url, adapter: this.db})` best-effort (fire-and-forget, catches all — never affects the crawl). Both HubSeeder.js and hubIdentifier.js load clean on the operator machine (sandbox mount showed a false truncation; verified via run-node).

## Pipeline PROVEN end-to-end on PRODUCTION news.db

`p3-identify-persist-proof.js` ran identifyAndPersistHub against production (real gazetteer + seeded topics), creating hubs/hub_members (additive) and persisting:
- zimbabwe → **place** hub (1 member)
- new-caledonia → **place** hub, ONE member (longest-match holds on real data)
- russia-ukraine-war → **composite**, read back as ordered `place:russia@0, place:ukraine@1, topic:war@2`

`p3-hub-check.js`: production `hubs`=3 (1 composite, 2 place), `hub_members`=5. The generalized hub tables are live in production with correct composite membership.

## Why the live CRAWL didn't auto-populate (diagnosed, not a bug)

The test crawl was `crawlCountryHubHistory` — a history REFRESH of an already-known hub, which does not run hub SEEDING. HubSeeder is constructed/invoked by **IntelligentPlanRunner** (intelligent-hubs / discover-structure / place-topic planning). So the dual-write fires during DISCOVERY crawls, not history refresh. The wiring is at the correct anchor; it needs a discovery-type operation to trigger live.

## Next run
Prove the live dual-write: bounded ≤10pp crawl with a discovery operation (ensureCountryHubs or findPlaceAndTopicHubs) via UI restart + bounded-dispatch, then p3-hub-check --since to confirm NEW hubs appear from the crawl itself (not a script). Then P3 freshness (§4.5) or P4/P5.

## Files changed (UNCOMMITTED)
copilot-dl-news: src/core/crawler/planner/HubSeeder.js (dual-write) + tools/crawl/{p3-hub-check.js, p3-load-check.js, p3-identify-persist-proof.js}. Production news.db: hubs/hub_members created + 3 hubs/5 members (additive). hubIdentifier tests 10/10 (run 5).
