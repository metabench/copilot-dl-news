# Hub Depth Probing

Once we verified a Hub Page exists, we need to know: **How much history does it hold?**

Knowing a hub effectively archives articles back to 1956 (like Bangladesh) vs 2010 (like South Sudan) is critical for:
1.  **Prioritizing Crawls**: Deep hubs are gold mines for historical data.
2.  **Disambiguation**: If an article is found on the "Bangladesh" hub, we have 100% confidence it is about the country, not a city elsewhere.

## The "Search & Bound" Algorithm

We determine historical depth without crawling every page. We find the "edge" of the archive using an exponential + binary search strategy.

### Algorithm Steps

1.  **Probe Page 1**: Confirm the hub is alive and extract the date of the newest article.
2.  **Exponential Search**: Check pages 2, 4, 8, 16, 32... magnitude `N`.
    -   We look for a **200 OK** with valid article content.
    -   We stop when we hit:
        -   **404 Not Found**
        -   **Loopback** (Redirects back to Page 1, common in Guardian/WordPress sites).
        -   **Empty** (200 OK but 0 articles).
3.  **Binary Search**: Once we have a "Good" page (e.g., 64) and a "Bad" page (e.g., 128), we binary search the interval to find the exact last valid page (e.g., 100).
4.  **Date Extraction**: On that last valid page, the oldest article date represents the "Historical Horizon" of that hub.

### Handling Edge Cases (Section Pages)

Some hubs (like `/us-news` on The Guardian) behave differently from standard "Tag" pages (`/world/france`).
-   **Tag Pages**: Support `?page=N` natively.
-   **Section Pages**: Often redirect `?page=N` back to page 1 unless the `/all` subpath is used (e.g., `/us-news/all?page=N`).

**Heuristic Fix**:
If our probe fails immediately at Page 2 on a non-standard path, we automatically retry the probe with `/all` appended.

### Storage

We store this metadata in `place_page_mappings` to inform the crawler:

```sql
UPDATE place_page_mappings 
SET max_page_depth = 100, 
    oldest_content_date = '1956-03-23', 
    last_depth_check_at = NOW()
WHERE url = '...';
```
