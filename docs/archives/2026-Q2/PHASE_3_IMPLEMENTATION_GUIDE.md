# Phase 3 Implementation Guide: Service Layer

**When to Read**: This guide is for developers starting the service layer refactoring (Phase 3). Read this to understand the "why" and "how" of extracting business logic from Express routes into testable, reusable services. It provides the context for the first implemented service (`CrawlOrchestrationService`) and the roadmap for the rest.

**Status**: Ready for Implementation  
**Date**: October 7, 2025  
**Goal**: Extract business logic from routes into testable services

---

## What's Been Created

### 1. Architecture Documentation ✅

**File**: `docs/SERVICE_LAYER_ARCHITECTURE.md` (400+ lines)

**Contents**:
- **Architecture principles** - Separation of concerns, dependency injection, stateless design
- **4 service patterns** - Orchestration, Planning, Analytics, Event Handler
- **8 service designs** - Complete catalog with methods, dependencies, priorities
- **Implementation strategy** - 3-week plan with daily tasks
- **Testing strategy** - Unit test patterns, integration test examples
- **Before/After examples** - Shows 300-line route becoming 20-line controller

### 2. Domain Errors ✅

**File**: `src/ui/express/services/errors/ServiceErrors.js`

**Error Classes**:
1. `CrawlAlreadyRunningError` - Cannot start when already running
2. `InvalidCrawlOptionsError` - Bad options provided
3. `QueueNotFoundError` - Queue doesn't exist
4. `QueueNotResumableError` - Queue blocked (reasons array)
5. `JobNotFoundError` - Job doesn't exist
6. `InvalidJobStateError` - Invalid state transition
7. `DatabaseUnavailableError` - DB unavailable
8. `CapacityExceededError` - Too many jobs running

**Key Points**:
- These are **business errors**, not HTTP errors
- Routes convert to appropriate HTTP status codes
- Include metadata (field, queueId, reasons, etc.)
- Stack traces captured for debugging

### 3. First Service Implementation ✅

**File**: `src/ui/express/services/core/CrawlOrchestrationService.js` (240 lines)

**What It Does**:
Orchestrates starting a crawl job with 10 steps:
1. Validate can start
2. Build arguments
3. Reserve job ID
4. Enhance arguments (--db, --job-id)
5. Start child process
6. Create job descriptor
7. Register in registry
8. Record in database
9. Setup event handlers
10. Broadcast update

**Key Features**:
- **Stateless** - No instance state
- **Dependency injection** - All deps via constructor
- **Returns domain objects** - Not HTTP responses
- **Throws domain errors** - Routes convert to HTTP
- **Fully documented** - Complete JSDoc
- **Separated concerns** - Business logic, no HTTP

**Constructor Validation**:
```javascript
new CrawlOrchestrationService({
  jobRegistry,        // Required: Job state management
  runner,             // Required: Process starter
  buildArgs,          // Required: Options → CLI args
  urlsDbPath,         // Required: Database path
  getDbRW,            // Required: DB getter
  recordJobStart,     // Required: DB recording function
  eventHandler,       // Required: Event handler service
  broadcastJobs,      // Required: SSE broadcaster
  QUIET               // Optional: Logging flag
});
```

**Usage Example**:
```javascript
// In route handler
try {
  const crawlService = serviceFactory.getCrawlOrchestrationService();
  const result = await crawlService.startCrawl(req.body);
  
  res.status(202).json({
    jobId: result.jobId,
    url: result.url,
    startedAt: result.startedAt
  });
} catch (err) {
  if (err instanceof CrawlAlreadyRunningError) {
    return next(new ConflictError(err.message));
  }
  next(new InternalServerError(err.message));
}
```

### 4. Unit Tests ✅

**File**: `src/ui/express/services/core/__tests__/CrawlOrchestrationService.test.js` (400+ lines)

**Coverage**: 20+ test cases covering:
- Constructor validation (4 tests)
- Successful crawl start (1 test)
- Error conditions (2 tests)
- Argument enhancement (4 tests)
- Job registration (1 test)
- Database recording (2 tests)
- Event handlers (1 test)
- URL extraction (4 tests)
- Job descriptor creation (2 tests)
- Initial metrics (2 tests)

**Key Features**:
- **Fast** - No Express server, no real process
- **Isolated** - All dependencies mocked
- **Focused** - Tests business logic only
- **Easy to debug** - Clear assertions

**Example Test**:
```javascript
it('should throw CrawlAlreadyRunningError if crawler already running', () => {
  mockDependencies.jobRegistry.checkStartAllowed.mockReturnValue({
    ok: false,
    reason: 'Crawler already active'
  });

  expect(() => {
    service.startCrawl({ url: 'https://example.com' });
  }).toThrow(CrawlAlreadyRunningError);
});
```

---

## Architecture Benefits

### Before (Phase 2):
```javascript
// api.crawl.js - 300 lines of mixed concerns
router.post('/api/crawl', (req, res) => {
  // Validation logic
  const status = jobRegistry.checkStartAllowed();
  if (!status.ok) {
    return res.status(409).json({ error: 'Already running' });
  }
  
  // Argument building
  const args = buildArgs(req.body);
  const jobId = jobRegistry.reserveJobId();
  args.push(`--db=${urlsDbPath}`);
  args.push(`--job-id=${jobId}`);
  
  // Process management
  const child = runner.start(args);
  
  // Job creation (50 lines)
  const job = { /* ... */ };
  
  // Event handlers (100 lines)
  child.stdout.on('data', (chunk) => { /* ... */ });
  child.stderr.on('data', (chunk) => { /* ... */ });
  child.on('exit', (code, signal) => { /* ... */ });
  
  // Database recording
  const db = getDbRW();
  if (db) recordCrawlJobStart(db, { /* ... */ });
  
  // Response
  res.status(202).json({ jobId, url: job.url });
});
```

**Problems**:
- ❌ Can't test without Express server
- ❌ Business logic mixed with HTTP handling
- ❌ Hard to reuse (CLI, background tasks)
- ❌ Long, complex function
- ❌ Many responsibilities

### After (Phase 3):
```javascript
// api.crawl.js - 20 lines, thin controller
router.post('/api/crawl', async (req, res, next) => {
  try {
    const crawlService = req.services.getCrawlOrchestrationService();
    const result = await crawlService.startCrawl(req.body);
    
    res.status(202).json({
      jobId: result.jobId,
      url: result.url,
      startedAt: result.startedAt
    });
  } catch (err) {
    if (err instanceof CrawlAlreadyRunningError) {
      return next(new ConflictError(err.message));
    }
    next(new InternalServerError(err.message));
  }
});
```

**Benefits**:
- ✅ Easy to test (mock service)
- ✅ Clear separation (route orchestrates, service executes)
- ✅ Reusable (service works anywhere)
- ✅ Short, readable function
- ✅ Single responsibility

---

## Next Steps

### Immediate (This Week):

1. **Create JobEventHandlerService** ⏳
   - Extract event handling from api.crawl.js
   - Handle stdout, stderr, exit, error events
   - Parse PROGRESS and MILESTONE lines
   - Coordinate with broadcaster

2. **Refactor api.crawl.js** ⏳
   - Use CrawlOrchestrationService
   - Use JobEventHandlerService
   - Become thin controller (~20 lines)
   - Run tests (expect 662+ passing)

3. **Create QueuePlannerService** ⏳
   - Extract planning logic from api.resume-all.js
   - Implement business rules (domain conflicts, capacity, etc.)
   - Unit test planning algorithm
   - Refactor api.resume-all.js

### Short Term (Next 2 Weeks):

4. **Implement remaining Priority 1 services**
   - CrawlLifecycleService (pause/resume/stop)
   - CoverageAnalyticsService (metrics calculations)

5. **Create ServiceFactory**
   - Centralized service instantiation
   - Dependency injection container
   - Singleton pattern for shared services

6. **Update server.js**
   - Instantiate ServiceFactory
   - Attach to req.services middleware
   - All routes access via req.services

### Long Term (Next Month):

7. **Formalize existing services**
   - JobRegistryService (already exists, formalize API)
   - BroadcasterService (extract from routes)
   - ArgumentBuilderService (refactor buildArgs.js)

8. **Complete service catalog**
   - 8 services total
   - All routes become thin controllers
   - Full unit test coverage

---

## Success Metrics

### Code Quality
- **Route complexity**: From 300+ lines → <50 lines
- **Test coverage**: Services >90%, Routes >80%
- **Cyclomatic complexity**: Reduced by 40%+

### Development Velocity
- **Unit test speed**: Services test in <1s (no Express)
- **Integration test speed**: Routes test with mocked services
- **Debugging**: Clear separation makes issues easier to isolate

### Maintainability
- **Logic reuse**: Services work in routes, CLI, background tasks
- **Testability**: Pure business logic, easy to mock
- **Documentation**: All services have complete JSDoc

---

## Running the Tests

```bash
# Run service unit tests (fast)
npm run test:file "CrawlOrchestrationService"

# Run all service tests
npm run test:file "services"

# Run full test suite
npm test
```

**Expected Results**:
- CrawlOrchestrationService: 20+ tests passing in <100ms
- Full test suite: 662+ tests passing in ~70s
- Zero regressions

---

## Files Created

```
docs/
  └── SERVICE_LAYER_ARCHITECTURE.md       # 400+ line architecture doc

src/ui/express/services/
  ├── errors/
  │   └── ServiceErrors.js                # 8 domain error classes
  ├── core/
  │   ├── CrawlOrchestrationService.js    # First service implementation
  │   └── __tests__/
  │       └── CrawlOrchestrationService.test.js  # 20+ unit tests
  └── (future services...)
```

---

## Key Takeaways

1. **Services are stateless** - State lives in JobRegistry and Database
2. **Services throw domain errors** - Routes convert to HTTP errors
3. **Services are injectable** - All dependencies via constructor
4. **Services are testable** - Mock all dependencies, no Express
5. **Routes are thin** - Parse request, call service, format response

This architecture makes the codebase:
- **Faster to develop** - Clear patterns, easy to extend
- **Easier to test** - Services test in isolation
- **More maintainable** - Separation of concerns
- **More reliable** - Business logic in one place

---

*Phase 3 is now ready for implementation! The architecture is documented, the first service is implemented with tests, and the pattern is clear for rolling out the remaining services.*
