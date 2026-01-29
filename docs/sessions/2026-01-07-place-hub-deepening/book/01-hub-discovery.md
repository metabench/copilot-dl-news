# Hub Discovery & Verification

The first step in building a comprehensive place database is discovering the "Hub Pages" that publishers use to aggregate content about specific countries, regions, and cities.

## The Strategy: "Guess and Verify"

Instead of crawling randomly, we generate likely hub URLs based on known publisher patterns and verified place names.

### 1. Generating Candidates

We take our list of `places` (countries first) and combine them with publisher hub patterns.

**Example Patterns:**
- The Guardian: `/world/{slug}`
- BBC: `/news/world-{slug}`
- Reuters: `/world/{slug}`

For verified existing places, we generate URL candidates:
- `China` -> `theguardian.com/world/china`
- `United States` -> `theguardian.com/world/usa`, `theguardian.com/world/united-states`

### 2. Verification Probe

We send a lightweight HTTP HEAD or GET request to the candidate URL.

- **200 OK**: Potentially a hub. We inspect the content for "Hub Signals":
    - Title matches place name?
    - Significant number of article links?
    - "Topic" or "World" metadata in HTML?
- **301 Redirect**: Follow it. `.../world/usa` -> `.../us-news`. This is a valuable discovery! We record the final URL as the canonical hub.
- **404 Not Found**: Record as "verified-absent" to avoid re-checking frequently.

### 3. Recording in Database

Successful verifications are stored in `place_page_mappings`.

```sql
INSERT INTO place_page_mappings (place_id, host, url, page_kind, status, verified_at)
VALUES (123, 'theguardian.com', 'https://www.theguardian.com/us-news', 'country-hub', 'verified', NOW());
```
