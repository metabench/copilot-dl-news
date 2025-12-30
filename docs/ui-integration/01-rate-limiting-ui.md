# Rate Limiting UI Integration

## Overview

The Rate Limiting system controls API request quotas per API key, with tier-based limits. Currently implemented as backend middleware only.

## Current Implementation

**Location**: `src/api/v1/middleware/rateLimit.js`

**Existing Features**:
- Per-key rate limiting with sliding window
- Tier-based limits (free: 100/min, premium: 1000/min, unlimited)
- Standard rate limit headers (X-RateLimit-*)
- In-memory store with optional DB-backed tracking

## Full Feature Set for UI

### 1. Rate Limit Dashboard Panel

**Purpose**: Real-time visibility into API usage across all keys

**Data Points to Display**:
- Current requests in window per key
- Remaining quota percentage (gauge)
- Rate limit hits (429s) count and trend
- Top consumers by request volume
- Usage heatmap (hour × day)

**Metrics**:
```
requests_current    - Requests in current window
requests_limit      - Maximum allowed in window
requests_remaining  - Quota remaining
window_reset_at     - When window resets (epoch ms)
rate_limit_hits     - Count of 429 responses
```

### 2. API Key Rate Limit Status

**Per-Key View**:
- Key ID / name
- Tier (free/premium/unlimited)
- Current usage bar (0-100%)
- Requests today / this hour / this minute
- Last request timestamp
- 429 count (last 24h)

### 3. Rate Limit Configuration UI

**Admin Controls**:
- View/edit tier limits
- Override limits for specific keys
- Set burst allowance
- Configure penalty duration for abuse
- Enable/disable rate limiting globally

### 4. Alerts & Notifications

**Configurable Alerts**:
- Key approaching limit (80%, 90%, 95%)
- Key exceeded limit (429 returned)
- Unusual spike in traffic
- Potential abuse detection

---

## Work To Be Done

### Phase 1: Data Layer (4 hours)

1. **Create rate limit stats aggregator**
   - File: `src/api/v1/services/RateLimitStatsService.js`
   - Track per-key usage over time
   - Aggregate hourly/daily stats
   - Store in SQLite table `api_rate_limit_stats`

2. **Add database schema**
   ```sql
   CREATE TABLE api_rate_limit_stats (
     id INTEGER PRIMARY KEY,
     api_key_id TEXT NOT NULL,
     window_start INTEGER NOT NULL,
     requests_count INTEGER DEFAULT 0,
     limit_hits INTEGER DEFAULT 0,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP,
     UNIQUE(api_key_id, window_start)
   );
   ```

3. **Expose stats via middleware**
   - Hook into existing rateLimit middleware
   - Emit events on limit check/hit
   - Persist stats asynchronously

### Phase 2: API Endpoints (3 hours)

1. **GET /api/admin/rate-limits**
   - List all API keys with current usage
   - Include tier, usage%, remaining, reset time

2. **GET /api/admin/rate-limits/:keyId**
   - Detailed stats for single key
   - Historical usage (hourly for 24h, daily for 30d)

3. **GET /api/admin/rate-limits/stats**
   - Aggregate stats across all keys
   - Top consumers, 429 trends, usage patterns

4. **PATCH /api/admin/rate-limits/:keyId**
   - Override limit for specific key
   - Set custom tier/burst allowance

### Phase 3: UI Components (6 hours)

1. **RateLimitDashboard control**
   - File: `src/ui/server/adminDashboard/controls/RateLimitDashboard.js`
   - Summary cards (total keys, requests/min, 429s)
   - Usage gauge per tier
   - Top consumers table

2. **RateLimitKeyDetail control**
   - Per-key detailed view
   - Usage chart (line graph)
   - Request log table

3. **RateLimitConfig control**
   - Tier limit editor
   - Per-key override form
   - Global enable/disable toggle

### Phase 4: Integration & Polish (3 hours)

1. **Add to admin dashboard navigation**
2. **Real-time updates via polling or SSE**
3. **Alert configuration UI**
4. **Export rate limit reports**

---

## Estimated Total: 16 hours

## Dependencies

- Existing: `src/api/v1/middleware/rateLimit.js`
- Existing: `src/api/v1/middleware/auth.js` (API key lookup)
- New: Stats aggregation service
- New: Admin API routes
- New: jsgui3 controls

## Success Criteria

- [ ] Admin can view all API keys and their current usage
- [ ] Real-time usage gauges update every 5 seconds
- [ ] Historical usage charts show 24h/30d trends
- [ ] Admin can override limits per key
- [ ] Alerts fire when keys approach/exceed limits
- [ ] 429 events are logged and queryable
