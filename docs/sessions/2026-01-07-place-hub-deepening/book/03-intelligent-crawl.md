# Intelligent Crawling

The goal is to move from "dumb" link-following to "intelligent" systematic archival.

## The "Hub-First" Strategy

Instead of following random links, the crawler prioritizes **Verified Hubs**.

### 1. The Queue

The crawl queue is seeded with tasks from `place_page_mappings` where `status = 'verified'` and `max_page_depth > 0`.

### 2. Pagination Traversal

For each hub, we generate tasks for every page from 1 to `max_page_depth`.
- `https://www.theguardian.com/world/bangladesh?page=1`
- ...
- `https://www.theguardian.com/world/bangladesh?page=100`

### 3. Article Extraction & Association

When an article is discovered via a specific Hub Page, we gain **Contextual Certainty**.

**The Golden Rule**: 
> "If an article URL was purely discovered via the pagination of the 'Bangladesh' hub, then 'Bangladesh' is a Primary Topic of that article."

We store this explicit relationship immediately:

```sql
INSERT INTO article_place_relations (article_id, place_id, relation_type, confidence, source)
VALUES (123, 456, 'primary', 1.0, 'hub_structure');
```

This bypasses the need for complex NLP for these specific relationships. The site structure *is* the classifier.

### 4. Preventing Redundancy

The system checks `place_page_mappings` before crawling.
- If `last_depth_check_at` is recent (< 7 days), we assume the historical depth hasn't changed (history doesn't change, only today advances).
- We only need to crawl "Page 1" frequently to catch new news.
- The "Deep Archive" (Pages 2-100) is static. We crawl it once, mark it done, and never re-crawl unless we detect a structural site change.
