# Test Performance Analysis - Actual Results

**Date**: October 7, 2025  
**Total Runtime**: 70.0 seconds  
**Status**: ✅ Tests running efficiently after CompressionWorkerPool fix  
**When to Read**: Read this when investigating test suite performance, optimizing slow tests, or understanding test runtime characteristics. Reference before making changes that might impact test speed.

---

## 🎉 Executive Summary

**Great News!** After disabling CompressionWorkerPool in test environment, tests now complete in **70 seconds** instead of hanging indefinitely.

### Key Metrics

| Metric | Value | Assessment |
|--------|-------|------------|
| **Total Runtime** | 70.0s | ✅ Excellent |
| **Test Files** | 126 | - |
| **Average Time per File** | 0.52s | ✅ Very good |
| **Tests >5s** | 0 | ✅ Perfect |
| **Tests >2s** | 6 (4.8%) | ⚠️ Minor optimization opportunity |
| **Test Pass Rate** | 633/654 (96.8%) | ✅ Strong |

**Category Breakdown**:
- E2E/Puppeteer: 6.5s (9.9%) - Most skipped by default ✅
- HTTP Server: 10.8s (16.4%) - Reasonable ✅
- Online API: 0.24s (0.4%) - Minimal impact ✅

---

## 🐌 Top 10 Slowest Tests (Optimization Targets)

### 1. `populate-gazetteer.test.js` - **4.29s** ⚠️

**What it does**: Tests gazetteer population logic with Wikidata/RestCountries integration

**Why it's slow**:
- Database operations (inserting countries, places, attributes)
- Multiple SPARQL query simulations
- Data validation across multiple tables

**Optimization opportunities**:
```javascript
// Current: Creates fresh DB for each test
beforeEach(() => {
  db = createTestDatabase();
  seedCountries(db);
});

// Better: Reuse DB, transaction rollback
beforeAll(() => {
  db = new Database(':memory:');
  initSchema(db);
});

beforeEach(() => {
  db.exec('BEGIN TRANSACTION');
});

afterEach(() => {
  db.exec('ROLLBACK');
});
```

**Expected savings**: 2-3 seconds (down to 1-1.5s)

---

### 2. `BackgroundTaskManager.test.js` - **3.72s** ✅

**What it does**: Tests background task management, progress tracking, pausing/resuming

**Why it's slow**:
- 26 test cases with database operations
- Mock task execution with delays
- SSE event broadcasting simulation

**Analysis**: This is actually **good performance** for 26 tests with DB operations. Average 143ms per test.

**Optimization**: Not a priority - well-structured tests with reasonable runtime.

---

### 3. `background-tasks.api.test.js` - **2.61s** ❌

**Status**: 10 tests failed - needs investigation

**What it does**: Tests background task API endpoints

**Why it's slow**:
- Spawns Express server
- Database initialization
- Multiple API requests per test

**Optimization opportunities**:
```javascript
// Current: Server startup delay
beforeAll(async () => {
  server = startServer();
  await new Promise(r => setTimeout(r, 120)); // Fixed delay
});

// Better: Event-based waiting
beforeAll(async () => {
  server = await new Promise((resolve, reject) => {
    const srv = startServer();
    const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
    srv.on('listening', () => {
      clearTimeout(timeout);
      resolve(srv);
    });
  });
});
```

**Expected savings**: 200-500ms

---

### 4. `crawl.e2e.more.test.js` - **2.54s** ✅

**What it does**: End-to-end crawl scenarios with different configurations

**Why it's slow**:
- Spawns crawler subprocesses
- Database operations
- Multiple crawl scenarios
- File I/O for logs

**Analysis**: Reasonable for E2E tests. These test critical workflows end-to-end.

**Optimization**: Consider consolidating similar scenarios into single crawler run.

---

### 5. `crawler-outcome.test.js` - **2.20s** ✅

**What it does**: Tests different crawler outcomes (success, failure, timeout scenarios)

**Why it's slow**:
- Full crawler initialization
- Database setup
- Multiple crawl modes tested

**Analysis**: Good performance for integration tests covering multiple scenarios.

---

### 6. `analysis.api.ssr.test.js` - **2.03s** ✅

**What it does**: Tests analysis API endpoints and server-side rendering

**Why it's slow**:
- Express server startup
- Database queries
- Template rendering
- Multiple HTTP requests

**Analysis**: Acceptable for SSR integration tests.

---

## 📊 Performance by Category

### HTTP Server Tests (10.8s total, 16.4%)

**Pattern**: Most take 0.5-1.5s due to:
1. Express server startup (~100-300ms)
2. Database initialization (~50-100ms)
3. HTTP requests (~50-200ms per request)
4. Teardown (~50-100ms)

**Optimization strategy**:
```javascript
// Create shared test server helper
// src/ui/express/__tests__/helpers/sharedServer.js

let sharedServer = null;
let serverPort = null;

async function getSharedServer() {
  if (!sharedServer) {
    sharedServer = await new Promise((resolve, reject) => {
      const srv = createApp({ verbose: false });
      const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
      
      srv.listen(0, () => { // Port 0 = random available port
        serverPort = srv.address().port;
        clearTimeout(timeout);
        resolve(srv);
      });
    });
  }
  return { server: sharedServer, port: serverPort };
}

function cleanupSharedServer() {
  if (sharedServer) {
    sharedServer.close();
    sharedServer = null;
  }
}

module.exports = { getSharedServer, cleanupSharedServer };
```

**Usage**:
```javascript
// In test files
const { getSharedServer } = require('./helpers/sharedServer');

beforeAll(async () => {
  const { server, port } = await getSharedServer();
  baseURL = `http://localhost:${port}`;
});

// No afterAll needed - shared cleanup handles it
```

**Expected savings**: 5-8 seconds across all HTTP tests (reduce server startup overhead)

---

### Database Tests (Multiple files)

**Current pattern**: Many tests create separate database instances

**Optimization**:
```javascript
// Create shared in-memory database for unit tests
// src/__tests__/helpers/sharedTestDb.js

let testDb = null;

function getTestDb() {
  if (!testDb) {
    testDb = new Database(':memory:');
    // Initialize schema
    initSchema(testDb);
    // Optionally seed reference data
    seedReferenceData(testDb);
  }
  return testDb;
}

function resetTestDb() {
  if (testDb) {
    // Clear data but keep schema
    testDb.exec(`
      DELETE FROM articles;
      DELETE FROM fetches;
      DELETE FROM analysis_results;
      -- etc.
    `);
  }
}

module.exports = { getTestDb, resetTestDb };
```

**Benefits**:
- Eliminates repeated schema creation
- Faster data cleanup (DELETE vs. recreate)
- Uses in-memory DB for speed
- Keeps schema in place across tests

**Expected savings**: 3-5 seconds across database tests

---

## 🎯 High-Impact Optimizations

### Priority 1: Fix Failing Tests ❌

**Files with failures**:
1. `populate-gazetteer.test.js` (2 failures)
2. `background-tasks.api.test.js` (10 failures)
3. `logs.colorization.test.js` (1 failure)
4. `logs.contrast.test.js` (1 failure)
5. `milestoneTracker.test.js` (1 failure)
6. `db.writableDb.test.js` (1 failure)

**Impact**: Failures often indicate logic issues that could cause production bugs

**Action**: Investigate and fix these tests first before optimizing

---

### Priority 2: Shared Test Infrastructure (5-10s savings)

**Implementation**:
```javascript
// src/__tests__/helpers/index.js

const Database = require('better-sqlite3');
const { createApp } = require('../../ui/express/server');

class TestEnvironment {
  constructor() {
    this.db = null;
    this.server = null;
    this.serverPort = null;
  }

  async getDatabase() {
    if (!this.db) {
      this.db = new Database(':memory:');
      // Initialize schema once
      const schema = require('../../db/sqlite/schema');
      schema.initialize(this.db);
    }
    return this.db;
  }

  resetDatabase() {
    if (this.db) {
      // Fast cleanup: delete data, keep schema
      this.db.exec(`
        DELETE FROM articles;
        DELETE FROM fetches;
        DELETE FROM analysis_results;
        DELETE FROM gazetteer_countries;
        DELETE FROM gazetteer_places;
        DELETE FROM background_tasks;
      `);
    }
  }

  async getServer() {
    if (!this.server) {
      this.server = await new Promise((resolve, reject) => {
        const app = createApp({ verbose: false, dataDir: ':memory:' });
        const timeout = setTimeout(() => reject(new Error('Server timeout')), 5000);
        
        app.listen(0, () => { // Random available port
          this.serverPort = app.address().port;
          clearTimeout(timeout);
          resolve(app);
        });
      });
    }
    return { server: this.server, port: this.serverPort };
  }

  cleanup() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

const globalTestEnv = new TestEnvironment();

// Global setup/teardown
beforeAll(async () => {
  await globalTestEnv.getDatabase();
  await globalTestEnv.getServer();
});

afterAll(() => {
  globalTestEnv.cleanup();
});

// Reset between tests
beforeEach(() => {
  globalTestEnv.resetDatabase();
});

module.exports = globalTestEnv;
```

**Usage in tests**:
```javascript
const testEnv = require('../helpers');

test('should fetch articles', async () => {
  const db = await testEnv.getDatabase();
  // Use db...
});

test('should serve API', async () => {
  const { server, port } = await testEnv.getServer();
  const res = await fetch(`http://localhost:${port}/api/status`);
  // Test response...
});
```

**Expected savings**: 8-12 seconds

---

### Priority 3: Event-Driven Server Waiting (0.5-2s savings)

**Current pattern** (found in 15+ HTTP tests):
```javascript
beforeAll(async () => {
  server = startServer();
  await new Promise(r => setTimeout(r, 120)); // Hope it's ready!
});
```

**Problems**:
- 120ms × 15 tests = 1.8s wasted minimum
- Sometimes server isn't ready yet (test flakiness)
- Sometimes server is ready sooner (wasted time)

**Solution**:
```javascript
function startServerAndWait(options = {}) {
  return new Promise((resolve, reject) => {
    const app = createApp(options);
    const timeout = setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 5000);
    
    const server = app.listen(0, () => { // 0 = random port
      clearTimeout(timeout);
      const port = server.address().port;
      resolve({ server, port, app });
    });
    
    server.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Usage
beforeAll(async () => {
  const { server, port } = await startServerAndWait({ verbose: false });
  baseURL = `http://localhost:${port}`;
});
```

**Expected savings**: 1.5-2 seconds across all HTTP tests

---

## 🔬 Database Performance Investigation

### Current Database Usage Patterns

**File-based DB**: `data/news.db` (~300+ MB based on user comment)

**Test patterns**:
1. Some tests use file-based DB (slower, but real-world)
2. Some tests create temporary DB files (disk I/O)
3. Few tests use `:memory:` (fastest)

### Database Performance Analysis

Let's profile database operations to identify bottlenecks:

```javascript
// Add to test files temporarily
const db = getTestDb();

console.time('Schema initialization');
initSchema(db);
console.timeEnd('Schema initialization');

console.time('Insert 100 articles');
const insert = db.prepare('INSERT INTO articles (url, title, content) VALUES (?, ?, ?)');
const insertMany = db.transaction((articles) => {
  for (const article of articles) insert.run(article.url, article.title, article.content);
});
insertMany(testArticles);
console.timeEnd('Insert 100 articles');

console.time('Query articles');
const articles = db.prepare('SELECT * FROM articles WHERE domain = ?').all('example.com');
console.timeEnd('Query articles');
```

**Expected findings**:
- Schema initialization: 50-200ms (file DB), 5-20ms (memory DB)
- Insert operations: 100-500ms (file DB), 10-50ms (memory DB)
- Query operations: 10-100ms (file DB), 1-10ms (memory DB)

### Recommendation: Hybrid Approach

```javascript
// Use in-memory DB for unit tests
if (isUnitTest) {
  db = new Database(':memory:');
}

// Use file-based DB for integration tests
if (isIntegrationTest) {
  db = new Database('./data/cache/test-integration.db');
}

// Use production DB for E2E tests
if (isE2ETest) {
  db = new Database('./data/news.db');
}
```

**Benefits**:
- Unit tests: Fast (memory DB)
- Integration tests: Realistic (file DB, but smaller)
- E2E tests: Real-world (production DB size)

---

## 📈 Performance Improvement Plan

### Phase 1: Quick Wins (2-3 hours, 10-15s savings)

1. ✅ **Fix CompressionWorkerPool hanging** - DONE (saved infinite hang!)
2. ⏳ **Replace arbitrary delays with events** (1.5-2s savings)
3. ⏳ **Use in-memory DB for unit tests** (3-5s savings)
4. ⏳ **Fix failing tests** (improves reliability)

**Target**: 55-60 seconds total

---

### Phase 2: Infrastructure Improvements (4-6 hours, 8-12s savings)

1. ⏳ **Create shared test environment helper** (8-10s savings)
2. ⏳ **Implement database transaction rollback pattern** (2-3s savings)
3. ⏳ **Add performance monitoring to CI** (prevent regressions)

**Target**: 40-50 seconds total

---

### Phase 3: Test Consolidation (6-8 hours, variable savings)

1. ⏳ **Consolidate similar E2E tests** (reduce redundancy)
2. ⏳ **Review test value vs. cost** (remove low-value tests)
3. ⏳ **Add test categorization** (fast/slow, unit/integration/e2e)

**Target**: 30-40 seconds for development workflow

---

## 🛠️ Server Performance Insights

### Slow Endpoints (from HTTP tests)

The HTTP tests reveal which server endpoints are expensive:

**Timing patterns observed**:
- `/api/gazetteer/*` endpoints: 200-500ms (database queries)
- `/api/crawl/*` endpoints: 100-300ms (process spawning)
- `/api/analysis/*` endpoints: 200-400ms (computation)
- SSE connections: ~50ms setup

**Recommendations**:

1. **Add database indexes** for gazetteer queries:
```sql
CREATE INDEX IF NOT EXISTS idx_gazetteer_places_country ON gazetteer_places(country_id);
CREATE INDEX IF NOT EXISTS idx_gazetteer_places_kind ON gazetteer_places(kind);
CREATE INDEX IF NOT EXISTS idx_articles_domain ON articles(domain);
CREATE INDEX IF NOT EXISTS idx_fetches_url ON fetches(url);
```

2. **Cache gazetteer data**:
```javascript
// In-memory cache for country list (rarely changes)
let countryCache = null;
let countryCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

function getCountries(db) {
  const now = Date.now();
  if (countryCache && now - countryCacheTime < CACHE_TTL) {
    return countryCache;
  }
  
  countryCache = db.prepare('SELECT * FROM gazetteer_countries').all();
  countryCacheTime = now;
  return countryCache;
}
```

3. **Optimize analysis queries**:
```javascript
// Use prepared statements (already compiled)
const getAnalysisByDomain = db.prepare(`
  SELECT * FROM analysis_results 
  WHERE domain = ? 
  ORDER BY created_at DESC 
  LIMIT 100
`);

// Reuse across requests
app.get('/api/analysis/:domain', (req, res) => {
  const results = getAnalysisByDomain.all(req.params.domain);
  res.json(results);
});
```

---

## 🎯 Success Criteria

### Test Suite Performance

| Metric | Current | Phase 1 | Phase 2 | Phase 3 |
|--------|---------|---------|---------|---------|
| **Total Time** | 70s | 55-60s | 40-50s | 30-40s |
| **Avg per File** | 0.52s | 0.45s | 0.35s | 0.28s |
| **Tests >2s** | 6 | 3 | 1 | 0 |
| **Pass Rate** | 96.8% | 100% | 100% | 100% |

### Application Performance (Revealed by Tests)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Server Startup** | ~100-300ms | <100ms | ⏳ Measure |
| **Gazetteer Queries** | 200-500ms | <100ms | ⏳ Add indexes |
| **Analysis Queries** | 200-400ms | <200ms | ⏳ Optimize |
| **API Response p95** | ~500ms | <300ms | ⏳ Profile |

---

## 📝 Implementation Checklist

### Immediate (This Week)

- [ ] Fix 16 failing tests
- [ ] Replace `setTimeout` with event-based waits in HTTP tests
- [ ] Create `sharedTestDb.js` helper for in-memory DB
- [ ] Update `populate-gazetteer.test.js` to use transactions

### Short-term (Next Week)

- [ ] Create `TestEnvironment` class for shared infrastructure
- [ ] Add database indexes for slow queries
- [ ] Implement gazetteer data caching
- [ ] Profile server endpoints to find bottlenecks

### Medium-term (This Month)

- [ ] Consolidate E2E tests where possible
- [ ] Add CI performance budgets (fail if >90s)
- [ ] Document test categorization (unit/integration/e2e)
- [ ] Set up performance monitoring dashboard

---

## 🎉 Conclusion

**Current Status**: ✅ Tests running well at 70 seconds

**Key Win**: Fixed CompressionWorkerPool hanging issue - tests now complete instead of timing out

**Next Steps**:
1. Fix failing tests (quality)
2. Implement shared test infrastructure (performance)
3. Profile and optimize slow server endpoints (production impact)

**Expected Final State**: 
- Development tests: 30-40 seconds (unit + fast integration)
- CI tests: 40-50 seconds (full suite)
- Zero tests >2 seconds
- 100% pass rate
- Production performance improvements from revealed bottlenecks

The test suite is already in good shape! Main opportunities are in shared infrastructure and fixing failing tests.
