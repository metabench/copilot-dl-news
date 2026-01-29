# Schema & API Design

## Database Schema

We extend the `place_page_mappings` table to support intelligent crawling.

### `place_page_mappings` Extensions

| Column | Type | Description |
|--------|------|-------------|
| `max_page_depth` | INTEGER | Validated maximum page number (e.g., 1900). 0 means unknown/failed. |
| `oldest_content_date` | TEXT | ISO date of the oldest article found at `max_page_depth`. |
| `last_depth_check_at` | TEXT | Timestamp of the last successful depth probe. |
| `depth_check_error` | TEXT | Error message if the last probe failed. |

### `article_place_relations` (New)

Explicit relationships derived from hub structure.

```sql
CREATE TABLE article_place_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    article_id INTEGER NOT NULL,
    place_id INTEGER NOT NULL,
    relation_type TEXT NOT NULL, -- 'primary' (from hub), 'mentioned' (nlp)
    confidence REAL NOT NULL,    -- 1.0 for hub-derived
    source TEXT NOT NULL,        -- 'hub_structure', 'nlp_bert', etc.
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(article_id) REFERENCES articles(id),
    FOREIGN KEY(place_id) REFERENCES places(id)
);
```

## Internal API

We define a Service Class `PlaceHubService` to encapsulate this logic.

```javascript
class PlaceHubService {
  /**
   * Get hubs that need a depth check.
   * Criteria: verified, depth=0 OR last_check > 7 days ago.
   */
  getHubsNeedingProbe(limit = 10);

  /**
   * Update the depth results for a hub.
   */
  updateHubDepth(hubUrl, depth, oldestDate);

  /**
   * Generate crawl tasks for a specific hub.
   * If full=true, generates 1..maxDepth.
   * If full=false, generates 1..3 (maintenance crawl).
   */
  generateCrawlTasks(hubMappingId, full = false);
}
```
