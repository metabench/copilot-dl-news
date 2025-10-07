# Service Layer Architecture

**Status**: Phase 3 Implementation Plan  
**Created**: October 7, 2025  
**Goal**: Extract business logic from route handlers into testable, reusable service classes

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Principles](#architecture-principles)
3. [Service Design Patterns](#service-design-patterns)
4. [Service Catalog](#service-catalog)
5. [Implementation Strategy](#implementation-strategy)
6. [Testing Strategy](#testing-strategy)
7. [Migration Plan](#migration-plan)
8. [Examples](#examples)

---

## Overview

### Current State (Phase 2 Complete)

✅ **Centralized error handling** - All routes use typed errors and middleware  
✅ **Standardized DB access** - Routes use `withNewsDb()` helper  
✅ **Clean imports** - All require() at top of files  

❌ **Route handlers contain business logic** - Heavy computation, state management  
❌ **Difficult to test** - Routes require full Express setup  
❌ **Duplicate logic** - Similar patterns repeated across routes  
❌ **Tight coupling** - Routes directly manipulate job registry, databases  

### Target State (Phase 3)

✅ **Thin route controllers** - Routes orchestrate, services execute  
✅ **Testable services** - Business logic in pure functions/classes  
✅ **Dependency injection** - Services receive dependencies via constructor  
✅ **Single responsibility** - Each service handles one domain concept  
✅ **Reusable logic** - Services can be used by routes, CLI tools, background tasks  

---

## Architecture Principles

### 1. **Separation of Concerns**

**Routes (Controllers):**
- Parse HTTP requests
- Validate input (basic checks)
- Call service methods
- Format HTTP responses
- Handle HTTP-specific concerns (status codes, headers)

**Services (Business Logic):**
- Implement domain rules
- Coordinate multiple operations
- Manage state transitions
- Return domain objects/DTOs
- Throw domain exceptions (not HTTP errors)

**Data Access (Repositories):**
- Database queries
- Data mapping/transformation
- Transaction management
- Already implemented in `src/ui/express/data/*`

### 2. **Dependency Injection**

Services receive all dependencies via constructor:

```javascript
class CrawlService {
  constructor({ jobRegistry, runner, buildArgs, urlsDbPath, db }) {
    this.jobRegistry = jobRegistry;
    this.runner = runner;
    this.buildArgs = buildArgs;
    this.urlsDbPath = urlsDbPath;
    this.db = db;
  }
  
  startCrawl(options) {
    // Implementation uses injected dependencies
  }
}
```

**Benefits:**
- Easy to mock for testing
- Clear dependency graph
- Can swap implementations (e.g., different runners)
- No global state

### 3. **Return Domain Objects, Not HTTP Responses**

**❌ Bad (couples service to HTTP):**
```javascript
class CrawlService {
  startCrawl(options) {
    if (!this.canStart()) {
      return { status: 409, body: { error: 'Already running' } };
    }
    // ...
  }
}
```

**✅ Good (returns domain result):**
```javascript
class CrawlService {
  startCrawl(options) {
    if (!this.canStart()) {
      throw new CrawlAlreadyRunningError('Cannot start: crawler already running');
    }
    return { jobId, process, startedAt };
  }
}
```

Routes convert domain errors to HTTP errors:
```javascript
router.post('/api/crawl', async (req, res, next) => {
  try {
    const result = await crawlService.startCrawl(req.body);
    res.status(202).json({ jobId: result.jobId, ... });
  } catch (err) {
    if (err instanceof CrawlAlreadyRunningError) {
      return next(new ConflictError(err.message));
    }
    next(new InternalServerError(err.message));
  }
});
```

### 4. **Stateless Where Possible**

Prefer services that don't hold mutable state:

**✅ Stateless (preferred):**
```javascript
class QueuePlannerService {
  planResumeQueues({ queues, availableSlots, runningJobIds, runningDomains }) {
    // Pure function - no side effects
    return { selected, blocked, reasons };
  }
}
```

**⚠️ Stateful (when necessary):**
```javascript
class JobRegistryService {
  constructor() {
    this.jobs = new Map(); // Necessary state
  }
  
  registerJob(job) {
    this.jobs.set(job.id, job);
  }
}
```

### 5. **Interface Segregation**

Services should have focused, cohesive APIs:

**❌ Bad (God service):**
```javascript
class CrawlerService {
  startCrawl() { ... }
  stopCrawl() { ... }
  pauseCrawl() { ... }
  resumeCrawl() { ... }
  planQueue() { ... }
  analyzeResults() { ... }
  exportData() { ... }
}
```

**✅ Good (focused services):**
```javascript
class CrawlOrchestrationService { startCrawl(), stopCrawl() }
class CrawlLifecycleService { pauseCrawl(), resumeCrawl() }
class QueuePlannerService { planResumeQueues() }
class AnalyticsService { calculateCoverage() }
```

---

## Service Design Patterns

### Pattern 1: Orchestration Service

**Purpose:** Coordinate multiple operations in a workflow

**Example:** `CrawlOrchestrationService`

```javascript
class CrawlOrchestrationService {
  constructor({ jobRegistry, runner, buildArgs, urlsDbPath, db, eventBus }) {
    this.jobRegistry = jobRegistry;
    this.runner = runner;
    this.buildArgs = buildArgs;
    this.urlsDbPath = urlsDbPath;
    this.db = db;
    this.eventBus = eventBus;
  }
  
  /**
   * Start a new crawl job
   * @param {Object} options - Crawl configuration
   * @returns {Object} { jobId, process, startedAt, args }
   * @throws {CrawlAlreadyRunningError} If crawler already running
   * @throws {InvalidArgumentError} If options invalid
   */
  async startCrawl(options) {
    // 1. Validate can start
    const status = this.jobRegistry.checkStartAllowed();
    if (!status.ok) {
      throw new CrawlAlreadyRunningError(status.reason);
    }
    
    // 2. Build arguments
    const args = this.buildArgs(options);
    const jobId = this.jobRegistry.reserveJobId();
    
    // 3. Enhance arguments
    if (!args.some(a => /^--db=/.test(a))) {
      args.push(`--db=${this.urlsDbPath}`);
    }
    args.push(`--job-id=${jobId}`);
    
    // 4. Start process
    const child = this.runner.start(args);
    
    // 5. Create job descriptor
    const job = {
      id: jobId,
      child,
      args: [...args],
      url: this._extractUrl(args),
      startedAt: new Date().toISOString(),
      stage: 'preparing',
      metrics: this._createInitialMetrics()
    };
    
    // 6. Register job
    this.jobRegistry.registerJob(job);
    
    // 7. Record in database
    await this._recordJobStart(job);
    
    // 8. Setup event handlers
    this._setupJobEventHandlers(job);
    
    // 9. Emit event
    this.eventBus.emit('job-started', { jobId, url: job.url });
    
    return {
      jobId: job.id,
      process: child,
      startedAt: job.startedAt,
      args: job.args,
      url: job.url
    };
  }
  
  // Private helper methods
  _extractUrl(args) { /* ... */ }
  _createInitialMetrics() { /* ... */ }
  async _recordJobStart(job) { /* ... */ }
  _setupJobEventHandlers(job) { /* ... */ }
}
```

### Pattern 2: Planning/Strategy Service

**Purpose:** Make decisions based on business rules

**Example:** `QueuePlannerService`

```javascript
class QueuePlannerService {
  constructor({ domainExtractor, queueNormalizer }) {
    this.domainExtractor = domainExtractor;
    this.queueNormalizer = queueNormalizer;
  }
  
  /**
   * Plan which queues to resume based on constraints
   * @param {Object} params - Planning parameters
   * @returns {Object} { selected, blocked, recommendations }
   */
  planResumeQueues({ queues, availableSlots, runningJobIds, runningDomains }) {
    const infoById = new Map();
    const selected = [];
    const blocked = [];
    const domainGuard = new Set(runningDomains || []);
    
    for (const raw of queues || []) {
      const queue = this.queueNormalizer.normalize(raw);
      if (!queue) continue;
      
      const domain = this.domainExtractor.extract(queue.url);
      const entry = {
        queue,
        domain,
        reasons: [],
        state: 'available'
      };
      
      // Apply business rules
      if (runningJobIds?.has(queue.id)) {
        entry.state = 'blocked';
        entry.reasons.push('already-running');
      } else if (!this._hasValidSource(queue)) {
        entry.state = 'blocked';
        entry.reasons.push('missing-source');
      } else if (domain && domainGuard.has(domain)) {
        entry.state = 'blocked';
        entry.reasons.push('domain-conflict');
      } else if (selected.length >= availableSlots) {
        entry.state = 'queued';
        entry.reasons.push('capacity-exceeded');
      } else {
        entry.state = 'selected';
        selected.push(entry);
        if (domain) domainGuard.add(domain);
      }
      
      infoById.set(queue.id, entry);
      if (entry.state === 'blocked') blocked.push(entry);
    }
    
    return {
      selected,
      blocked,
      info: infoById,
      recommendations: this._generateRecommendations(selected, blocked)
    };
  }
  
  _hasValidSource(queue) {
    return !!(queue.url || queue.args);
  }
  
  _generateRecommendations(selected, blocked) {
    return {
      canStart: selected.length,
      domainConflicts: blocked.filter(e => e.reasons.includes('domain-conflict')).length,
      missingSource: blocked.filter(e => e.reasons.includes('missing-source')).length
    };
  }
}
```

### Pattern 3: Calculation/Analytics Service

**Purpose:** Perform complex calculations and aggregations

**Example:** `CoverageAnalyticsService`

```javascript
class CoverageAnalyticsService {
  constructor({ db }) {
    this.db = db;
  }
  
  /**
   * Calculate coverage metrics for a job
   * @param {number} jobId - Job identifier
   * @returns {Object} Coverage metrics
   */
  async calculateCoverage(jobId) {
    const snapshot = await this._getSnapshot(jobId);
    const trends = await this._getTrends(jobId);
    const gaps = await this._analyzeGaps(jobId);
    
    return {
      snapshot: {
        total: snapshot.total,
        discovered: snapshot.discovered,
        visited: snapshot.visited,
        analyzed: snapshot.analyzed,
        percentage: this._calculatePercentage(snapshot.visited, snapshot.total)
      },
      trends: {
        visitRate: trends.visitRate,
        analysisRate: trends.analysisRate,
        errorRate: trends.errorRate
      },
      gaps: {
        unvisited: gaps.unvisited,
        topDomains: gaps.topDomains.slice(0, 10)
      }
    };
  }
  
  async _getSnapshot(jobId) { /* Query DB */ }
  async _getTrends(jobId) { /* Calculate rates */ }
  async _analyzeGaps(jobId) { /* Find gaps */ }
  _calculatePercentage(part, whole) { /* Math */ }
}
```

### Pattern 4: Event Handler Service

**Purpose:** React to domain events and coordinate side effects

**Example:** `JobEventHandlerService`

```javascript
class JobEventHandlerService {
  constructor({ db, eventBus, broadcaster, jobRegistry }) {
    this.db = db;
    this.eventBus = eventBus;
    this.broadcaster = broadcaster;
    this.jobRegistry = jobRegistry;
  }
  
  /**
   * Setup event handlers for a job's process
   */
  attachHandlers(job) {
    const { child, id: jobId } = job;
    
    // Handle stdout (progress updates)
    child.stdout.on('data', (chunk) => {
      this._handleStdout(job, chunk);
    });
    
    // Handle stderr (error messages)
    child.stderr.on('data', (chunk) => {
      this._handleStderr(job, chunk);
    });
    
    // Handle process exit
    child.on('exit', (code, signal) => {
      this._handleExit(job, code, signal);
    });
    
    // Handle process error
    child.on('error', (err) => {
      this._handleError(job, err);
    });
  }
  
  _handleStdout(job, chunk) {
    job.stdoutBuf += chunk.toString();
    let idx;
    while ((idx = job.stdoutBuf.indexOf('\n')) !== -1) {
      const line = job.stdoutBuf.slice(0, idx);
      job.stdoutBuf = job.stdoutBuf.slice(idx + 1);
      
      if (line.startsWith('PROGRESS ')) {
        this._processProgressLine(job, line);
      } else if (line.startsWith('MILESTONE ')) {
        this._processMilestoneLine(job, line);
      } else {
        this.broadcaster.broadcast('log', { stream: 'stdout', line }, job.id);
      }
    }
  }
  
  _processProgressLine(job, line) {
    try {
      const payload = JSON.parse(line.slice('PROGRESS '.length));
      this.eventBus.emit('progress-update', { jobId: job.id, payload });
      this.broadcaster.broadcastProgress(payload, job.id, job.metrics);
    } catch (err) {
      // Log parsing error
    }
  }
  
  _processMilestoneLine(job, line) {
    try {
      const milestone = JSON.parse(line.slice('MILESTONE '.length));
      this.eventBus.emit('milestone-reached', { jobId: job.id, milestone });
      this.broadcaster.broadcast('milestone', milestone, job.id);
    } catch (err) {
      // Log parsing error
    }
  }
  
  _handleExit(job, code, signal) {
    const endedAt = new Date().toISOString();
    const stage = code !== 0 ? 'failed' : 'done';
    
    this.jobRegistry.updateJobStage(job, stage);
    job.lastExit = { code, signal, endedAt };
    
    this.db.run(
      'UPDATE queues SET ended_at = ?, status = ? WHERE id = ?',
      [endedAt, 'done', job.id]
    );
    
    this.eventBus.emit('job-completed', { 
      jobId: job.id, 
      code, 
      signal, 
      endedAt 
    });
    
    this.broadcaster.broadcast('done', job.lastExit, job.id);
    
    // Cleanup after delay
    setTimeout(() => {
      this.jobRegistry.removeJob(job.id);
      this.broadcaster.broadcastJobs(true);
    }, 350);
  }
}
```

---

## Service Catalog

### Priority 1: Core Services (Week 1)

#### 1. **CrawlOrchestrationService**
**Purpose:** Start and coordinate crawl jobs  
**Extracts from:** `api.crawl.js` (lines 58-310)  
**Complexity:** HIGH (300+ lines of orchestration logic)  
**Impact:** HIGH (core feature)

**Methods:**
- `startCrawl(options)` - Start new crawl with full setup
- `validateCrawlOptions(options)` - Validate before starting
- `buildJobDescriptor(args, child)` - Create job object

**Dependencies:**
- JobRegistryService
- ProcessRunnerService
- ArgumentBuilderService
- EventBusService
- DatabaseService

#### 2. **JobEventHandlerService**
**Purpose:** Handle process events (stdout, stderr, exit)  
**Extracts from:** `api.crawl.js` (lines 150-280), `api.resume-all.js` (lines 380-520)  
**Complexity:** HIGH (event parsing, state updates)  
**Impact:** HIGH (affects all jobs)

**Methods:**
- `attachHandlers(job)` - Setup all event listeners
- `handleStdout(job, data)` - Process stdout stream
- `handleStderr(job, data)` - Process stderr stream
- `handleExit(job, code, signal)` - Process termination
- `parseProgressLine(line)` - Extract PROGRESS JSON
- `parseMilestoneLine(line)` - Extract MILESTONE JSON

**Dependencies:**
- JobRegistryService
- BroadcasterService
- DatabaseService
- EventBusService

#### 3. **QueuePlannerService**
**Purpose:** Plan which queues to resume  
**Extracts from:** `api.resume-all.js` (lines 60-110)  
**Complexity:** MEDIUM (business rules)  
**Impact:** MEDIUM (resume feature)

**Methods:**
- `planResumeQueues({ queues, slots, running, domains })` - Main planning
- `normalizeQueue(raw)` - Standardize queue format
- `extractDomain(url)` - Get domain from URL
- `validateSource(queue)` - Check URL/args exist

**Dependencies:**
- DomainExtractorService (utility)

### Priority 2: Lifecycle Services (Week 2)

#### 4. **CrawlLifecycleService**
**Purpose:** Pause, resume, stop operations  
**Extracts from:** Multiple route files  
**Complexity:** MEDIUM  
**Impact:** MEDIUM

**Methods:**
- `pauseCrawl(jobId)` - Pause running job
- `resumeCrawl(jobId)` - Resume paused job
- `stopCrawl(jobId)` - Stop job gracefully
- `killCrawl(jobId)` - Force kill job

**Dependencies:**
- JobRegistryService
- BroadcasterService

#### 5. **CoverageAnalyticsService**
**Purpose:** Calculate coverage metrics  
**Extracts from:** `coverage.js` (analytics calculations)  
**Complexity:** MEDIUM (SQL queries + calculations)  
**Impact:** MEDIUM

**Methods:**
- `calculateCoverage(jobId)` - Get coverage snapshot
- `getTrends(jobId, window)` - Calculate trend metrics
- `analyzeGaps(jobId)` - Find unvisited areas
- `getHealthMetrics(jobId)` - Job health indicators

**Dependencies:**
- DatabaseService

### Priority 3: Support Services (Week 3)

#### 6. **JobRegistryService** (formalize existing)
**Purpose:** Manage active job state  
**Current:** Exists as `JobRegistry` class  
**Refactor:** Formalize API, add documentation  
**Complexity:** LOW (mostly exists)

**Methods:**
- `registerJob(job)` - Add to registry
- `removeJob(jobId)` - Remove from registry
- `getJob(jobId)` - Retrieve job
- `checkStartAllowed()` - Validate can start
- `reserveJobId()` - Generate unique ID

#### 7. **BroadcasterService** (formalize existing)
**Purpose:** SSE event broadcasting  
**Current:** Functions scattered across routes  
**Refactor:** Centralize broadcasting logic  
**Complexity:** LOW

**Methods:**
- `broadcast(event, data, jobId)` - Send SSE event
- `broadcastJobs(force)` - Broadcast job list
- `broadcastProgress(payload, jobId, metrics)` - Broadcast progress

#### 8. **ArgumentBuilderService** (formalize existing)
**Purpose:** Build crawl arguments from options  
**Current:** `buildArgs` function in `buildArgs.js`  
**Refactor:** Add validation, enhance logic  
**Complexity:** LOW

**Methods:**
- `buildArgs(options)` - Convert options to CLI args
- `validateOptions(options)` - Check options validity
- `normalizeOptions(options)` - Standardize format

---

## Implementation Strategy

### Phase 3.1: Create Service Infrastructure (Days 1-2)

1. **Create service directory structure:**
```
src/ui/express/services/
  ├── core/
  │   ├── CrawlOrchestrationService.js
  │   ├── JobEventHandlerService.js
  │   └── QueuePlannerService.js
  ├── lifecycle/
  │   └── CrawlLifecycleService.js
  ├── analytics/
  │   └── CoverageAnalyticsService.js
  ├── support/
  │   ├── JobRegistryService.js      # Refactored from existing
  │   ├── BroadcasterService.js      # Extracted from routes
  │   └── ArgumentBuilderService.js  # Refactored from existing
  ├── errors/
  │   └── ServiceErrors.js           # Domain errors (not HTTP)
  └── index.js                       # Service exports
```

2. **Create domain error classes:**
```javascript
// src/ui/express/services/errors/ServiceErrors.js
class CrawlAlreadyRunningError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CrawlAlreadyRunningError';
  }
}

class InvalidCrawlOptionsError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'InvalidCrawlOptionsError';
    this.field = field;
  }
}

class QueueNotFoundError extends Error {
  constructor(queueId) {
    super(`Queue ${queueId} not found`);
    this.name = 'QueueNotFoundError';
    this.queueId = queueId;
  }
}

module.exports = {
  CrawlAlreadyRunningError,
  InvalidCrawlOptionsError,
  QueueNotFoundError
  // ... more domain errors
};
```

3. **Create service factory pattern:**
```javascript
// src/ui/express/services/ServiceFactory.js
class ServiceFactory {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.instances = new Map();
  }
  
  getCrawlOrchestrationService() {
    if (!this.instances.has('crawlOrchestration')) {
      const { jobRegistry, runner, buildArgs, urlsDbPath, db, eventBus } = this.dependencies;
      this.instances.set('crawlOrchestration', new CrawlOrchestrationService({
        jobRegistry,
        runner,
        buildArgs,
        urlsDbPath,
        db,
        eventBus
      }));
    }
    return this.instances.get('crawlOrchestration');
  }
  
  getQueuePlannerService() {
    if (!this.instances.has('queuePlanner')) {
      this.instances.set('queuePlanner', new QueuePlannerService({
        domainExtractor: this.dependencies.domainExtractor
      }));
    }
    return this.instances.get('queuePlanner');
  }
  
  // ... more service getters
}

module.exports = { ServiceFactory };
```

### Phase 3.2: Implement Priority 1 Services (Days 3-5)

**Day 3:** CrawlOrchestrationService
- Extract from api.crawl.js
- Implement with full JSDoc
- Create unit tests

**Day 4:** JobEventHandlerService
- Extract event handling logic
- Implement with tests
- Verify SSE broadcasting works

**Day 5:** QueuePlannerService
- Extract from api.resume-all.js
- Implement planning algorithm
- Create unit tests

### Phase 3.3: Refactor Routes to Use Services (Days 6-8)

**Example refactoring:**

```javascript
// BEFORE: api.crawl.js (mixed concerns)
router.post('/api/crawl', (req, res) => {
  // 50+ lines of orchestration logic
  const status = jobRegistry.checkStartAllowed();
  if (!status.ok) {
    return res.status(409).json({ error: 'Already running' });
  }
  const args = buildArgs(req.body);
  const jobId = jobRegistry.reserveJobId();
  // ... more logic ...
});

// AFTER: api.crawl.js (thin controller)
router.post('/api/crawl', async (req, res, next) => {
  try {
    const crawlService = req.services.getCrawlOrchestrationService();
    const result = await crawlService.startCrawl(req.body);
    
    res.status(202).json({
      jobId: result.jobId,
      url: result.url,
      startedAt: result.startedAt,
      detailUrl: `/jobs/${result.jobId}/ssr`,
      apiUrl: `/api/jobs/${result.jobId}`
    });
  } catch (err) {
    if (err instanceof CrawlAlreadyRunningError) {
      return next(new ConflictError(err.message));
    }
    if (err instanceof InvalidCrawlOptionsError) {
      return next(new BadRequestError(err.message));
    }
    next(new InternalServerError(err.message));
  }
});
```

### Phase 3.4: Testing & Validation (Days 9-10)

1. **Unit test all services** (isolated)
2. **Integration test routes** (with services)
3. **Run full test suite** (662+ tests)
4. **Performance benchmarks** (no regression)

---

## Testing Strategy

### Unit Testing Services

**Example: QueuePlannerService.test.js**

```javascript
const { QueuePlannerService } = require('../QueuePlannerService');
const { extractDomain } = require('../../../../utils/domainUtils');

describe('QueuePlannerService', () => {
  let service;
  
  beforeEach(() => {
    service = new QueuePlannerService({
      domainExtractor: { extract: extractDomain }
    });
  });
  
  describe('planResumeQueues', () => {
    it('should select queues within available slots', () => {
      const queues = [
        { id: 1, url: 'https://example.com/1', args: null },
        { id: 2, url: 'https://example.com/2', args: null },
        { id: 3, url: 'https://other.com/1', args: null }
      ];
      
      const result = service.planResumeQueues({
        queues,
        availableSlots: 2,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });
      
      expect(result.selected).toHaveLength(2);
      expect(result.blocked).toHaveLength(1);
      expect(result.blocked[0].reasons).toContain('capacity-exceeded');
    });
    
    it('should block queues with domain conflicts', () => {
      const queues = [
        { id: 1, url: 'https://example.com/1', args: null },
        { id: 2, url: 'https://example.com/2', args: null }
      ];
      
      const result = service.planResumeQueues({
        queues,
        availableSlots: 5,
        runningJobIds: new Set(),
        runningDomains: new Set(['example.com'])
      });
      
      expect(result.selected).toHaveLength(0);
      expect(result.blocked).toHaveLength(2);
      expect(result.blocked[0].reasons).toContain('domain-conflict');
    });
    
    it('should block queues with missing source', () => {
      const queues = [
        { id: 1, url: null, args: null } // No URL or args
      ];
      
      const result = service.planResumeQueues({
        queues,
        availableSlots: 5,
        runningJobIds: new Set(),
        runningDomains: new Set()
      });
      
      expect(result.selected).toHaveLength(0);
      expect(result.blocked).toHaveLength(1);
      expect(result.blocked[0].reasons).toContain('missing-source');
    });
  });
});
```

### Integration Testing Routes

**Example: api.crawl.test.js (with service)**

```javascript
const request = require('supertest');
const { createApp } = require('../../../app');
const { CrawlOrchestrationService } = require('../../../services/core/CrawlOrchestrationService');
const { CrawlAlreadyRunningError } = require('../../../services/errors/ServiceErrors');

describe('POST /api/crawl', () => {
  let app, mockService;
  
  beforeEach(() => {
    mockService = {
      startCrawl: jest.fn()
    };
    
    app = createApp({
      services: {
        getCrawlOrchestrationService: () => mockService
      }
    });
  });
  
  it('should return 202 when crawl starts successfully', async () => {
    mockService.startCrawl.mockResolvedValue({
      jobId: 'test-123',
      url: 'https://example.com',
      startedAt: '2025-10-07T12:00:00Z'
    });
    
    const res = await request(app)
      .post('/api/crawl')
      .send({ url: 'https://example.com' })
      .expect(202);
    
    expect(res.body).toMatchObject({
      jobId: 'test-123',
      url: 'https://example.com'
    });
    expect(mockService.startCrawl).toHaveBeenCalledWith({
      url: 'https://example.com'
    });
  });
  
  it('should return 409 when crawler already running', async () => {
    mockService.startCrawl.mockRejectedValue(
      new CrawlAlreadyRunningError('Crawler already running')
    );
    
    const res = await request(app)
      .post('/api/crawl')
      .send({ url: 'https://example.com' })
      .expect(409);
    
    expect(res.body).toMatchObject({
      success: false,
      error: 'Crawler already running',
      code: 'ConflictError'
    });
  });
});
```

---

## Migration Plan

### Week 1: Infrastructure + CrawlOrchestrationService

**Days 1-2:** Setup
- Create `src/ui/express/services/` directory structure
- Create `ServiceErrors.js` with domain errors
- Create `ServiceFactory.js` for dependency injection
- Update server.js to instantiate ServiceFactory

**Days 3-5:** CrawlOrchestrationService
- Extract startCrawl logic from api.crawl.js
- Create CrawlOrchestrationService.js with full JSDoc
- Create unit tests (90%+ coverage)
- Refactor api.crawl.js to use service
- Run full test suite (expect 662+ passing)

### Week 2: Event Handling + Queue Planning

**Days 6-7:** JobEventHandlerService
- Extract event handling from api.crawl.js and api.resume-all.js
- Create JobEventHandlerService.js
- Create unit tests
- Update both routes to use service

**Days 8-10:** QueuePlannerService
- Extract planning logic from api.resume-all.js
- Create QueuePlannerService.js
- Create unit tests
- Refactor api.resume-all.js to use service

### Week 3: Lifecycle + Analytics

**Days 11-13:** CrawlLifecycleService
- Extract pause/resume/stop logic
- Create CrawlLifecycleService.js
- Create unit tests
- Update routes

**Days 14-15:** CoverageAnalyticsService
- Extract analytics calculations
- Create CoverageAnalyticsService.js
- Create unit tests
- Update coverage.js route

---

## Examples

### Example 1: Complete Service Implementation

See `CrawlOrchestrationService` in Pattern 1 above.

### Example 2: Route Before/After

**Before (api.crawl.js - mixed concerns):**
```javascript
router.post('/api/crawl', (req, res) => {
  console.log(`[api] POST /api/crawl received`);
  
  const status = jobRegistry.checkStartAllowed();
  if (!status.ok) {
    console.log('[api] POST /api/crawl -> 409 already-running');
    return res.status(409).json({ error: 'Crawler already running' });
  }
  
  const args = buildArgs(req.body || {});
  const jobId = jobRegistry.reserveJobId();
  
  if (!args.some((a) => /^--db=/.test(a))) {
    args.push(`--db=${urlsDbPath}`);
  }
  if (!args.some((a) => /^--job-id=/.test(a))) {
    args.push(`--job-id=${jobId}`);
  }
  
  const child = runner.start(args);
  
  const job = {
    id: jobId,
    child,
    args: [...args],
    url: args[1] || null,
    startedAt: new Date().toISOString(),
    lastExit: null,
    paused: false,
    stdoutBuf: '',
    stderrBuf: '',
    stage: 'preparing',
    stageChangedAt: Date.now(),
    stdin: child?.stdin || null,
    metrics: {
      visited: 0,
      downloaded: 0,
      // ... 20 more lines ...
    }
  };
  
  jobRegistry.registerJob(job);
  
  const db = getDbRW();
  if (db) {
    recordCrawlJobStart(db, {
      id: jobId,
      url: job.url,
      args: JSON.stringify(args),
      startedAt: job.startedAt
    });
  }
  
  // Setup stdout handler (50 lines)
  child.stdout.on('data', (chunk) => {
    // ... complex parsing logic ...
  });
  
  // Setup stderr handler (20 lines)
  child.stderr.on('data', (chunk) => {
    // ... error handling ...
  });
  
  // Setup exit handler (40 lines)
  child.on('exit', (code, signal) => {
    // ... cleanup logic ...
  });
  
  broadcastJobs(true);
  
  res.status(202).json({
    jobId,
    url: job.url,
    startedAt: job.startedAt
  });
});
```

**After (api.crawl.js - thin controller):**
```javascript
router.post('/api/crawl', async (req, res, next) => {
  try {
    const crawlService = req.services.getCrawlOrchestrationService();
    const result = await crawlService.startCrawl(req.body);
    
    res.status(202).json({
      jobId: result.jobId,
      url: result.url,
      startedAt: result.startedAt,
      detailUrl: `/jobs/${result.jobId}/ssr`,
      apiUrl: `/api/jobs/${result.jobId}`
    });
  } catch (err) {
    if (err instanceof CrawlAlreadyRunningError) {
      return next(new ConflictError(err.message));
    }
    if (err instanceof InvalidCrawlOptionsError) {
      return next(new BadRequestError(err.message));
    }
    next(new InternalServerError(err.message));
  }
});
```

**Lines of code:**
- Before: ~300 lines in route
- After: ~20 lines in route, ~250 lines in testable service

**Benefits:**
- ✅ Route is easy to understand
- ✅ Service can be unit tested without Express
- ✅ Service can be reused (CLI, background tasks, etc.)
- ✅ Clear separation of concerns
- ✅ Domain errors converted to HTTP errors at boundary

---

## Success Metrics

### Code Quality
- **Route handler size**: Target <50 lines per handler
- **Service test coverage**: Target >90% per service
- **Cyclomatic complexity**: Reduce by 40% in routes

### Maintainability
- **Logic duplication**: Eliminate duplicate code across routes
- **Dependency clarity**: All dependencies injected, not global
- **Documentation**: All services have complete JSDoc

### Performance
- **Zero regression**: All 662+ tests still pass
- **Response times**: No increase in API latency
- **Memory usage**: No increase in memory footprint

---

## Next Steps

1. **Review this document** with team/stakeholders
2. **Create first service** - CrawlOrchestrationService (example implementation)
3. **Refactor first route** - api.crawl.js using service
4. **Validate approach** - Run tests, measure improvements
5. **Continue with catalog** - Implement remaining Priority 1 services

---

*This architecture enables the codebase to scale, remain testable, and accelerate future development velocity.*
