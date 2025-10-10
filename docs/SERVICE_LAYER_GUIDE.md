# Service Layer Architecture Guide

**When to Read**: Read this when adding new services, understanding the service architecture, refactoring route handlers, or working with dependency injection patterns.

---

## Overview

This project uses a **service layer architecture** to separate business logic from HTTP route handlers and UI concerns. Services are classes that encapsulate specific domains of functionality and are wired together through **dependency injection**.

**Key Benefits**:
- ✅ **Testability**: Services can be tested independently with mocked dependencies
- ✅ **Reusability**: Same service can be used by HTTP routes, WebSocket handlers, background tasks
- ✅ **Maintainability**: Business logic lives in one place, not scattered across routes
- ✅ **Type Safety**: Constructor validation ensures required dependencies are provided

---

## Core Service Types

### 1. Core Services (Lifecycle Management)

**Purpose**: Manage the complete lifecycle of crawl jobs from start to finish.

#### CrawlOrchestrationService

**File**: `src/ui/express/services/core/CrawlOrchestrationService.js`

**Responsibilities**:
- Validate crawl can be started (no duplicates, valid options)
- Build and enhance crawl arguments
- Start child process using runner
- Create job descriptor with initial state
- Register job in JobRegistry
- Record job start in database
- Setup event handlers for process output
- Coordinate with broadcaster for SSE updates

**Dependencies** (constructor injection):
```javascript
{
  jobRegistry,           // JobRegistry - state management
  runner,                // Process runner with start() method
  buildArgs,             // Function to build CLI arguments
  urlsDbPath,            // String - path to URLs database
  getDbRW,               // Function - database getter
  recordJobStart,        // Function - record job start in DB
  eventHandler,          // JobEventHandlerService - process events
  broadcastJobs,         // Function - broadcast job list updates
  QUIET                  // Boolean - quiet mode flag (optional)
}
```

**Key Methods**:
- `startCrawl(options)` - Start a new crawl job (async, schedules start for next tick)
- Returns: `{ jobId, process, startedAt, args, url }`

**Usage Example**:
```javascript
const orchestrator = new CrawlOrchestrationService({
  jobRegistry,
  runner,
  buildArgs,
  urlsDbPath,
  getDbRW,
  recordJobStart,
  eventHandler,
  broadcastJobs,
  QUIET: false
});

const result = await orchestrator.startCrawl({
  url: 'https://example.com',
  depth: 2,
  maxPages: 100,
  intelligent: true
});
// result: { jobId: 'abc123', process: ChildProcess, startedAt: 1728556800000, ... }
```

**Error Handling**:
- Throws `CrawlAlreadyRunningError` if crawler already running (unless multi-job allowed)
- Throws `InvalidCrawlOptionsError` if options are invalid

---

#### JobEventHandlerService

**File**: `src/ui/express/services/core/JobEventHandlerService.js`

**Responsibilities**:
- Attach stdout/stderr/exit event handlers to child processes
- Parse structured output (PROGRESS, MILESTONE, TELEMETRY, PROBLEM, QUEUE)
- Update job state in JobRegistry
- Broadcast SSE events to connected clients
- Handle process completion and cleanup

**Dependencies**:
```javascript
{
  jobRegistry,           // JobRegistry - state management
  realtime,              // RealtimeBroadcaster - SSE broadcasting
  crawlerManager,        // IntelligentCrawlerManager - achievement tracking
  getDbRW,               // Function - database getter
  recordJobCompletion,   // Function - record completion in DB
  QUIET                  // Boolean - quiet mode flag (optional)
}
```

**Key Methods**:
- `attachEventHandlers(jobId, childProcess)` - Setup all event handlers
- `_handleStructuredOutput(jobId, line, kind)` - Parse and dispatch structured output
- `_handleExit(jobId, code, signal)` - Handle process exit and cleanup

**Structured Output Formats**:
```
PROGRESS|{"percent":50,"current":500,"total":1000,"message":"Crawling..."}
MILESTONE|{"kind":"discovery","message":"Found sitemap","details":{...}}
TELEMETRY|{"kind":"performance","value":1234,"unit":"ms"}
PROBLEM|{"kind":"network-error","message":"Timeout","details":{...}}
QUEUE|{"operation":"enqueue","url":"https://...", "depth":1}
```

---

### 2. Control Services (Job Management)

#### JobControlService

**File**: `src/ui/express/services/control/JobControlService.js`

**Responsibilities**:
- Pause/resume/stop running jobs
- Validate job selection (handle multiple jobs, ambiguous requests)
- Issue control commands via JobRegistry (SIGTERM → SIGKILL escalation for stop, stdin commands for pause/resume)
- Update job state in JobRegistry
- Provide consistent error responses

**Dependencies**:
```javascript
{
  jobRegistry            // JobRegistry - job state management
}
```

**Key Methods**:
- `stopJob({ jobId })` - Stop a job (SIGTERM, escalates to SIGKILL after 5s)
  - Returns: `{ ok, job, escalatesInMs }` or `{ ok: false, error, message }`
- `pauseJob({ jobId })` - Pause a job (writes `PAUSE\n` to crawler stdin)
  - Returns: `{ ok, job, paused: true }` or `{ ok: false, error, message }`
- `resumeJob({ jobId })` - Resume a paused job (writes `RESUME\n` to crawler stdin)
  - Returns: `{ ok, job, paused: false }` or `{ ok: false, error, message }`

**Error Codes**:
- `not-running` - No jobs currently running
- `ambiguous` - Multiple jobs running, jobId required
- `not-found` - Specified job not found
- `no-process` - Job found but no child process attached

**Usage Example**:
```javascript
const controlService = new JobControlService({ jobRegistry });

// Stop specific job
const result = await controlService.stopJob({ jobId: 'abc123' });
if (result.ok) {
  console.log(`Stopped job ${result.job.id}, SIGKILL in ${result.escalatesInMs}ms`);
} else {
  console.error(`Error: ${result.error} - ${result.message}`);
}

// Pause job (auto-selects if only one running)
const pauseResult = await controlService.pauseJob({ jobId: null });
```

---

### 3. Intelligence & Tracking Services

#### IntelligentCrawlerManager

**File**: `src/ui/express/services/IntelligentCrawlerManager.js`

**Responsibilities**:
- Track job lifecycle (start, end, duration)
- Record milestones (discovery, page count thresholds, errors)
- Collect achievements (first sitemap, 100 pages, domain coverage)
- Build enhanced job summaries with achievements
- Provide job analytics and metrics

**Dependencies**:
```javascript
{
  baseSummaryFn,         // Function - base summary builder (optional)
  achievementsLimit      // Number - max achievements per job (default: 12)
}
```

**Key Methods**:
- `setJobRegistry(jobRegistry)` - Wire up the job registry
- `buildJobsSummary(jobs)` - Enhance job list with achievements and lifecycle data
- `recordMilestone(jobId, milestone)` - Record a milestone event
- `getRecentAchievements(jobId)` - Get recent achievements for a job
- `recordJobEnd(jobId)` - Record job completion and calculate duration

**Milestone Categories**:
- `discovery` - Found sitemap, robots.txt, RSS feed
- `threshold` - Reached page count milestone (100, 500, 1000, etc.)
- `coverage` - Domain coverage achievements
- `error` - Significant errors or problems
- `completion` - Job finished successfully

**Usage Example**:
```javascript
const crawlerManager = new IntelligentCrawlerManager({
  baseSummaryFn: (jobs) => ({ count: jobs.length, items: jobs }),
  achievementsLimit: 12
});

crawlerManager.setJobRegistry(jobRegistry);

// Record milestone from structured output
crawlerManager.recordMilestone('abc123', {
  kind: 'discovery',
  message: 'Found sitemap',
  details: { url: 'https://example.com/sitemap.xml' }
});

// Get enhanced summary
const summary = crawlerManager.buildJobsSummary([job1, job2]);
// summary.items[0].achievements: [{ kind: 'discovery', message: '...', timestamp: ... }]
// summary.items[0].lifecycle: { startedAt: ..., endedAt: ..., durationMs: ... }
```

---

### 4. State Management Services

#### JobRegistry

**File**: `src/ui/express/services/jobRegistry.js`

**Responsibilities**:
- Maintain active job state (Map<jobId, job>)
- Enforce single-job vs multi-job mode
- Track paused state
- Generate job summaries
- Provide job lookup and filtering

**Constructor Options**:
```javascript
{
  allowMultiJobs,        // Boolean - allow concurrent jobs
  guardWindowMs,         // Number - cooldown between jobs (ms)
  summaryFn              // Function - custom summary builder
}
```

**Key Methods**:
- `registerJob(job)` - Add job to registry
- `unregisterJob(jobId)` - Remove completed job
- `getJob(jobId)` - Get specific job
- `getJobs()` - Get all jobs (array)
- `jobCount()` - Count active jobs
- `isPaused()` - Check if any job is paused
- `getCrawlState()` - Get overall crawl state

**Job Object Structure**:
```javascript
{
  id: 'abc123',              // Unique job ID
  url: 'https://...',        // Primary URL
  process: ChildProcess,     // Node.js child process
  startedAt: 1728556800000,  // Unix timestamp (ms)
  status: 'running',         // 'running' | 'paused' | 'completed' | 'failed'
  paused: false,             // Pause state
  args: [...],               // CLI arguments
  domain: 'example.com',     // Extracted domain
  mode: 'intelligent',       // Crawl mode
  // ... additional fields
}
```

---

### 5. Broadcasting & Real-time Services

#### RealtimeBroadcaster

**File**: `src/ui/express/services/realtimeBroadcaster.js`

**Responsibilities**:
- Manage SSE client connections
- Broadcast events to all connected clients
- Rate-limit log messages
- Track progress and telemetry
- Format metrics for UI

**Constructor Options**:
```javascript
{
  jobRegistry,           // JobRegistry - job state
  logsMaxPerSec,         // Number - max log messages per second (default: 200)
  logLineMaxChars        // Number - max characters per log line (default: 8192)
}
```

**Key Methods**:
- `broadcast(event, data)` - Send event to all SSE clients
- `broadcastJobs(force)` - Broadcast current job list
- `getBroadcastProgress()` - Get progress broadcaster function
- `getBroadcastTelemetry()` - Get telemetry broadcaster function
- `getSseClients()` - Get SSE client list (for route handlers)

**Event Types**:
```javascript
// Job list update
broadcast('jobs', { jobs: [...] });

// Progress update
broadcast('progress', { jobId: '...', percent: 50, current: 500, total: 1000 });

// Telemetry event
broadcast('telemetry', { jobId: '...', kind: 'performance', value: 1234 });

// Log message
broadcast('log', { jobId: '...', message: 'Crawling page...', level: 'info' });

// Milestone
broadcast('milestone', { jobId: '...', kind: 'discovery', message: '...' });
```

---

## Dependency Injection Pattern

### Why Dependency Injection?

**Problems it solves**:
- Hard to test (can't mock dependencies)
- Tight coupling (can't swap implementations)
- Hard to reason about (dependencies hidden in code)
- Difficult to refactor (change ripples through codebase)

**DI Solution**:
- Dependencies passed via constructor
- Explicit dependency graph
- Easy to mock for testing
- Single responsibility (class doesn't create its dependencies)

### Constructor Validation Pattern

All services validate their dependencies in the constructor:

```javascript
class MyService {
  constructor({ dependency1, dependency2, optionalDep = null }) {
    // CRITICAL: Validate required dependencies
    if (!dependency1) {
      throw new Error('MyService requires dependency1');
    }
    if (typeof dependency2 !== 'function') {
      throw new Error('MyService requires dependency2 function');
    }
    
    // Store dependencies
    this.dependency1 = dependency1;
    this.dependency2 = dependency2;
    this.optionalDep = optionalDep;
  }
}
```

**Why validate?**:
- Fail fast at construction time (not during method call)
- Clear error messages
- Documents required dependencies
- Prevents subtle runtime bugs

### Wiring Services in server.js

Services are instantiated in dependency order in `createApp()`:

```javascript
// 1. Create foundational services (no dependencies)
const jobRegistry = new JobRegistry({
  allowMultiJobs,
  guardWindowMs: options.guardWindowMs,
  summaryFn: (jobs) => crawlerManager.buildJobsSummary(jobs)
});

const crawlerManager = new IntelligentCrawlerManager({
  baseSummaryFn: (jobs) => ({ count: jobs.length, items: jobs })
});

// 2. Wire bidirectional dependencies
crawlerManager.setJobRegistry(jobRegistry);

// 3. Create broadcasting layer
const realtime = new RealtimeBroadcaster({
  jobRegistry,
  logsMaxPerSec: 200,
  logLineMaxChars: 8192
});

// 4. Create event handler (depends on multiple services)
const eventHandler = new JobEventHandlerService({
  jobRegistry,
  realtime,
  crawlerManager,
  getDbRW,
  recordJobCompletion,
  QUIET: false
});

// 5. Create orchestration layer (top-level service)
const orchestrator = new CrawlOrchestrationService({
  jobRegistry,
  runner,
  buildArgs,
  urlsDbPath,
  getDbRW,
  recordJobStart,
  eventHandler,
  broadcastJobs: () => realtime.broadcastJobs(),
  QUIET: false
});

// 6. Attach to app.locals for route handlers
app.locals.orchestrator = orchestrator;
app.locals.jobRegistry = jobRegistry;
app.locals.controlService = new JobControlService({ jobRegistry });
```

**Dependency Graph**:
```
JobRegistry ←──┐
    ↓          │
IntelligentCrawlerManager ──┘
    ↓
RealtimeBroadcaster
    ↓
JobEventHandlerService
    ↓
CrawlOrchestrationService
```

---

## Testing Services

### Unit Testing Pattern

**Goal**: Test service logic in isolation with mocked dependencies.

```javascript
// src/ui/express/services/__tests__/JobControlService.test.js
const { JobControlService } = require('../control/JobControlService');

describe('JobControlService', () => {
  let service;
  let mockJobRegistry;
  
  beforeEach(() => {
    // Create mock dependencies
    mockJobRegistry = {
      jobCount: jest.fn(() => 1),
      getJob: jest.fn((id) => ({
        id,
        process: { kill: jest.fn() },
        paused: false
      })),
      setPaused: jest.fn()
    };
    
    // Inject mocks into service
    service = new JobControlService({ jobRegistry: mockJobRegistry });
  });
  
  test('stopJob sends SIGTERM to process', async () => {
    const result = await service.stopJob({ jobId: 'abc123' });
    
    expect(result.ok).toBe(true);
    expect(mockJobRegistry.getJob).toHaveBeenCalledWith('abc123');
    expect(result.job.process.kill).toHaveBeenCalledWith('SIGTERM');
  });
  
  test('stopJob returns error if no jobs running', async () => {
    mockJobRegistry.jobCount.mockReturnValue(0);
    
    const result = await service.stopJob({ jobId: null });
    
    expect(result.ok).toBe(false);
    expect(result.error).toBe('not-running');
  });
});
```

### Integration Testing Pattern

**Goal**: Test service with real dependencies to verify integration.

```javascript
// src/ui/express/services/__tests__/CrawlOrchestrationService.integration.test.js
const { createApp } = require('../../server');
const { createTempDb } = require('../../../test-helpers/db');

describe('CrawlOrchestrationService Integration', () => {
  let app;
  let orchestrator;
  
  beforeEach(() => {
    app = createApp({ dbPath: createTempDb(), verbose: false });
    orchestrator = app.locals.orchestrator;
  });
  
  afterEach(() => {
    // Clean up resources
    if (app.locals.backgroundTaskManager) {
      await app.locals.backgroundTaskManager.shutdown();
    }
  });
  
  test('startCrawl creates job and registers in registry', async () => {
    const result = await orchestrator.startCrawl({
      url: 'https://example.com',
      maxPages: 10
    });
    
    expect(result.jobId).toBeDefined();
    expect(result.process).toBeDefined();
    
    const job = app.locals.jobRegistry.getJob(result.jobId);
    expect(job).toBeDefined();
    expect(job.url).toBe('https://example.com');
  });
});
```

### Testing Checklist

✅ **Constructor Validation**:
- Test that constructor throws on missing required dependencies
- Test that constructor accepts optional dependencies

✅ **Happy Path**:
- Test primary methods with valid inputs
- Verify expected return values
- Check state changes in dependencies

✅ **Error Cases**:
- Test invalid inputs
- Test error conditions (job not found, process missing, etc.)
- Verify error codes and messages

✅ **Integration**:
- Test service with real dependencies
- Verify database writes
- Check SSE broadcasts
- Validate child process spawning

---

## Adding a New Service

### Step-by-Step Guide

**1. Identify Service Responsibility**

Ask:
- What specific domain does this service handle?
- What business logic is it extracting from routes?
- What state does it manage or coordinate?

**2. Design Service Interface**

Define:
- Constructor dependencies (what does it need?)
- Public methods (what operations does it provide?)
- Return types (what does it promise?)
- Error conditions (how does it fail?)

**3. Create Service File**

```javascript
// src/ui/express/services/MyNewService.js

/**
 * MyNewService - Brief description of responsibility
 * 
 * Detailed explanation of what this service does,
 * what problems it solves, and how it fits into the architecture.
 * 
 * @module services/MyNewService
 */

class MyNewService {
  /**
   * @param {Object} options - Configuration options
   * @param {Object} options.dependency1 - Description
   * @param {Function} options.dependency2 - Description
   * @param {string} [options.optionalDep] - Optional description
   * @throws {Error} If required dependencies missing
   */
  constructor({ dependency1, dependency2, optionalDep = null }) {
    // Validate required dependencies
    if (!dependency1) {
      throw new Error('MyNewService requires dependency1');
    }
    if (typeof dependency2 !== 'function') {
      throw new Error('MyNewService requires dependency2 function');
    }
    
    this.dependency1 = dependency1;
    this.dependency2 = dependency2;
    this.optionalDep = optionalDep;
  }
  
  /**
   * Primary method description
   * 
   * @param {Object} options - Method options
   * @returns {Promise<Object>} Result object
   * @throws {ServiceError} If operation fails
   */
  async doSomething(options) {
    // Implementation
  }
}

module.exports = { MyNewService };
```

**4. Write Tests**

Create `__tests__/MyNewService.test.js` with:
- Constructor validation tests
- Method unit tests with mocks
- Error handling tests

**5. Wire into server.js**

Add to `createApp()` in dependency order:

```javascript
// Import at top
const { MyNewService } = require('./services/MyNewService');

// In createApp() function, after dependencies are ready
const myService = new MyNewService({
  dependency1: existingService,
  dependency2: someFunction,
  optionalDep: options.myOption
});

// Attach to app.locals for route access
app.locals.myService = myService;
```

**6. Use in Routes**

```javascript
// In route handler
router.post('/api/my-endpoint', async (req, res) => {
  const { myService } = req.app.locals;
  
  try {
    const result = await myService.doSomething(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

---

## Service Design Principles

### Single Responsibility

Each service should have ONE clear responsibility:

✅ **Good**:
- `JobControlService` - Controls job lifecycle (pause/resume/stop)
- `CrawlOrchestrationService` - Orchestrates crawl job startup
- `IntelligentCrawlerManager` - Tracks achievements and metrics

❌ **Bad**:
- `JobService` - Does everything related to jobs (too broad)
- `ControlAndMetrics` - Two unrelated concerns

### Stateless Where Possible

Services should be stateless - state lives in:
- `JobRegistry` (active job state)
- `Database` (persistent state)
- `RealtimeBroadcaster` (SSE client connections)

✅ **Good**:
```javascript
class JobControlService {
  constructor({ jobRegistry }) {
    this.jobRegistry = jobRegistry; // Reference to state, not state itself
  }
  
  stopJob({ jobId }) {
    const job = this.jobRegistry.getJob(jobId); // Get state from registry
    job.process.kill('SIGTERM');
  }
}
```

❌ **Bad**:
```javascript
class JobControlService {
  constructor() {
    this.jobs = new Map(); // Service owns state - hard to coordinate
  }
}
```

### Explicit Dependencies

Dependencies should be:
- Passed via constructor (not created internally)
- Validated at construction time
- Documented in JSDoc comments

### Consistent Error Handling

Use result objects for expected failures:

```javascript
// ✅ Good: Result object pattern
{
  ok: false,
  error: 'not-found',
  message: 'Job not found'
}

// ✅ Good: Throw for unexpected failures
throw new Error('Database connection failed');

// ❌ Bad: Return null/undefined
return null; // What does this mean? Not found? Error? Success with no data?
```

### Testability First

Design services to be easy to test:
- Inject dependencies (don't use `require()` inside methods)
- Avoid side effects in constructors
- Return values that can be asserted
- Use interfaces over concrete implementations

---

## Common Patterns

### Event Handler Attachment

Services that handle events should attach handlers, not store them:

```javascript
class JobEventHandlerService {
  attachEventHandlers(jobId, childProcess) {
    childProcess.stdout.on('data', (data) => this._handleStdout(jobId, data));
    childProcess.stderr.on('data', (data) => this._handleStderr(jobId, data));
    childProcess.on('exit', (code, signal) => this._handleExit(jobId, code, signal));
  }
}
```

### Structured Output Parsing

Parse structured output from child processes:

```javascript
_handleStructuredOutput(jobId, line, kind) {
  const [prefix, jsonStr] = line.split('|', 2);
  
  if (prefix === 'PROGRESS') {
    const data = JSON.parse(jsonStr);
    this.broadcastProgress(jobId, data);
  } else if (prefix === 'MILESTONE') {
    const data = JSON.parse(jsonStr);
    this.crawlerManager.recordMilestone(jobId, data);
  }
  // ... handle other types
}
```

### Broadcast Coordination

Services coordinate SSE broadcasts through RealtimeBroadcaster:

```javascript
class JobEventHandlerService {
  _handleProgress(jobId, data) {
    // Update state
    const job = this.jobRegistry.getJob(jobId);
    job.progress = data;
    
    // Broadcast to clients
    this.realtime.broadcast('progress', {
      jobId,
      percent: data.percent,
      message: data.message
    });
  }
}
```

---

## Migration from Monolithic Routes

### Before (Monolithic Route)

```javascript
// routes/api.crawl.js - Everything in route handler
router.post('/crawl', async (req, res) => {
  const { url, depth } = req.body;
  const { jobRegistry } = req.app.locals;
  
  // Validation logic
  if (!url) return res.status(400).json({ error: 'URL required' });
  if (jobRegistry.jobCount() > 0) {
    return res.status(409).json({ error: 'Crawl already running' });
  }
  
  // Build args logic
  const args = ['--url', url];
  if (depth) args.push('--depth', depth);
  
  // Process spawning logic
  const child = spawn('node', ['crawler.js', ...args]);
  
  // Event handler logic
  child.stdout.on('data', (data) => {
    // Parse and broadcast...
  });
  
  // Registry logic
  jobRegistry.registerJob({
    id: jobId,
    process: child,
    url
  });
  
  // Database logic
  const db = getDbRW();
  db.prepare('INSERT INTO crawl_jobs ...').run(...);
  
  res.json({ jobId });
});
```

**Problems**:
- 100+ lines of code in route handler
- Hard to test (requires HTTP server)
- Business logic mixed with HTTP concerns
- Can't reuse logic elsewhere

### After (Service-Based Route)

```javascript
// routes/api.crawl.js - Thin route handler
router.post('/crawl', async (req, res) => {
  const { orchestrator } = req.app.locals;
  
  try {
    const result = await orchestrator.startCrawl(req.body);
    res.json(result);
  } catch (error) {
    if (error instanceof CrawlAlreadyRunningError) {
      res.status(409).json({ error: error.message });
    } else if (error instanceof InvalidCrawlOptionsError) {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});
```

**Benefits**:
- 15 lines instead of 100+
- Business logic in service (testable without HTTP)
- Route handler only maps requests/responses
- Service reusable by WebSocket handlers, background tasks, etc.

---

## Service Catalog

### Core Services

| Service | File | Purpose |
|---------|------|---------|
| `CrawlOrchestrationService` | `services/core/CrawlOrchestrationService.js` | Orchestrate crawl job startup |
| `JobEventHandlerService` | `services/core/JobEventHandlerService.js` | Handle process events and structured output |

### Control Services

| Service | File | Purpose |
|---------|------|---------|
| `JobControlService` | `services/control/JobControlService.js` | Pause/resume/stop job operations |

### Intelligence Services

| Service | File | Purpose |
|---------|------|---------|
| `IntelligentCrawlerManager` | `services/IntelligentCrawlerManager.js` | Track achievements and lifecycle |

### State Management

| Service | File | Purpose |
|---------|------|---------|
| `JobRegistry` | `services/jobRegistry.js` | Manage active job state |
| `RealtimeBroadcaster` | `services/realtimeBroadcaster.js` | SSE broadcasting and metrics |

### Helper Services

| Service | File | Purpose |
|---------|------|---------|
| `AnalysisRunManager` | `services/AnalysisRunManager.js` | Manage analysis runs |
| `BenchmarkManager` | `services/benchmarkManager.js` | Performance benchmarking |
| `PlanningSessionManager` | `services/planningSessionManager.js` | GOFAI planning sessions |

---

## Next Steps

**For Developers**:
1. Read this guide when adding new services
2. Study existing services as examples
3. Write tests before implementation
4. Follow the dependency injection pattern
5. Validate constructor dependencies

**For Reviewers**:
1. Check services have single responsibility
2. Verify constructor validation
3. Ensure dependencies are injected
4. Confirm tests exist and pass
5. Review error handling patterns

**For Documentation**:
1. Update this guide when patterns evolve
2. Add new services to catalog
3. Document architectural decisions
4. Keep examples current

---

## Related Documentation

- **ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md** - Two-system architecture overview
- **SERVICE_LAYER_ARCHITECTURE.md** - Service extraction patterns and roadmap (1159 lines)
- **TESTING_ASYNC_CLEANUP_GUIDE.md** - Testing services with async cleanup
- **AGENTS.md** - "How to Get a Database Handle" section
- **docs/ARCHITECTURE_REFACTORING_NEWS_WEBSITES.md** - News website service refactor example

---

*Last Updated: October 10, 2025*
*Version: 1.0*
