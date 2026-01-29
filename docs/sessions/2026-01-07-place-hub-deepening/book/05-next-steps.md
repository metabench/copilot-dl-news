# Next Steps & Execution Plan

We have validated the "Hub Probe" capabilities and defined the schema.

## Phase 1: Tooling Hardening (Done)
- [x] Create `probe-hub-depth.js`
- [x] Handle "Section" pages vs "Tag" pages (US News pagination fix)
- [x] Implement robust loopback detection (Time Travel check)
- [x] Update DB schema

## Phase 2: Crawler Integration (Pending)
The main crawler needs to be aware of these hubs.

1. **Task Generator**: Create a system that reads `place_page_mappings` and pushes jobs to the `tasks` table.
2. **Prioritization**: High-value countries (US, UK, France, etc.) should be prioritized for deep archiving.
3. **Throttling**: Deep crawling 1900 pages for *one* country should be rate-limited (e.g. 1 page/sec) to avoid bans.

## Phase 3: The "Forever Archive"
Once a deep crawl is complete (e.g. US pages 2-1900), those pages are effectively **Read-Only**.
- We mark them as `status='archived'` in a tracking table.
- Future crawls only check Page 1.
- If Page 1 articles > last_seen_article_date, we crawl to Page 2, 3... until we overlap.

## Immediate Action Items
1. Run `probe-hub-depth.js` on the full verified set (limit=100 or 500) to populate the DB.
2. Build the `article_place_relations` table migration.
3. Update the main crawler configuration to consume Hub Tasks.
