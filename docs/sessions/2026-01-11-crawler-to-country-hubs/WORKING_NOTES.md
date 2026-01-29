# Working Notes: Crawler → Country Hubs

## Session Start: 2026-01-11T23:08Z

### Initial Exploration

**Files examined:**
- `src/core/crawler/NewsCrawler.js` - 2307 lines, main crawler orchestration
- `src/core/crawler/MilestoneTracker.js` - 292 lines, tracks crawl milestones
- `src/services/CountryHubGapAnalyzer.js` - 638 lines, country hub prediction
- `src/services/PlaceHubPatternLearningService.js` - 580 lines, pattern learning

---

## Current State Assessment (2026-01-11T23:13Z)

### Document Counts

**First check tool created:** `tools/checks/check-doc-counts.js`

**Results:**
```
Total news websites: 48
Meeting threshold (500+): 13
Under threshold: 35
```

**Top domains already meeting threshold:**
- The Guardian: 103,619 docs ✅
- BBC News: 30,938 docs ✅
- El Tiempo: 11,078 docs ✅
- Reuters: 8,759 docs ✅
- Toronto Star: 8,586 docs ✅

**Domains needing more crawling:**
- AP News: 378 docs (need 122 more)
- Financial Times: 183 docs
- The Independent: 180 docs
- CNN: 176 docs
- ...and 31 more

### Key Data Model Discovery

- `news_websites` table contains the **48 actual tracked domains**
- `urls` table contains ALL URLs ever seen (12K+ hosts including Wikipedia, etc.)
- Initial query mistake: was counting all hosts instead of just news websites
- **Important**: `parent_domain` field varies in specificity (e.g., `theguardian.com` vs `co.uk`)
- **Important**: No `latest_fetch` table exists in current schema

---

## Commands Run

```bash
# Check document counts
node tools/checks/check-doc-counts.js --threshold=500

# Output: 48 domains, 13 meeting threshold, 35 under
```
- No CLI tools for verification currently

---

## Commands Run

```bash
# (none yet - planning phase)
```

---

## Oracle Cloud Server Access (2026-01-11T23:22Z)

**Successfully connected to:** `144.21.35.104`
- User: ubuntu
- Key: `C:\Users\james\.oci\oci_api_key.pem`
- 45GB disk (8% used), 11GB RAM
- Running: `node server.js` (remote-crawler-lab)

**Existing on server:**
- `/home/ubuntu/labs/remote-crawler-lab/` - Standalone crawler with:
  - Express server on port 3120 (accessible from web)
  - SQLite database (crawler.db)
  - Speedometer UI
  - API: POST `/api/jobs` for queuing URLs

**Fixed:**
- Node.js module version mismatch (`npm rebuild better-sqlite3`)

---

## Local Crawler Testing (2026-01-11T23:35Z)

**Issue found:** `crawl.js.config.json` sets `startUrl` to Guardian
- This overrides CLI arguments
- Need to either modify config or use `--int-target-hosts` option

**CLI tool created:** `tools/remote-crawl/queue-urls-to-remote.js`
- Lists 35 domains needing more documents
- Can queue URLs to Oracle server (dry-run tested)
- URL generation is simplistic (needs sitemap/discovery logic)

---

## Next Steps

1. **Option A: Local crawl**
   - Modify `crawl.js.config.json` to target under-threshold domains
   - Or use sequence config to specify target hosts

2. **Option B: Enhanced remote crawler**
   - Deploy more of the codebase to Oracle server
   - Use its better network for fetching

3. **Option C: Simple hybrid**
   - Keep current simple remote crawler
   - Push URLs from local to remote
   - Pull results back

---

## Remote Crawl Test Results (2026-01-12T01:20Z)

### Infrastructure: ✅ Working
- Deployed `deploy/remote-crawler/` to Oracle server at `/home/ubuntu/apps/remote-crawler/`
- Express API running on port 3200
- SQLite schema working correctly
- Seeding, starting, stopping all work via API

### AP News Crawl Test
- **Result**: 200 pages fetched, all returned HTTP 429 (Cloudflare rate limit)
- Cloudflare blocks the Oracle Cloud IP range

### NPR Crawl Test  
- **Result**: All requests timeout ("operation aborted")
- Possibly slower response to automated requests or IP blocking

### Reuters Test
- **Result**: HTTP 401 (unauthorized) - CloudFront blocking

### DW Test
- **Result**: HTTP 301 redirect (server responds, not blocked)
- Likely candidate for successful crawl

### Findings
Many major news sites have bot/datacenter IP blocking:
- AP News: Cloudflare (429)
- Reuters: CloudFront (401)
- NPR: Timeouts

**The modular crawler code works correctly** - the issue is server IP reputation not code.

## Successful Deployment & Discovery (2026-01-12T01:35Z)

### 1. Bundling Solution (Imports from everywhere)
- Created `tools/remote-crawl/bundle.js` using `esbuild`
- Bundles the entire server + local source files into a single `dist/server.js`
- Solves "imports from all over the project" requirement securely and simply

### 2. Auto-Discovery Verification
- Seeded only `https://www.dw.com/en` (1 URL)
- Result after ~1 minute:
  - **Fetched**: 48 pages
  - **Discovered**: 880 URLs (Recursive discovery works!)
  - **Rate**: ~1.2 pages/sec
  - **Status**: Running smoothly with rate limiting active

### 3. Rate Limit Implementation
- Added `lib/rate-limiter.js`
- Checks `robots.txt` for `Crawl-delay`
- Tracks 429s and learns safe RPM
- Currently crawling DW at ~290 RPM (very efficient)

---

## Findings

### Document Count Tracking

Currently tracked in `MilestoneTracker.js` via milestones. Need to check:
- How are per-domain counts stored?
- What query exposes this data?

### Country Hub Guessing

`CountryHubGapAnalyzer.predictCountryHubUrls()` exists - takes domain + country info, returns predicted URLs.

Dependencies:
- `gazetteerData` - injected
- `db` - for checking existing patterns
- `dsplDir` - for DSPL lookups

### Pattern Storage

`src/data/db/placeHubUrlPatternsStore.js` - 14KB, handles pattern storage.

---

## TODO

- [ ] Create `tools/checks/` directory
- [ ] Build `check-doc-counts.js` first to assess current state
- [ ] Review existing DB queries for document counts
