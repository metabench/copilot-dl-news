# Crawler Abstraction Refactoring Plan

**Status**: ✅ Complete
**Created**: 2024-12-07
**Completed**: 2024-12-07
**Progress (2025-12-07)**:
- ✅ Phase 1 (CrawlContext) implemented and wired in shadow mode
- ✅ Phase 2 unified SequenceRunner now lives at `src/crawler/sequence/SequenceRunner.js` (orchestration re-exports); `CrawlSequenceRunner` consumes the unified runner
- ✅ Phase 3 (UrlDecisionOrchestrator) implemented at `src/crawler/decisions/UrlDecisionOrchestrator.js`
- ✅ Phase 4 (RetryCoordinator) implemented at `src/crawler/retry/RetryCoordinator.js`
- ✅ Phase 5 (Service Groups) implemented at `src/crawler/services/`:
  - `ServiceContainer.js` - Lightweight DI container with lazy instantiation and group support
  - `wireServices.js` - Factory to create fully-wired containers
  - `groups/PolicyServices.js` - URL policy and decision services
  - `groups/PlanningServices.js` - Crawl planning and strategy services
  - `groups/ProcessingServices.js` - Content fetching and processing services
  - `groups/TelemetryServices.js` - Events, metrics, and progress tracking
  - `groups/StorageServices.js` - Caching and persistence services
- ✅ Phase 6 (Planning & Monitoring Abstractions) implemented at:
  - `src/crawler/plan/CrawlPlan.js` - First-class crawl intent representation (39 tests)
  - `src/crawler/progress/ProgressModel.js` - Unified progress tracking with ETA (37 tests)
  - `src/crawler/budget/ResourceBudget.js` - Resource limit tracking and enforcement (46 tests)

**Total Tests**: 122 tests across Phase 6 components

**Goal**: Consolidate and improve crawler abstractions for clearer conceptualization and execution

---

## Executive Summary

The current crawler architecture has solid foundations (Mode Strategy, Pipeline patterns) but suffers from:
- Fragmented state management across multiple caches
- Duplicated implementations (sequence runners, decision logic, retry handling)
- Missing unifying abstractions (CrawlPlan, ProgressModel, ResourceBudget)

This plan proposes a phased refactoring to consolidate these into cleaner abstractions while maintaining backward compatibility.

---

## Phase 1: Unified CrawlContext

### Problem
Crawl state is scattered across 10+ locations:
- `CrawlerState` (core stats)
- `articleHeaderCache`, `knownArticlesCache`, `urlAnalysisCache`, `urlDecisionCache`
- `domainLimits`, `connectionResetState`, `problemCounters`
- `queuedUrls` Set in QueueManager
- Various flags on the crawler instance

### Solution
Create a single `CrawlContext` that owns all mutable state with clear boundaries.

### New File: `src/crawler/context/CrawlContext.js`

```javascript
'use strict';

/**
 * CrawlContext - Single source of truth for all crawl state.
 *
 * Replaces scattered state across:
 * - CrawlerState
 * - Multiple caches (articleHeader, knownArticles, urlAnalysis, urlDecision)
 * - Domain/connection tracking
 * - Queue state
 *
 * Design principles:
 * - Immutable reads (getters return copies or frozen objects)
 * - Explicit mutations via named methods
 * - Observable state changes via events
 * - Serializable for persistence/debugging
 */
class CrawlContext {
  constructor(options = {}) {
    this.jobId = options.jobId || `job-${Date.now()}`;
    this.startedAt = null;
    this.finishedAt = null;

    // Core statistics
    this._stats = {
      visited: 0,
      queued: 0,
      articles: 0,
      errors: 0,
      bytesDownloaded: 0,
      cacheHits: 0,
      cacheMisses: 0
    };

    // URL tracking (consolidated from multiple caches)
    this._urls = {
      visited: new Set(),        // URLs we've processed
      queued: new Set(),         // URLs currently in queue
      decided: new Map(),        // URL -> decision (accept/skip/defer)
      analyzed: new Map()        // URL -> analysis result
    };

    // Domain tracking (consolidated from domainLimits, connectionResetState)
    this._domains = {
      requestCounts: new Map(),  // domain -> count in current window
      lastRequest: new Map(),    // domain -> timestamp
      errors: new Map(),         // domain -> error count
      throttled: new Set(),      // domains currently throttled
      blocked: new Set()         // domains we've given up on
    };

    // Problem/milestone tracking
    this._diagnostics = {
      problems: [],
      milestones: [],
      problemCounts: new Map()   // kind -> count
    };

    // Listeners for state changes
    this._listeners = new Map();
  }

  // === Lifecycle ===

  start() {
    this.startedAt = new Date().toISOString();
    this._emit('started', { jobId: this.jobId, startedAt: this.startedAt });
  }

  finish(status = 'completed') {
    this.finishedAt = new Date().toISOString();
    this._emit('finished', {
      jobId: this.jobId,
      status,
      duration: this.elapsedMs,
      stats: this.stats
    });
  }

  get elapsedMs() {
    if (!this.startedAt) return 0;
    const end = this.finishedAt ? new Date(this.finishedAt) : new Date();
    return end - new Date(this.startedAt);
  }

  // === Statistics (read-only) ===

  get stats() {
    return { ...this._stats };
  }

  // === URL State ===

  hasVisited(url) {
    return this._urls.visited.has(url);
  }

  isQueued(url) {
    return this._urls.queued.has(url);
  }

  markVisited(url) {
    if (this._urls.visited.has(url)) return false;
    this._urls.visited.add(url);
    this._urls.queued.delete(url);
    this._stats.visited++;
    this._emit('url:visited', { url });
    return true;
  }

  markQueued(url) {
    if (this._urls.queued.has(url) || this._urls.visited.has(url)) return false;
    this._urls.queued.add(url);
    this._stats.queued++;
    this._emit('url:queued', { url });
    return true;
  }

  getUrlDecision(url) {
    return this._urls.decided.get(url);
  }

  setUrlDecision(url, decision, reason = null) {
    this._urls.decided.set(url, { decision, reason, decidedAt: Date.now() });
  }

  getUrlAnalysis(url) {
    return this._urls.analyzed.get(url);
  }

  setUrlAnalysis(url, analysis) {
    this._urls.analyzed.set(url, { ...analysis, analyzedAt: Date.now() });
  }

  // === Domain State ===

  isDomainThrottled(domain) {
    return this._domains.throttled.has(domain);
  }

  isDomainBlocked(domain) {
    return this._domains.blocked.has(domain);
  }

  recordDomainRequest(domain) {
    const count = (this._domains.requestCounts.get(domain) || 0) + 1;
    this._domains.requestCounts.set(domain, count);
    this._domains.lastRequest.set(domain, Date.now());
  }

  recordDomainError(domain, error) {
    const count = (this._domains.errors.get(domain) || 0) + 1;
    this._domains.errors.set(domain, count);
    this._emit('domain:error', { domain, error, errorCount: count });
  }

  throttleDomain(domain, durationMs) {
    this._domains.throttled.add(domain);
    this._emit('domain:throttled', { domain, durationMs });
    setTimeout(() => {
      this._domains.throttled.delete(domain);
      this._emit('domain:unthrottled', { domain });
    }, durationMs);
  }

  blockDomain(domain, reason) {
    this._domains.blocked.add(domain);
    this._emit('domain:blocked', { domain, reason });
  }

  // === Content Tracking ===

  recordArticle(url, metadata = {}) {
    this._stats.articles++;
    this._emit('article:found', { url, ...metadata });
  }

  recordDownload(bytes) {
    this._stats.bytesDownloaded += bytes;
  }

  recordCacheHit() {
    this._stats.cacheHits++;
  }

  recordCacheMiss() {
    this._stats.cacheMisses++;
  }

  recordError(url, error) {
    this._stats.errors++;
    this._emit('error', { url, error: error.message || error });
  }

  // === Diagnostics ===

  addProblem(problem) {
    this._diagnostics.problems.push({ ...problem, timestamp: Date.now() });
    const kind = problem.kind || 'unknown';
    this._diagnostics.problemCounts.set(
      kind,
      (this._diagnostics.problemCounts.get(kind) || 0) + 1
    );
    this._emit('problem', problem);
  }

  addMilestone(milestone) {
    this._diagnostics.milestones.push({ ...milestone, timestamp: Date.now() });
    this._emit('milestone', milestone);
  }

  get problems() {
    return [...this._diagnostics.problems];
  }

  get milestones() {
    return [...this._diagnostics.milestones];
  }

  // === Event System ===

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this._listeners.get(event).delete(callback);
  }

  _emit(event, data) {
    const listeners = this._listeners.get(event);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data);
        } catch (e) {
          console.error(`CrawlContext event listener error (${event}):`, e);
        }
      }
    }
  }

  // === Serialization ===

  toJSON() {
    return {
      jobId: this.jobId,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      elapsedMs: this.elapsedMs,
      stats: this.stats,
      urlCounts: {
        visited: this._urls.visited.size,
        queued: this._urls.queued.size,
        decided: this._urls.decided.size
      },
      domainCounts: {
        active: this._domains.requestCounts.size,
        throttled: this._domains.throttled.size,
        blocked: this._domains.blocked.size
      },
      diagnostics: {
        problemCount: this._diagnostics.problems.length,
        milestoneCount: this._diagnostics.milestones.length
      }
    };
  }

  // === Factory ===

  static create(options = {}) {
    return new CrawlContext(options);
  }
}

module.exports = CrawlContext;
```

### Migration Steps

1. **Create `src/crawler/context/` directory** with:
   - `CrawlContext.js` (above)
   - `index.js` (exports)

2. **Update `CrawlerServiceWiring.js`**:
   - Create CrawlContext early in wiring
   - Pass context to services instead of individual caches
   - Services read/write via context methods

3. **Deprecate individual caches**:
   - Add deprecation warnings to direct cache access
   - Update services to use context
   - Remove old caches after migration

4. **Update QueueManager**:
   - Use `context.markQueued()` / `context.isQueued()`
   - Remove internal `queuedUrls` Set

### Files to Modify
- `src/crawler/CrawlerServiceWiring.js`
- `src/crawler/QueueManager.js`
- `src/crawler/NewsCrawler.js`
- `src/crawler/core/CrawlerState.js` (deprecate)
- `src/crawler/services/UrlDecisionService.js`

---

## Phase 2: Unified SequenceRunner

### Problem
Two similar sequence runner implementations:
- `src/orchestration/SequenceRunner.js`
- `src/crawler/operations/SequenceRunner.js`

### Solution
Consolidate into single `SequenceRunner` with pluggable operation resolution.

### New File: `src/crawler/sequence/SequenceRunner.js`

```javascript
'use strict';

/**
 * SequenceRunner - Unified sequence execution engine.
 *
 * Consolidates:
 * - src/orchestration/SequenceRunner.js
 * - src/crawler/operations/SequenceRunner.js
 *
 * Features:
 * - Pluggable operation resolver
 * - Step-level and shared overrides
 * - Continue-on-error support
 * - Rich telemetry callbacks
 * - Pause/resume/abort support
 */
class SequenceRunner {
  /**
   * @param {Object} options
   * @param {Function} options.resolveOperation - (operationId) => Operation instance
   * @param {Object} options.context - CrawlContext for state tracking
   * @param {Object} options.telemetry - Telemetry callbacks
   */
  constructor(options = {}) {
    this.resolveOperation = options.resolveOperation || this._defaultResolver;
    this.context = options.context;
    this.telemetry = options.telemetry || {};

    this._aborted = false;
    this._paused = false;
    this._pausePromise = null;
    this._pauseResolve = null;
  }

  /**
   * Run a sequence of operations.
   *
   * @param {Object} options
   * @param {Array} options.sequence - Array of step definitions
   * @param {Object} options.sharedOverrides - Overrides applied to all steps
   * @param {boolean} options.continueOnError - Continue after step failures
   * @returns {Promise<SequenceResult>}
   */
  async run({ sequence, sharedOverrides = {}, continueOnError = false }) {
    const sequenceId = `seq-${Date.now()}`;
    const results = [];
    let status = 'completed';

    await this._emitTelemetry('sequence:start', {
      sequenceId,
      stepCount: sequence.length
    });

    for (let i = 0; i < sequence.length; i++) {
      // Check for abort
      if (this._aborted) {
        status = 'aborted';
        break;
      }

      // Handle pause
      await this._waitIfPaused();

      const step = sequence[i];
      const stepResult = await this._executeStep(step, sharedOverrides, i);
      results.push(stepResult);

      if (!stepResult.ok && !continueOnError && !step.continueOnError) {
        status = 'failed';
        break;
      }
    }

    const summary = {
      sequenceId,
      status,
      stepsTotal: sequence.length,
      stepsCompleted: results.filter(r => r.ok).length,
      stepsFailed: results.filter(r => !r.ok).length,
      results
    };

    await this._emitTelemetry('sequence:complete', summary);

    return summary;
  }

  async _executeStep(step, sharedOverrides, index) {
    const stepId = step.id || `step-${index}`;
    const startTime = Date.now();

    await this._emitTelemetry('step:start', { stepId, step });

    try {
      // Resolve operation
      const operation = await this.resolveOperation(step.operation || step.id);
      if (!operation) {
        throw new Error(`Unknown operation: ${step.operation || step.id}`);
      }

      // Merge overrides: shared < step-specific
      const overrides = { ...sharedOverrides, ...step.overrides };

      // Execute
      const result = await operation.execute({
        startUrl: step.startUrl,
        overrides,
        context: this.context
      });

      const stepResult = {
        ok: true,
        stepId,
        operation: step.operation || step.id,
        result,
        elapsedMs: Date.now() - startTime
      };

      await this._emitTelemetry('step:complete', stepResult);
      return stepResult;

    } catch (error) {
      const stepResult = {
        ok: false,
        stepId,
        operation: step.operation || step.id,
        error: error.message,
        elapsedMs: Date.now() - startTime
      };

      await this._emitTelemetry('step:error', stepResult);
      return stepResult;
    }
  }

  // === Control Flow ===

  pause() {
    if (this._paused) return;
    this._paused = true;
    this._pausePromise = new Promise(resolve => {
      this._pauseResolve = resolve;
    });
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    if (this._pauseResolve) {
      this._pauseResolve();
      this._pausePromise = null;
      this._pauseResolve = null;
    }
  }

  abort() {
    this._aborted = true;
    this.resume(); // Unblock if paused
  }

  async _waitIfPaused() {
    if (this._pausePromise) {
      await this._pausePromise;
    }
  }

  // === Telemetry ===

  async _emitTelemetry(event, data) {
    const callback = this.telemetry[event] || this.telemetry.onEvent;
    if (callback) {
      try {
        await callback(event, data);
      } catch (e) {
        console.error(`Telemetry callback error (${event}):`, e);
      }
    }
  }

  _defaultResolver(operationId) {
    throw new Error(`No operation resolver configured. Cannot resolve: ${operationId}`);
  }
}

module.exports = SequenceRunner;
```

### Migration Steps

1. **Create `src/crawler/sequence/` directory**
2. **Move and consolidate** both runners into new implementation
3. **Update imports** in:
   - `src/crawler/operations/CrawlSequenceRunner.js` → re-export new runner
   - `src/orchestration/SequenceRunner.js` → re-export new runner
4. **Add deprecation notices** to old locations
5. **Update tests** to use new runner

---

## Phase 3: UrlDecisionOrchestrator

### Problem
URL eligibility decisions scattered across:
- `UrlPolicy` - basic validation
- `UrlDecisionService` - caching decisions
- `FetchPipeline` - skip handling
- `PageExecutionService` - per-page decisions
- `QueueManager` - depth/domain checks

### Solution
Single orchestrator that consolidates all decision logic.

### New File: `src/crawler/decisions/UrlDecisionOrchestrator.js`

```javascript
'use strict';

/**
 * UrlDecisionOrchestrator - Centralized URL eligibility decisions.
 *
 * Consolidates decision logic from:
 * - UrlPolicy (validation)
 * - UrlDecisionService (caching)
 * - FetchPipeline (skip handling)
 * - PageExecutionService (per-page)
 * - QueueManager (depth/domain)
 *
 * Decision flow:
 * 1. Syntax validation (is URL valid?)
 * 2. Policy checks (robots.txt, same-domain, depth)
 * 3. State checks (already visited? already queued?)
 * 4. Resource checks (domain throttled? budget exceeded?)
 * 5. Cache checks (fresh cached version available?)
 *
 * Returns a decision object with action and reason.
 */
class UrlDecisionOrchestrator {
  constructor(options = {}) {
    this.context = options.context;        // CrawlContext
    this.robotsChecker = options.robotsChecker;
    this.config = options.config || {};

    // Decision cache for performance
    this._cache = new Map();
    this._cacheMaxSize = options.cacheMaxSize || 50000;
  }

  /**
   * Decide what to do with a URL.
   *
   * @param {string} url - The URL to evaluate
   * @param {Object} metadata - Additional context (referrer, depth, priority)
   * @returns {Decision} - { action, reason, details }
   *
   * Actions:
   * - 'fetch': Proceed with network request
   * - 'cache': Use cached version
   * - 'skip': Don't process this URL
   * - 'defer': Re-queue for later (throttled)
   * - 'queue': Add to queue (for discovered URLs)
   */
  async decide(url, metadata = {}) {
    // Check cache first
    const cached = this._getCachedDecision(url);
    if (cached && !metadata.forceRecheck) {
      return cached;
    }

    const decision = await this._evaluate(url, metadata);
    this._cacheDecision(url, decision);

    // Record in context
    if (this.context) {
      this.context.setUrlDecision(url, decision.action, decision.reason);
    }

    return decision;
  }

  async _evaluate(url, metadata) {
    // 1. Syntax validation
    const syntaxCheck = this._checkSyntax(url);
    if (!syntaxCheck.ok) {
      return { action: 'skip', reason: 'invalid-url', details: syntaxCheck.error };
    }

    const parsedUrl = syntaxCheck.parsed;

    // 2. Policy checks
    const policyCheck = await this._checkPolicy(parsedUrl, metadata);
    if (!policyCheck.ok) {
      return { action: 'skip', reason: policyCheck.reason, details: policyCheck.details };
    }

    // 3. State checks
    const stateCheck = this._checkState(url);
    if (!stateCheck.ok) {
      return { action: 'skip', reason: stateCheck.reason };
    }

    // 4. Resource checks
    const resourceCheck = this._checkResources(parsedUrl.hostname, metadata);
    if (!resourceCheck.ok) {
      if (resourceCheck.defer) {
        return { action: 'defer', reason: resourceCheck.reason, retryAfter: resourceCheck.retryAfter };
      }
      return { action: 'skip', reason: resourceCheck.reason };
    }

    // 5. Cache checks
    const cacheCheck = await this._checkCache(url, metadata);
    if (cacheCheck.useCached) {
      return { action: 'cache', reason: 'fresh-cache', cachedData: cacheCheck.data };
    }

    // All checks passed - proceed with fetch
    return { action: 'fetch', reason: 'eligible' };
  }

  // === Individual Checks ===

  _checkSyntax(url) {
    try {
      const parsed = new URL(url);

      // Protocol check
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { ok: false, error: `Invalid protocol: ${parsed.protocol}` };
      }

      // Extension blocklist
      const blockedExtensions = ['.pdf', '.jpg', '.png', '.gif', '.zip', '.mp4', '.mp3'];
      const pathname = parsed.pathname.toLowerCase();
      for (const ext of blockedExtensions) {
        if (pathname.endsWith(ext)) {
          return { ok: false, error: `Blocked extension: ${ext}` };
        }
      }

      return { ok: true, parsed };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async _checkPolicy(parsedUrl, metadata) {
    const { hostname, pathname } = parsedUrl;

    // Same-domain check (if configured)
    if (this.config.stayOnDomain && this.config.startDomain) {
      if (!this._isSameDomain(hostname, this.config.startDomain)) {
        return { ok: false, reason: 'off-domain', details: { hostname } };
      }
    }

    // Depth check
    const depth = metadata.depth || 0;
    if (this.config.maxDepth !== undefined && depth > this.config.maxDepth) {
      return { ok: false, reason: 'max-depth', details: { depth, maxDepth: this.config.maxDepth } };
    }

    // Robots.txt check
    if (this.robotsChecker && this.config.respectRobots !== false) {
      const allowed = await this.robotsChecker.isAllowed(parsedUrl.href);
      if (!allowed) {
        return { ok: false, reason: 'robots-disallowed', details: { pathname } };
      }
    }

    // Query string check (if configured to skip)
    if (this.config.skipQueryUrls && parsedUrl.search) {
      return { ok: false, reason: 'has-query-string' };
    }

    return { ok: true };
  }

  _checkState(url) {
    if (!this.context) return { ok: true };

    if (this.context.hasVisited(url)) {
      return { ok: false, reason: 'already-visited' };
    }

    if (this.context.isQueued(url)) {
      return { ok: false, reason: 'already-queued' };
    }

    return { ok: true };
  }

  _checkResources(domain, metadata) {
    if (!this.context) return { ok: true };

    // Domain blocked?
    if (this.context.isDomainBlocked(domain)) {
      return { ok: false, reason: 'domain-blocked' };
    }

    // Domain throttled?
    if (this.context.isDomainThrottled(domain)) {
      return { ok: false, defer: true, reason: 'domain-throttled', retryAfter: 5000 };
    }

    // Budget checks
    if (this.config.maxPages && this.context.stats.visited >= this.config.maxPages) {
      return { ok: false, reason: 'budget-exceeded' };
    }

    return { ok: true };
  }

  async _checkCache(url, metadata) {
    // Subclasses or configuration can implement cache checking
    // Default: no caching
    return { useCached: false };
  }

  // === Helpers ===

  _isSameDomain(hostname, startDomain) {
    return hostname === startDomain || hostname.endsWith('.' + startDomain);
  }

  _getCachedDecision(url) {
    const entry = this._cache.get(url);
    if (!entry) return null;

    // Expire after 5 minutes
    if (Date.now() - entry.timestamp > 5 * 60 * 1000) {
      this._cache.delete(url);
      return null;
    }

    return entry.decision;
  }

  _cacheDecision(url, decision) {
    // Evict oldest if at capacity
    if (this._cache.size >= this._cacheMaxSize) {
      const firstKey = this._cache.keys().next().value;
      this._cache.delete(firstKey);
    }

    this._cache.set(url, { decision, timestamp: Date.now() });
  }

  clearCache() {
    this._cache.clear();
  }
}

module.exports = UrlDecisionOrchestrator;
```

### Migration Steps

1. **Create `src/crawler/decisions/` directory**
2. **Implement orchestrator** with hooks for existing services
3. **Update FetchPipeline** to use orchestrator
4. **Update QueueManager** to delegate eligibility to orchestrator
5. **Deprecate** scattered decision methods
6. **Update tests**

---

## Phase 4: RetryCoordinator

### Problem
Retry logic scattered across:
- `NetworkRetryPolicy` (network-level)
- `HostRetryBudgetManager` (per-host tracking)
- `DomainThrottleManager` (domain throttling)
- `ErrorTracker` (connection reset detection)

### Solution
Unified coordinator with hierarchical retry strategies.

### New File: `src/crawler/retry/RetryCoordinator.js`

```javascript
'use strict';

/**
 * RetryCoordinator - Unified retry handling across all levels.
 *
 * Hierarchy:
 * 1. Network level - transient errors, timeouts
 * 2. Host level - per-host error budgets
 * 3. Domain level - rate limiting, throttling
 *
 * Consolidates:
 * - NetworkRetryPolicy
 * - HostRetryBudgetManager
 * - DomainThrottleManager
 * - ErrorTracker (connection reset detection)
 */
class RetryCoordinator {
  constructor(options = {}) {
    this.context = options.context;

    // Network retry config
    this.networkConfig = {
      maxRetries: options.maxRetries || 3,
      baseDelayMs: options.baseDelayMs || 1000,
      maxDelayMs: options.maxDelayMs || 30000,
      jitterFactor: options.jitterFactor || 0.2
    };

    // Host budget config
    this.hostConfig = {
      windowMs: options.hostWindowMs || 60000,
      maxErrors: options.hostMaxErrors || 5,
      lockoutMs: options.hostLockoutMs || 300000
    };

    // Domain throttle config
    this.domainConfig = {
      requestsPerMinute: options.requestsPerMinute || 60,
      burstSize: options.burstSize || 10,
      throttleDurationMs: options.throttleDurationMs || 5000
    };

    // State
    this._hostErrors = new Map();      // host -> { errors: [], lockedUntil }
    this._domainTokens = new Map();    // domain -> { tokens, lastRefill }
    this._connectionResets = new Map(); // host -> reset count
  }

  /**
   * Determine if a request should be retried.
   *
   * @param {Object} request - { url, attempt, error, response }
   * @returns {RetryDecision} - { shouldRetry, delay, reason, action }
   *
   * Actions:
   * - 'retry': Retry immediately or after delay
   * - 'defer': Re-queue for much later
   * - 'abandon': Give up on this URL
   * - 'block-host': Block entire host
   */
  async shouldRetry(request) {
    const { url, attempt = 0, error, response } = request;
    const parsedUrl = new URL(url);
    const host = parsedUrl.hostname;

    // Check if host is locked out
    const hostLockout = this._getHostLockout(host);
    if (hostLockout) {
      return {
        shouldRetry: false,
        action: 'defer',
        reason: 'host-locked-out',
        retryAfter: hostLockout.remainingMs
      };
    }

    // Classify the error
    const classification = this._classifyError(error, response);

    // Handle based on classification
    switch (classification.type) {
      case 'transient':
        return this._handleTransient(host, attempt, classification);

      case 'rate-limited':
        return this._handleRateLimited(host, response);

      case 'server-error':
        return this._handleServerError(host, attempt, classification);

      case 'connection-reset':
        return this._handleConnectionReset(host, attempt);

      case 'permanent':
        return { shouldRetry: false, action: 'abandon', reason: classification.reason };

      default:
        return { shouldRetry: false, action: 'abandon', reason: 'unknown-error' };
    }
  }

  /**
   * Record a successful request (clears error state).
   */
  recordSuccess(url) {
    const host = new URL(url).hostname;
    // Successful requests reduce error pressure
    const hostState = this._hostErrors.get(host);
    if (hostState && hostState.errors.length > 0) {
      hostState.errors = hostState.errors.slice(1); // Remove oldest error
    }
  }

  /**
   * Acquire a rate limit token for a domain.
   * @returns {Promise<boolean>} - true if token acquired
   */
  async acquireToken(domain) {
    const state = this._getDomainState(domain);

    // Refill tokens based on time elapsed
    this._refillTokens(state);

    if (state.tokens > 0) {
      state.tokens--;
      return true;
    }

    // No tokens available - need to wait
    return false;
  }

  /**
   * Get wait time until a token is available.
   */
  getTokenWaitTime(domain) {
    const state = this._getDomainState(domain);
    this._refillTokens(state);

    if (state.tokens > 0) return 0;

    // Calculate time until next refill
    const msPerToken = 60000 / this.domainConfig.requestsPerMinute;
    const elapsed = Date.now() - state.lastRefill;
    return Math.max(0, msPerToken - elapsed);
  }

  // === Error Classification ===

  _classifyError(error, response) {
    if (response) {
      const status = response.status || response.statusCode;

      if (status === 429) {
        return { type: 'rate-limited', reason: 'http-429' };
      }
      if (status >= 500 && status < 600) {
        return { type: 'server-error', reason: `http-${status}` };
      }
      if (status === 403 || status === 404 || status === 410) {
        return { type: 'permanent', reason: `http-${status}` };
      }
    }

    if (error) {
      const msg = error.message || error.code || String(error);

      if (msg.includes('ECONNRESET') || msg.includes('socket hang up')) {
        return { type: 'connection-reset', reason: 'connection-reset' };
      }
      if (msg.includes('ETIMEDOUT') || msg.includes('timeout')) {
        return { type: 'transient', reason: 'timeout' };
      }
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        return { type: 'permanent', reason: 'dns-failure' };
      }
      if (msg.includes('ECONNREFUSED')) {
        return { type: 'server-error', reason: 'connection-refused' };
      }
    }

    return { type: 'unknown', reason: 'unclassified' };
  }

  // === Retry Handlers ===

  _handleTransient(host, attempt, classification) {
    if (attempt >= this.networkConfig.maxRetries) {
      this._recordHostError(host, classification.reason);
      return { shouldRetry: false, action: 'abandon', reason: 'max-retries-exceeded' };
    }

    const delay = this._calculateBackoff(attempt);
    return { shouldRetry: true, action: 'retry', delay, reason: classification.reason };
  }

  _handleRateLimited(host, response) {
    // Check for Retry-After header
    let retryAfter = this.domainConfig.throttleDurationMs;
    if (response?.headers?.['retry-after']) {
      const ra = parseInt(response.headers['retry-after'], 10);
      if (!isNaN(ra)) {
        retryAfter = ra * 1000;
      }
    }

    // Apply throttling via context
    if (this.context) {
      this.context.throttleDomain(host, retryAfter);
    }

    return {
      shouldRetry: true,
      action: 'defer',
      delay: retryAfter,
      reason: 'rate-limited'
    };
  }

  _handleServerError(host, attempt, classification) {
    this._recordHostError(host, classification.reason);

    // Check if host should be locked out
    const errorCount = this._getHostErrorCount(host);
    if (errorCount >= this.hostConfig.maxErrors) {
      this._lockoutHost(host);
      return { shouldRetry: false, action: 'block-host', reason: 'too-many-errors' };
    }

    if (attempt >= this.networkConfig.maxRetries) {
      return { shouldRetry: false, action: 'abandon', reason: 'max-retries-exceeded' };
    }

    const delay = this._calculateBackoff(attempt);
    return { shouldRetry: true, action: 'retry', delay, reason: classification.reason };
  }

  _handleConnectionReset(host, attempt) {
    const resetCount = (this._connectionResets.get(host) || 0) + 1;
    this._connectionResets.set(host, resetCount);

    // Multiple resets suggest host issues
    if (resetCount >= 3) {
      this._lockoutHost(host);
      if (this.context) {
        this.context.blockDomain(host, 'repeated-connection-resets');
      }
      return { shouldRetry: false, action: 'block-host', reason: 'connection-unstable' };
    }

    // Retry with longer delay
    const delay = this._calculateBackoff(attempt) * 2;
    return { shouldRetry: true, action: 'retry', delay, reason: 'connection-reset' };
  }

  // === Host Error Tracking ===

  _recordHostError(host, reason) {
    if (!this._hostErrors.has(host)) {
      this._hostErrors.set(host, { errors: [], lockedUntil: null });
    }

    const state = this._hostErrors.get(host);
    const now = Date.now();

    // Add error
    state.errors.push({ timestamp: now, reason });

    // Prune old errors outside window
    const cutoff = now - this.hostConfig.windowMs;
    state.errors = state.errors.filter(e => e.timestamp > cutoff);
  }

  _getHostErrorCount(host) {
    const state = this._hostErrors.get(host);
    if (!state) return 0;

    const now = Date.now();
    const cutoff = now - this.hostConfig.windowMs;
    return state.errors.filter(e => e.timestamp > cutoff).length;
  }

  _lockoutHost(host) {
    if (!this._hostErrors.has(host)) {
      this._hostErrors.set(host, { errors: [], lockedUntil: null });
    }
    this._hostErrors.get(host).lockedUntil = Date.now() + this.hostConfig.lockoutMs;
  }

  _getHostLockout(host) {
    const state = this._hostErrors.get(host);
    if (!state || !state.lockedUntil) return null;

    const remaining = state.lockedUntil - Date.now();
    if (remaining <= 0) {
      state.lockedUntil = null;
      return null;
    }

    return { remainingMs: remaining };
  }

  // === Domain Rate Limiting ===

  _getDomainState(domain) {
    if (!this._domainTokens.has(domain)) {
      this._domainTokens.set(domain, {
        tokens: this.domainConfig.burstSize,
        lastRefill: Date.now()
      });
    }
    return this._domainTokens.get(domain);
  }

  _refillTokens(state) {
    const now = Date.now();
    const elapsed = now - state.lastRefill;
    const msPerToken = 60000 / this.domainConfig.requestsPerMinute;
    const newTokens = Math.floor(elapsed / msPerToken);

    if (newTokens > 0) {
      state.tokens = Math.min(state.tokens + newTokens, this.domainConfig.burstSize);
      state.lastRefill = now;
    }
  }

  // === Backoff Calculation ===

  _calculateBackoff(attempt) {
    const exponential = this.networkConfig.baseDelayMs * Math.pow(2, attempt);
    const capped = Math.min(exponential, this.networkConfig.maxDelayMs);
    const jitter = capped * this.networkConfig.jitterFactor * Math.random();
    return Math.round(capped + jitter);
  }
}

module.exports = RetryCoordinator;
```

### Migration Steps

1. **Create `src/crawler/retry/` directory**
2. **Implement RetryCoordinator**
3. **Update FetchPipeline** to use coordinator
4. **Deprecate** individual retry services
5. **Update CrawlerServiceWiring** to inject coordinator
6. **Update tests**

---

## Phase 5: Service Groups

### Problem
`CrawlerServiceWiring.js` is 220+ lines, wiring 30+ services directly into the crawler.

### Solution
Group related services behind facade interfaces.

### New Structure

```
src/crawler/services/
├── groups/
│   ├── PlanningServices.js      # planner, adaptiveSeed, milestoneTracker
│   ├── ProcessingServices.js    # articleProcessor, linkExtractor, fetchPipeline
│   ├── PolicyServices.js        # urlPolicy, robotsChecker, decisionOrchestrator
│   ├── TelemetryServices.js     # events, telemetry, progressTracker
│   └── StorageServices.js       # cache, dbAdapter, articleStorage
├── ServiceContainer.js          # DI container
└── index.js
```

### New File: `src/crawler/services/ServiceContainer.js`

```javascript
'use strict';

/**
 * ServiceContainer - Lightweight DI container for crawler services.
 *
 * Features:
 * - Lazy instantiation
 * - Singleton by default
 * - Dependency resolution
 * - Service groups
 */
class ServiceContainer {
  constructor() {
    this._factories = new Map();
    this._instances = new Map();
    this._groups = new Map();
  }

  /**
   * Register a service factory.
   *
   * @param {string} name - Service name
   * @param {Function} factory - (container) => service instance
   * @param {Object} options - { singleton: true, group: 'groupName' }
   */
  register(name, factory, options = {}) {
    this._factories.set(name, { factory, options });

    if (options.group) {
      if (!this._groups.has(options.group)) {
        this._groups.set(options.group, new Set());
      }
      this._groups.get(options.group).add(name);
    }

    return this;
  }

  /**
   * Get a service instance.
   */
  get(name) {
    // Check cache for singletons
    if (this._instances.has(name)) {
      return this._instances.get(name);
    }

    const registration = this._factories.get(name);
    if (!registration) {
      throw new Error(`Service not registered: ${name}`);
    }

    const { factory, options } = registration;
    const instance = factory(this);

    if (options.singleton !== false) {
      this._instances.set(name, instance);
    }

    return instance;
  }

  /**
   * Check if a service is registered.
   */
  has(name) {
    return this._factories.has(name);
  }

  /**
   * Get all services in a group.
   */
  getGroup(groupName) {
    const names = this._groups.get(groupName);
    if (!names) return {};

    const services = {};
    for (const name of names) {
      services[name] = this.get(name);
    }
    return services;
  }

  /**
   * Register multiple services at once.
   */
  registerAll(registrations) {
    for (const [name, config] of Object.entries(registrations)) {
      if (typeof config === 'function') {
        this.register(name, config);
      } else {
        this.register(name, config.factory, config.options);
      }
    }
    return this;
  }

  /**
   * Clear all instances (for testing).
   */
  reset() {
    this._instances.clear();
  }

  /**
   * Dispose all services that have dispose methods.
   */
  async dispose() {
    for (const [name, instance] of this._instances) {
      if (instance && typeof instance.dispose === 'function') {
        try {
          await instance.dispose();
        } catch (e) {
          console.error(`Error disposing ${name}:`, e);
        }
      }
    }
    this._instances.clear();
  }
}

module.exports = ServiceContainer;
```

### Example Service Group: `src/crawler/services/groups/PolicyServices.js`

```javascript
'use strict';

const UrlDecisionOrchestrator = require('../../decisions/UrlDecisionOrchestrator');

/**
 * PolicyServices - URL policy and decision services.
 */
function registerPolicyServices(container, config) {
  container.register('robotsChecker', (c) => {
    const RobotsChecker = require('../../RobotsChecker');
    return new RobotsChecker({
      userAgent: config.userAgent
    });
  }, { group: 'policy' });

  container.register('urlDecisionOrchestrator', (c) => {
    return new UrlDecisionOrchestrator({
      context: c.get('context'),
      robotsChecker: c.get('robotsChecker'),
      config: {
        stayOnDomain: config.stayOnDomain,
        startDomain: config.startDomain,
        maxDepth: config.maxDepth,
        respectRobots: config.respectRobots,
        skipQueryUrls: !config.allowQueryUrls,
        maxPages: config.maxPages
      }
    });
  }, { group: 'policy' });

  // Facade for policy group
  container.register('policy', (c) => ({
    robots: c.get('robotsChecker'),
    decisions: c.get('urlDecisionOrchestrator'),

    async canCrawl(url, metadata) {
      const decision = await c.get('urlDecisionOrchestrator').decide(url, metadata);
      return decision.action === 'fetch' || decision.action === 'cache';
    }
  }), { group: 'facades' });
}

module.exports = { registerPolicyServices };
```

### Updated Wiring: `src/crawler/services/wireServices.js`

```javascript
'use strict';

const ServiceContainer = require('./ServiceContainer');
const { registerPolicyServices } = require('./groups/PolicyServices');
const { registerPlanningServices } = require('./groups/PlanningServices');
const { registerProcessingServices } = require('./groups/ProcessingServices');
const { registerTelemetryServices } = require('./groups/TelemetryServices');
const { registerStorageServices } = require('./groups/StorageServices');

/**
 * Wire all crawler services into a container.
 *
 * @param {Object} config - Crawler configuration
 * @param {Object} options - { db, cache, existingServices }
 * @returns {ServiceContainer}
 */
function wireServices(config, options = {}) {
  const container = new ServiceContainer();

  // Core services
  container.register('config', () => config);
  container.register('context', () => {
    const CrawlContext = require('../context/CrawlContext');
    return CrawlContext.create({ jobId: config.jobId });
  });

  // Service groups
  registerStorageServices(container, config, options);
  registerPolicyServices(container, config);
  registerTelemetryServices(container, config);
  registerPlanningServices(container, config);
  registerProcessingServices(container, config);

  // Retry coordination
  container.register('retryCoordinator', (c) => {
    const RetryCoordinator = require('../retry/RetryCoordinator');
    return new RetryCoordinator({
      context: c.get('context'),
      maxRetries: config.maxRetries || 3
    });
  });

  // Sequence runner
  container.register('sequenceRunner', (c) => {
    const SequenceRunner = require('../sequence/SequenceRunner');
    return new SequenceRunner({
      context: c.get('context'),
      telemetry: c.get('telemetry')
    });
  });

  return container;
}

module.exports = { wireServices };
```

---

## Phase 6: New Abstractions

### 6.1 CrawlPlan

First-class representation of crawl intent, separate from execution.

```javascript
// src/crawler/plan/CrawlPlan.js

class CrawlPlan {
  constructor(options = {}) {
    this.goals = options.goals || [];           // What we want to achieve
    this.constraints = options.constraints || {}; // Limits and rules
    this.priorities = options.priorities || [];  // What matters most
    this.seeds = options.seeds || [];           // Starting points
  }

  // Goal types
  static GOALS = {
    DISCOVER_ARTICLES: 'discover-articles',
    MAP_STRUCTURE: 'map-structure',
    REFRESH_CONTENT: 'refresh-content',
    GEOGRAPHIC_COVERAGE: 'geographic-coverage'
  };

  addGoal(type, target = {}) {
    this.goals.push({ type, target, status: 'pending' });
    return this;
  }

  setConstraint(name, value) {
    this.constraints[name] = value;
    return this;
  }

  addSeed(url, metadata = {}) {
    this.seeds.push({ url, ...metadata });
    return this;
  }

  // Check if plan is satisfiable given current state
  isSatisfied(context) {
    return this.goals.every(goal => this._isGoalMet(goal, context));
  }

  _isGoalMet(goal, context) {
    switch (goal.type) {
      case CrawlPlan.GOALS.DISCOVER_ARTICLES:
        return context.stats.articles >= (goal.target.count || 0);
      case CrawlPlan.GOALS.MAP_STRUCTURE:
        return context.stats.visited >= (goal.target.pages || 0);
      default:
        return false;
    }
  }

  toJSON() {
    return {
      goals: this.goals,
      constraints: this.constraints,
      priorities: this.priorities,
      seeds: this.seeds
    };
  }

  static fromConfig(config) {
    const plan = new CrawlPlan();

    if (config.maxPages) {
      plan.setConstraint('maxPages', config.maxPages);
    }
    if (config.maxDepth) {
      plan.setConstraint('maxDepth', config.maxDepth);
    }
    if (config.startUrl) {
      plan.addSeed(config.startUrl, { depth: 0, priority: 0 });
    }

    // Infer goals from crawl type
    switch (config.crawlType) {
      case 'intelligent':
        plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES);
        break;
      case 'discover-structure':
        plan.addGoal(CrawlPlan.GOALS.MAP_STRUCTURE);
        break;
      case 'geography':
        plan.addGoal(CrawlPlan.GOALS.GEOGRAPHIC_COVERAGE);
        break;
      default:
        plan.addGoal(CrawlPlan.GOALS.DISCOVER_ARTICLES);
    }

    return plan;
  }
}

module.exports = CrawlPlan;
```

### 6.2 ProgressModel

Unified view of crawl progress.

```javascript
// src/crawler/progress/ProgressModel.js

class ProgressModel {
  constructor(context, plan) {
    this.context = context;
    this.plan = plan;
  }

  get completion() {
    const stats = this.context.stats;
    const constraints = this.plan.constraints;

    // Calculate completion percentage based on constraints
    if (constraints.maxPages) {
      return Math.min(100, (stats.visited / constraints.maxPages) * 100);
    }

    // If no explicit limit, estimate based on queue
    const total = stats.visited + stats.queued;
    if (total === 0) return 0;
    return (stats.visited / total) * 100;
  }

  get eta() {
    const elapsed = this.context.elapsedMs;
    const completion = this.completion;

    if (completion === 0 || elapsed === 0) return null;

    const totalEstimate = (elapsed / completion) * 100;
    return Math.round(totalEstimate - elapsed);
  }

  get rate() {
    const elapsed = this.context.elapsedMs / 1000; // seconds
    if (elapsed === 0) return { pagesPerSecond: 0, bytesPerSecond: 0 };

    const stats = this.context.stats;
    return {
      pagesPerSecond: stats.visited / elapsed,
      bytesPerSecond: stats.bytesDownloaded / elapsed
    };
  }

  get goalProgress() {
    return this.plan.goals.map(goal => ({
      type: goal.type,
      target: goal.target,
      current: this._getGoalCurrent(goal),
      percentage: this._getGoalPercentage(goal)
    }));
  }

  _getGoalCurrent(goal) {
    const stats = this.context.stats;
    switch (goal.type) {
      case 'discover-articles': return stats.articles;
      case 'map-structure': return stats.visited;
      default: return 0;
    }
  }

  _getGoalPercentage(goal) {
    const current = this._getGoalCurrent(goal);
    const target = goal.target?.count || goal.target?.pages || 100;
    return Math.min(100, (current / target) * 100);
  }

  toJSON() {
    return {
      completion: this.completion,
      eta: this.eta,
      rate: this.rate,
      goals: this.goalProgress,
      stats: this.context.stats
    };
  }
}

module.exports = ProgressModel;
```

### 6.3 ResourceBudget

Explicit tracking of budgets with enforcement.

```javascript
// src/crawler/budget/ResourceBudget.js

class ResourceBudget {
  constructor(limits = {}) {
    this.limits = {
      maxPages: limits.maxPages || Infinity,
      maxBytes: limits.maxBytes || Infinity,
      maxTimeMs: limits.maxTimeMs || Infinity,
      maxErrors: limits.maxErrors || 100,
      maxMemoryMb: limits.maxMemoryMb || Infinity
    };

    this.spent = {
      pages: 0,
      bytes: 0,
      startTime: null,
      errors: 0
    };

    this._exhaustedCallbacks = [];
  }

  start() {
    this.spent.startTime = Date.now();
  }

  spendPage() {
    this.spent.pages++;
    this._checkExhausted('pages');
  }

  spendBytes(n) {
    this.spent.bytes += n;
    this._checkExhausted('bytes');
  }

  spendError() {
    this.spent.errors++;
    this._checkExhausted('errors');
  }

  get remaining() {
    return {
      pages: Math.max(0, this.limits.maxPages - this.spent.pages),
      bytes: Math.max(0, this.limits.maxBytes - this.spent.bytes),
      timeMs: Math.max(0, this.limits.maxTimeMs - this.elapsedMs),
      errors: Math.max(0, this.limits.maxErrors - this.spent.errors)
    };
  }

  get elapsedMs() {
    if (!this.spent.startTime) return 0;
    return Date.now() - this.spent.startTime;
  }

  isExhausted(resource = null) {
    if (resource) {
      return this.remaining[resource] <= 0;
    }

    return Object.values(this.remaining).some(r => r <= 0);
  }

  getExhaustedResources() {
    return Object.entries(this.remaining)
      .filter(([, remaining]) => remaining <= 0)
      .map(([resource]) => resource);
  }

  onExhausted(callback) {
    this._exhaustedCallbacks.push(callback);
  }

  _checkExhausted(resource) {
    if (this.isExhausted(resource)) {
      for (const cb of this._exhaustedCallbacks) {
        try {
          cb(resource, this);
        } catch (e) {
          console.error('Budget exhausted callback error:', e);
        }
      }
    }
  }

  checkMemory() {
    if (this.limits.maxMemoryMb === Infinity) return true;

    const used = process.memoryUsage();
    const usedMb = used.heapUsed / 1024 / 1024;
    return usedMb < this.limits.maxMemoryMb;
  }

  toJSON() {
    return {
      limits: this.limits,
      spent: this.spent,
      remaining: this.remaining,
      exhausted: this.getExhaustedResources()
    };
  }
}

module.exports = ResourceBudget;
```

---

## Implementation Order

### Recommended Sequence

1. **Phase 1: CrawlContext** (High impact, foundational)
   - Enables all other phases
   - Immediate benefit: unified state

2. **Phase 4: RetryCoordinator** (High value, isolated)
   - Can be done in parallel with Phase 1
   - Fixes scattered retry logic

3. **Phase 3: UrlDecisionOrchestrator** (Depends on Phase 1)
   - Uses CrawlContext for state
   - Consolidates decision logic

4. **Phase 2: SequenceRunner** (Moderate effort)
   - Consolidation task
   - Lower risk

5. **Phase 5: Service Groups** (Depends on Phases 1-4)
   - Reorganizes wiring
   - Uses new components

6. **Phase 6: New Abstractions** (Enhancement)
   - Adds CrawlPlan, ProgressModel, ResourceBudget
   - Optional but valuable

### Estimated Effort

| Phase | Effort | Risk | Value |
|-------|--------|------|-------|
| 1. CrawlContext | Medium | Medium | High |
| 2. SequenceRunner | Low | Low | Medium |
| 3. UrlDecisionOrchestrator | Medium | Medium | High |
| 4. RetryCoordinator | Medium | Low | High |
| 5. Service Groups | High | Medium | Medium |
| 6. New Abstractions | Medium | Low | High |

---

## Testing Strategy

### For Each Phase

1. **Unit Tests**
   - Test new abstraction in isolation
   - Mock dependencies

2. **Integration Tests**
   - Test interaction with existing code
   - Verify backward compatibility

3. **Migration Tests**
   - Old API still works (deprecation period)
   - New API produces same results

### Key Test Files to Create

```
tests/crawler/context/CrawlContext.test.js
tests/crawler/sequence/SequenceRunner.test.js
tests/crawler/decisions/UrlDecisionOrchestrator.test.js
tests/crawler/retry/RetryCoordinator.test.js
tests/crawler/services/ServiceContainer.test.js
tests/crawler/plan/CrawlPlan.test.js
tests/crawler/progress/ProgressModel.test.js
tests/crawler/budget/ResourceBudget.test.js
```

---

## Backward Compatibility

### Deprecation Strategy

1. **Phase 1**: Add new abstractions alongside old ones
2. **Phase 2**: Log deprecation warnings on old API usage
3. **Phase 3**: Remove old code (next major version)

### Example Deprecation

```javascript
// Old: Direct cache access (deprecated)
get urlDecisionCache() {
  console.warn('DEPRECATED: Use context.getUrlDecision() instead');
  return this._legacyUrlDecisionCache;
}

// New: Via context
const decision = this.context.getUrlDecision(url);
```

---

## Success Metrics

After refactoring, we should see:

1. **Reduced file count**: Fewer scattered implementations
2. **Simpler wiring**: `wireServices()` under 50 lines
3. **Unified state**: Single `context.stats` source
4. **Clear decision flow**: One place for URL eligibility
5. **Consistent retry**: One coordinator for all levels
6. **Better testability**: Isolated, mockable components
7. **Improved debugging**: CrawlContext.toJSON() gives full state snapshot

---

## Open Questions

1. Should CrawlContext persist to disk for crash recovery?
2. Should we use a proper DI framework (e.g., awilix) instead of custom container?
3. How to handle mode-specific services that aren't needed in all modes?
4. Should CrawlPlan be immutable after crawl starts?

---

## References

- Current architecture: `src/crawler/modes/`, `src/crawler/operations/`
- Service wiring: `src/crawler/CrawlerServiceWiring.js`
- Queue management: `src/crawler/QueueManager.js`
- Pipeline: `src/crawler/pipeline/`
