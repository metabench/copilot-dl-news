# Chapter 2: The Fetch Pipeline

## Overview

The Fetch Pipeline is a multi-layered HTTP fetching system with sophisticated fallback mechanisms, rate limiting, retry policies, and caching. It handles browser-based fetching (Puppeteer), domain throttling, and proxy rotation.

**File:** [src/crawler/FetchPipeline.js](../../../src/crawler/FetchPipeline.js) (1532 lines)

## Main Fetch Flow

```
fetch(url) → URL Decision → Policy Check → Cache Check → Network Fetch
                                                              ↓
                                              Parse URL → Acquire Tokens
                                                  ↓
                                         Try Node-Fetch (ESM)
                                              ↓ (fail)
                                         Try Basic HTTP Fetch
                                              ↓ (fail)
                                         Parse Error & Classify
                                                  ↓
                     Retryable? → YES → Exponential Backoff + Retry
                           ↓ (NO)
                     ECONNRESET? → YES → Puppeteer Browser Fallback
                           ↓ (NO)
                     Cache available? → YES → Stale Cache Fallback
                           ↓ (NO)
                     Return Network Error Result
```

## Constructor Configuration

```javascript
new FetchPipeline({
  // Cache configuration
  preferCache: false,
  maxAgeMs: -1,                    // Global cache TTL
  maxAgeArticleMs: -1,             // Article-specific TTL
  maxAgeHubMs: -1,                 // Hub page TTL

  // Rate limiting
  acquireDomainToken: async (host) => {},
  acquireRateToken: async () => {},
  rateLimitMs: 0,

  // Error tracking
  recordError: (url, error) => {},

  // Retry policy
  retryPolicy: new NetworkRetryPolicy({
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 8000,
    jitterRatio: 0.2
  }),

  // Host budget
  hostRetryBudget: new HostRetryBudgetManager({
    maxErrors: 6,
    windowMs: 5 * 60 * 1000,     // 5-minute window
    lockoutMs: 2 * 60 * 1000     // 2-minute lockout
  }),

  // Puppeteer fallback
  puppeteerFallbackOnEconnreset: true,
  puppeteerDomainManager: new PuppeteerDomainManager()
})
```

## Fetch Request Flow

### Phase 1: URL Decision & Validation (Lines 460-489)

```javascript
const decision = await this._getUrlDecision(url, context);
if (!decision.allow) {
  return { status: 'skipped', reason: decision.reason };
}
```

The URL decision orchestrator determines:
- Whether URL should be fetched
- Normalized URL form
- Any policy restrictions

### Phase 2: Policy & Cache Checks (Lines 490-570)

```javascript
// Check if already visited
if (this._isVisited(normalizedUrl)) {
  return { status: 'skip-visited' };
}

// Check domain/allowed rules
if (!this._isAllowed(normalizedUrl)) {
  return { status: 'policy-blocked' };
}

// Try cache
const cached = await this._tryCache(normalizedUrl, context);
if (cached) {
  return cached;
}
```

### Phase 3: Network Fetch (Lines 683-1341)

The network fetch is the most complex phase:

```javascript
async _performNetworkFetch({ url, context, decision, retryCount }) {
  // 1. Parse URL
  const parsed = new URL(url);
  const host = parsed.hostname;

  // 2. Check host retry budget
  const budgetCheck = this.hostRetryBudget.check(host);
  if (budgetCheck.locked) {
    return { status: 'host-locked', retryAfterMs: budgetCheck.retryAfterMs };
  }

  // 3. Acquire rate tokens
  await this.acquireDomainToken(host);
  if (this.rateLimitMs > 0) {
    await this.acquireRateToken();
  }

  // 4. Setup abort controller
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => {
    abortController.abort();
  }, this.requestTimeoutMs);

  // 5. Build browser-like headers
  const headers = this._buildBrowserHeaders();

  // 6. Execute fetch
  const response = await fetch(url, {
    headers,
    signal: abortController.signal,
    redirect: 'manual'  // Handle redirects manually
  });

  // 7. Handle response
  return this._handleResponse(response, url, context);
}
```

## Browser-Like Headers (Lines 819-834)

The pipeline spoofs Chrome 120 to avoid bot detection:

```javascript
{
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'no-cache'
}
```

## Conditional Headers (304 Not Modified)

**Lines 1343-1365**

The pipeline supports HTTP conditional requests for bandwidth savings:

```javascript
_buildConditionalHeaders(url) {
  const cached = this.articleHeaderCache.get(url);
  if (!cached) return {};

  const headers = {};
  if (cached.etag) {
    headers['If-None-Match'] = cached.etag;
  }
  if (cached.last_modified) {
    headers['If-Modified-Since'] = cached.last_modified;
  }
  return headers;
}
```

On 304 response:
```javascript
if (status === 304) {
  this._recordConditionalHeaders(url, { etag, lastModified, fetched_at });
  this._noteHostSuccess(host);
  return { status: 'not-modified', source: 'not-modified' };
}
```

## Manual Redirect Handling (Lines 862-901)

Redirects are handled manually to support:
- Protocol correction (HTTP → HTTPS for Guardian/BBC)
- Redirect chain tracking
- Maximum redirect limit (5)

```javascript
while (response.status >= 300 && response.status < 400) {
  const location = response.headers.get('location');
  let redirectUrl = new URL(location, url).href;

  // Force HTTPS for known domains
  if (redirectUrl.startsWith('http://')) {
    if (host.includes('theguardian.com') || host.includes('bbc.co')) {
      redirectUrl = redirectUrl.replace(/^http:/, 'https:');
    }
  }

  redirectCount++;
  if (redirectCount >= 5) break;

  response = await fetch(redirectUrl, { redirect: 'manual' });
}
```

## Response Status Handling

### 304 Not Modified (Lines 912-963)
- Records conditional header metadata
- Notes host success for rate limit recovery
- Returns `{ status: 'not-modified' }`

### HTTP Errors 4xx/5xx (Lines 965-1038)

```javascript
if (!response.ok) {
  // Extract Retry-After header
  const retryAfterMs = parseRetryAfter(retryAfterHeader);

  // Record error body if configured
  if (STORE_ERROR_RESPONSE_BODIES) {
    errorBody = await response.text();
  }

  // Handle 429 rate limit
  if (status === 429) {
    this.domainThrottleManager.note429(host, retryAfterMs);
  }

  // Report proxy failure
  if (proxyManager && currentProxyInfo) {
    proxyManager.recordFailure(proxyInfo.name, { httpStatus: status });
  }

  // Count to host retry budget (404/410 don't count)
  if (status !== 404 && status !== 410) {
    this.hostRetryBudget.noteFailure(host, { httpStatus: status });
  }

  return { status: 'error', httpStatus: status };
}
```

### 200-299 Success (Lines 1040-1162)

```javascript
const html = await response.text();
const finished = Date.now();

const fetchMeta = {
  ttfb_ms: headersReady - started,
  download_ms: finished - headersReady,
  total_ms: finished - started,
  bytes_downloaded: Buffer.byteLength(html, 'utf8'),
  transfer_kbps: calculateTransferRate(...)
};

// Content validation
if (contentValidationService) {
  const validation = contentValidationService.validate({ url, html, status });
  if (!validation.valid) {
    // Hard failures → circuit breaker
    // Soft failures → re-queue for Teacher rendering
  }
}

return { status: 'success', source: 'network', html, fetchMeta };
```

## Retry Policy

**File:** [src/crawler/NetworkRetryPolicy.js](../../../src/crawler/NetworkRetryPolicy.js)

### Retryable Errors

```javascript
const RETRYABLE_ERROR_CODES = [
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND'
];
```

### Retry Strategy

```javascript
computeDelay({ attemptIndex = 0, retryAfterMs = null }) {
  let base = this.baseDelayMs;  // default: 1000ms

  if (retryAfterMs > 0) {
    // Respect server hint
    base = clamp(retryAfterMs, this.baseDelayMs, this.maxDelayMs);
  } else {
    // Exponential backoff
    const exponential = this.baseDelayMs * Math.pow(2, attemptIndex);
    base = clamp(exponential, this.baseDelayMs, this.maxDelayMs);
  }

  // Add jitter (default: 20%)
  const jitter = base * this.jitterRatio * Math.random();
  return base + jitter;
}
```

### Retry Flow (Lines 1173-1183)

```javascript
if (isRetryableNetworkError && retryCount < maxRetries) {
  const strategy = policy.strategyFor(error);
  const delayMs = policy.computeDelay({ attemptIndex: retryCount });

  await sleep(delayMs);

  return this.fetch({
    url: originalUrl,
    context: { ...context, __networkRetry: { attempt, strategy, delayMs } },
    retryCount: retryCount + 1
  });
}
```

## Puppeteer Fallback

**File:** [src/crawler/PuppeteerFetcher.js](../../../src/crawler/PuppeteerFetcher.js)

On ECONNRESET (often TLS fingerprint blocking), the pipeline falls back to Puppeteer:

```javascript
if (isConnectionReset && puppeteerFallbackOnEconnreset) {
  // Auto-learn domain for future requests
  if (puppeteerDomainManager.isTrackingEnabled()) {
    puppeteerDomainManager.recordFailure(host, url, errorMessage);
  }

  // Try Puppeteer
  const puppeteer = await this._getPuppeteerFetcher();
  const result = await puppeteer.fetch(url, { timeout: this.requestTimeoutMs });

  if (result.success) {
    return {
      status: 'success',
      source: 'network',
      fetchMethod: 'puppeteer-fallback',
      html: result.html
    };
  }
}
```

### PuppeteerFetcher Configuration

```javascript
new PuppeteerFetcher({
  launchOptions: {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  },
  reuseSession: true,
  maxPagesPerSession: 50,
  maxSessionAgeMs: 10 * 60 * 1000,  // 10 minutes
  healthCheckEnabled: true,
  healthCheckIntervalMs: 30000,
  restartOnError: true,
  maxConsecutiveErrors: 3
})
```

## Rate Limiting Stack

### 1. Global Rate Limit

```javascript
if (rateLimitMs > 0) {
  await acquireRateToken();  // Blocks until token available
}
```

### 2. Domain Throttle Manager

**File:** [src/crawler/DomainThrottleManager.js](../../../src/crawler/DomainThrottleManager.js)

Per-domain rate limiting with adaptive recovery:

```javascript
// Initial state per domain
{
  host,
  isLimited: false,
  rpm: 30,                    // Requests per minute
  nextRequestAt: 0,
  backoffUntil: 0,
  successStreak: 0,
  err429Streak: 0
}

// On 429 response
note429(host, retryAfterMs) {
  state.isLimited = true;
  state.err429Streak += 1;

  // Calculate blackout period
  let blackout = retryAfterMs || 45000;
  blackout += Math.floor(blackout * (Math.random() * 0.2 - 0.1));  // ±10% jitter

  // Escalate on repeated 429s
  if (err429Streak >= 2) blackout = Math.max(blackout, 5 * 60 * 1000);   // 5 min
  if (err429Streak >= 3) blackout = Math.max(blackout, 15 * 60 * 1000); // 15 min

  state.backoffUntil = now + blackout;

  // Reduce RPM aggressively
  state.rpm = Math.max(1, Math.floor(state.rpm * 0.25));  // Down to 25%
}

// Recovery after success streak
noteSuccess(host) {
  state.successStreak += 1;
  state.err429Streak = 0;

  // Slow recovery after 100+ successes
  if (state.isLimited && state.successStreak > 100) {
    state.rpm = Math.min(state.rpm * 1.1, 300);  // Up by 10%, max 300
    state.successStreak = 0;
  }
}
```

### 3. Host Retry Budget Manager

**File:** [src/crawler/HostRetryBudgetManager.js](../../../src/crawler/HostRetryBudgetManager.js)

Prevents flooding failing hosts:

```javascript
const DEFAULT_CONFIG = {
  maxErrors: 6,                // Failures within window before lockout
  windowMs: 5 * 60 * 1000,     // 5-minute failure window
  lockoutMs: 2 * 60 * 1000     // 2-minute lockout after exhaustion
};

check(host) {
  const state = this._state.get(host);
  if (!state) return { locked: false };

  if (state.lockExpiresAt > Date.now()) {
    return {
      locked: true,
      retryAfterMs: state.lockExpiresAt - Date.now(),
      failures: state.failures
    };
  }
  return { locked: false };
}

noteFailure(host, meta = {}) {
  state.failures += 1;

  if (state.failures >= this.maxErrors && !state.lockExpiresAt) {
    state.lockExpiresAt = Date.now() + this.lockoutMs;
    this.emit('budget-exhausted', host);
  }
}
```

## Caching System

### ArticleCache

**File:** [src/crawler/cache.js](../../../src/crawler/cache.js)

```javascript
class ArticleCache {
  async get(url) {
    // Check memory cache first
    const memo = this._memo.get(url);
    if (memo) return memo;

    // Query database
    const article = await this.db.getArticleByUrlOrCanonical(url);
    if (article?.html) {
      return { html: article.html, crawledAt: article.crawled_at, source: 'db' };
    }

    // Check for known 404
    if (article?.http_status === 404) {
      return { source: 'db-404', httpStatus: 404 };
    }

    return null;
  }
}
```

### Cache Decision Logic

```javascript
function shouldUseCache({ preferCache, maxAgeMs, crawledAt }) {
  const ageMs = Date.now() - new Date(crawledAt).getTime();

  if (maxAgeMs >= 0) {
    return { use: ageMs <= maxAgeMs, ageSeconds: ageMs / 1000 };
  }

  if (preferCache) {
    return { use: true, ageSeconds: ageMs / 1000 };
  }

  return { use: false, ageSeconds: ageMs / 1000 };
}
```

## Proxy Management

**File:** [src/crawler/ProxyManager.js](../../../src/crawler/ProxyManager.js)

```javascript
const config = {
  enabled: false,
  providers: [],
  strategy: 'round-robin',  // 'round-robin'|'priority'|'least-used'|'random'
  failover: {
    enabled: true,
    banThresholdFailures: 3,
    banDurationMs: 300000,  // 5 minutes
    triggerOnStatusCodes: [403, 429, 503]
  }
};

// Get proxy agent for host
getAgent(host) {
  const proxyInfo = this.getProxy(host);
  if (!proxyInfo) return null;

  return {
    agent: new HttpsProxyAgent(proxyInfo.url),
    proxyInfo: { url, name, type }
  };
}

// Handle failures
recordFailure(proxyName, error = {}) {
  stats.failures += 1;
  stats.consecutiveFailures += 1;

  const shouldBan =
    stats.consecutiveFailures >= banThresholdFailures ||
    triggerOnStatusCodes.includes(error.httpStatus);

  if (shouldBan && !stats.banned) {
    stats.banned = true;
    stats.bannedUntil = Date.now() + banDurationMs;
    this.emit('proxy:ban', { name, reason, bannedUntil });
  }
}
```

## Key Method Signatures

| Method | Lines | Signature |
|--------|-------|-----------|
| fetch | 459-579 | `async fetch({ url, context?, retryCount? })` |
| _performNetworkFetch | 683-1341 | `async _performNetworkFetch({ url, context, decision, retryCount })` |
| _tryCache | 581-681 | `async _tryCache({ url, looksArticle, context, decision })` |
| _getPuppeteerFetcher | 354-396 | `async _getPuppeteerFetcher()` |
| _buildConditionalHeaders | 1343-1365 | `_buildConditionalHeaders(url)` |
| _recordHttpResponse | 1496-1532 | `async _recordHttpResponse({ url, status, headers, timing })` |

## Next Chapter

Continue to [Chapter 3: Priority Queue System](./03-priority-queue-system.md) to learn about priority scoring and queue management.
