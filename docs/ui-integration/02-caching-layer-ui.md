# Smart Caching Layer UI Integration

## Overview

The Caching Layer provides intelligent response caching with TTL management, cache invalidation, and hit/miss tracking. Currently operates as a backend-only system.

## Current Implementation

**Locations**:
- `src/api/v1/middleware/` - Response caching
- `src/services/NewsWebsiteStatsCache.js` - Domain stats cache
- `src/ui/server/services/metricsService.js` - UI metrics cache

**Existing Features**:
- LRU cache with configurable size
- TTL-based expiration
- Cache-Control header support
- Hit/miss ratio tracking (internal)

## Full Feature Set for UI

### 1. Cache Overview Dashboard

**Purpose**: Monitor cache health and performance

**Metrics to Display**:
- Total cache size (entries / bytes)
- Hit rate (1m / 5m / 1h / 24h)
- Miss rate and reasons
- Eviction count
- Memory usage vs limit

**Visual Components**:
- Hit/miss ratio gauge (target: >80%)
- Cache size bar (used/total)
- Hit rate trend line (24h)
- Top cached endpoints table

### 2. Cache Entry Browser

**Entry List View**:
- Key pattern search
- Filter by: endpoint, TTL remaining, hit count
- Sort by: size, hits, age, TTL
- Bulk invalidation selection

**Entry Detail View**:
- Full cache key
- Cached response preview
- Created at / expires at
- Hit count
- Size (bytes)
- Invalidation button

### 3. Cache Configuration

**Editable Settings**:
- Max cache size (entries / MB)
- Default TTL per endpoint pattern
- Cache-Control header overrides
- Bypass patterns (never cache)
- Force-cache patterns (always cache)

### 4. Cache Operations

**Admin Actions**:
- Invalidate single entry
- Invalidate by pattern (glob/regex)
- Invalidate by endpoint
- Flush entire cache
- Warm cache (pre-populate)

### 5. Cache Analytics

**Insights**:
- Most frequently cached endpoints
- Highest hit-rate entries
- Entries never hit (waste)
- Optimal TTL recommendations
- Cost savings estimate (requests avoided)

---

## Work To Be Done

### Phase 1: Cache Instrumentation (4 hours)

1. **Create unified CacheManager**
   - File: `src/cache/CacheManager.js`
   - Wrap existing caches with consistent interface
   - Add instrumentation hooks
   - Track all cache operations

2. **Add cache metrics collection**
   ```javascript
   class CacheMetrics {
     hits: Map<string, number>     // per-key hit count
     misses: Map<string, number>   // per-key miss count
     evictions: number
     bytesUsed: number
     entriesCount: number
     hitsByEndpoint: Map<string, number>
   }
   ```

3. **Create cache stats table**
   ```sql
   CREATE TABLE cache_stats (
     id INTEGER PRIMARY KEY,
     cache_name TEXT NOT NULL,
     timestamp INTEGER NOT NULL,
     hits INTEGER DEFAULT 0,
     misses INTEGER DEFAULT 0,
     evictions INTEGER DEFAULT 0,
     bytes_used INTEGER DEFAULT 0,
     entries_count INTEGER DEFAULT 0
   );
   ```

### Phase 2: API Endpoints (3 hours)

1. **GET /api/admin/cache/stats**
   - Overall cache health metrics
   - Per-cache breakdown
   - Time-series data (hourly for 24h)

2. **GET /api/admin/cache/entries**
   - Paginated entry list
   - Filter/search support
   - Include hit counts

3. **GET /api/admin/cache/entries/:key**
   - Single entry details
   - Response preview (truncated)

4. **DELETE /api/admin/cache/entries/:key**
   - Invalidate single entry

5. **POST /api/admin/cache/invalidate**
   - Bulk invalidation
   - Pattern-based (glob/regex)

6. **POST /api/admin/cache/flush**
   - Flush entire cache
   - Requires confirmation token

### Phase 3: UI Components (6 hours)

1. **CacheDashboard control**
   - File: `src/ui/server/adminDashboard/controls/CacheDashboard.js`
   - Health summary cards
   - Hit rate gauge (0-100%)
   - Size usage bar
   - Recent activity feed

2. **CacheEntryBrowser control**
   - Searchable/filterable table
   - Entry preview modal
   - Bulk selection checkboxes
   - Invalidate button

3. **CacheConfig control**
   - TTL settings editor
   - Size limits configuration
   - Pattern rules (bypass/force)

4. **CacheAnalytics control**
   - Hit rate over time chart
   - Top entries by hits
   - Waste detection (0-hit entries)

### Phase 4: Integration (3 hours)

1. **Connect to existing caches**
   - metricsService cache
   - NewsWebsiteStatsCache
   - API response cache

2. **Add cache panel to admin dashboard**
3. **Real-time stats updates**
4. **Export cache report**

---

## Estimated Total: 16 hours

## Dependencies

- Existing: `src/services/NewsWebsiteStatsCache.js`
- Existing: `src/ui/server/services/metricsService.js`
- New: Unified CacheManager
- New: Cache stats collection
- New: Admin API routes

## Success Criteria

- [ ] Admin can view overall cache health (hit rate, size)
- [ ] Cache entries are browsable and searchable
- [ ] Single entries can be invalidated
- [ ] Bulk invalidation by pattern works
- [ ] Hit rate trends visible over 24h
- [ ] Cache configuration is editable
- [ ] Flush cache requires confirmation
