# Performance Investigation Guide

**When to Read**: When diagnosing slow queries, investigating memory leaks, optimizing database operations, or profiling system performance.

**Created**: October 7, 2025  
**Purpose**: Systematic investigation of test suite and application performance  
**Goal**: Reduce test time from 6-10 minutes to <2 minutes, identify production bottlenecks

---

## 🔍 Investigation Methodology

### Step 1: Capture Baseline Metrics

```bash
# Run full test suite with timing
npm test

# This now automatically:
# 1. Shows timing on screen during execution
# 2. Writes timestamped log file: test-timing-YYYY-MM-DDTHH-MM-SS-sssZ.log
# 3. Updates failure summary: test-failure-summary.json
# 4. Enables quick status via: node tests/get-test-summary.js --compact
```

**What to Look For**:
- Tests taking >10 seconds (very slow)
- Tests taking 5-10 seconds (slow)
- Tests with disproportionate time vs. value
- Patterns in slow tests (E2E, HTTP, Database, etc.)

### Step 2: Analyze the Timing Report

```bash
# View the latest log file
ls test-timing-*.log | Sort-Object -Descending | Select-Object -First 1 | Get-Content

# Programmatic summary (JSON)
node tests/get-test-summary.js --json
```

**Key Questions**:
1. **Top 10 slowest tests**: What are they testing? Is it critical?
2. **Category breakdown**: Which category dominates (E2E, HTTP, DB)?
3. **Outliers**: Any tests taking >>10s that shouldn't?
4. **Patterns**: Do slow tests share common operations?

### Step 3: Deep Dive into Slow Tests

For each slow test identified:

#### A. E2E/Puppeteer Tests (Expected: 15-30s)

**Questions**:
- What user workflows are being tested?
- Can we combine multiple scenarios in one browser session?
- Are we testing critical paths or edge cases?
- Can we mock backend responses instead of full integration?

**Example Investigation**:
```javascript
// Current: logs.fontsize.e2e.test.js (60-90s)
// - Launches browser
// - Tests font size feature
// - Takes screenshots
// - Closes browser

// Optimization Ideas:
// 1. Combine with other UI tests in same session
// 2. Reduce screenshot comparisons
// 3. Test font CSS directly instead of rendering
// 4. Run only in CI, not locally
```

#### B. HTTP Server Tests (Expected: 2-5s)

**Questions**:
- Which server endpoints are being tested?
- How long does each endpoint take to respond?
- Are we testing happy path or error cases?
- Can we share server instances across tests?

**Profiling Server Operations**:
```javascript
// Add timing to test
beforeAll(async () => {
  console.time('Server Start');
  server = await startServer();
  console.timeEnd('Server Start');
});

it('should fetch gazetteer data', async () => {
  console.time('Gazetteer Fetch');
  const res = await request(server).get('/api/gazetteer/countries');
  console.timeEnd('Gazetteer Fetch');
  expect(res.status).toBe(200);
});
```

**What This Reveals**:
- If server start >100ms: Why? (DB init, middleware, workers?)
- If endpoint >500ms: Database query slow? Business logic expensive?
- If teardown >100ms: Resource cleanup issues?

#### C. Database Tests (Expected: 1-3s)

**Questions**:
- Are we using file-based or in-memory SQLite?
- How many records are we inserting/querying?
- Are indexes being used?
- Can we share DB instances?

**Optimization Checklist**:
```javascript
// ❌ Slow: Create new DB for each test
beforeEach(() => {
  db = createTestDatabase(); // Disk I/O + schema creation
});

// ✅ Fast: Reuse DB, clear data
beforeAll(() => {
  db = new Database(':memory:'); // Or shared file DB
  initSchema(db);
});

beforeEach(() => {
  db.exec('DELETE FROM articles'); // Fast
});
```

#### D. Online API Tests (Expected: 10-40s)

**Questions**:
- Are we testing API integration or our code?
- Can we use fixtures instead of real API calls?
- Should these run only in CI?
- Are there rate limits causing delays?

**Optimization Strategy**:
```javascript
// Current: gazetteer.wikidata.online.test.js (30-40s)
// - Makes real SPARQL queries to Wikidata
// - Network latency + API processing time
// - Unpredictable (network issues, rate limits)

// Better: Mock with fixtures
jest.mock('node-fetch');
const fetch = require('node-fetch');

beforeAll(() => {
  const fixture = require('./fixtures/wikidata-countries.json');
  fetch.mockResolvedValue({
    ok: true,
    json: async () => fixture
  });
});

// Or: Environment-based
const describeOrSkip = process.env.ONLINE_TESTS === '1' 
  ? describe 
  : describe.skip;
```

---

## 🎯 Optimization Priorities

### Priority 1: Skip Non-Essential Tests Locally (Quick Win)

**Impact**: Save 3-5 minutes  
**Effort**: 1-2 hours

**Implementation**:
```javascript
// In E2E tests
const shouldRunE2E = process.env.UI_E2E === '1';
const describeOrSkip = shouldRunE2E ? describe : describe.skip;

describeOrSkip('Font size E2E', () => { ... });

// In online tests
const shouldRunOnline = process.env.ONLINE_TESTS === '1';
const describeOrSkip = shouldRunOnline ? describe : describe.skip;

describeOrSkip('Wikidata integration', () => { ... });
```

**Usage**:
```bash
# Development (fast, skip E2E/online)
npm test

# CI (run everything)
UI_E2E=1 ONLINE_TESTS=1 npm test
```

### Priority 2: Batch Puppeteer Tests (Medium Impact)

**Impact**: Save 1-2 minutes  
**Effort**: 2-4 hours

**Current State**:
- `logs.fontsize.e2e.test.js` - Launches browser, tests fonts, closes
- `e2e.logs.test.js` - Launches browser, tests logs, closes  
- `e2e.start.button.test.js` - Launches browser, tests button, closes

**Optimization**:
```javascript
// Create: ui/__tests__/e2e.suite.test.js
describe('E2E Test Suite', () => {
  let browser, page;
  
  beforeAll(async () => {
    browser = await puppeteer.launch({ headless: 'new' });
    page = await browser.newPage();
  });
  
  afterAll(async () => {
    await browser.close();
  });
  
  describe('Font Size Features', () => {
    // Tests from logs.fontsize.e2e.test.js
  });
  
  describe('Logs Display', () => {
    // Tests from e2e.logs.test.js
  });
  
  describe('Start Button', () => {
    // Tests from e2e.start.button.test.js
  });
});
```

**Savings**: Browser launch overhead (5-10s) reduced from 3x to 1x.

### Priority 3: Replace Arbitrary Delays (High Impact)

**Impact**: Save 5-15 seconds  
**Effort**: 2-3 hours

**Current Pattern** (found in 25+ HTTP tests):
```javascript
beforeAll(async () => {
  server = startServer();
  await new Promise(r => setTimeout(r, 120)); // Hope server is ready!
});
```

**Optimized Pattern**:
```javascript
beforeAll(async () => {
  server = await new Promise((resolve, reject) => {
    const srv = startServer();
    const timeout = setTimeout(() => reject(new Error('Server timeout')), 5000);
    
    srv.on('listening', () => {
      clearTimeout(timeout);
      resolve(srv);
    });
  });
  // Server guaranteed ready when 'listening' event fires
});
```

**Savings**: Eliminates 120ms × 25 tests = 3 seconds minimum (likely 10-15s in practice as some tests wait longer).

### Priority 4: Identify Slow Server Operations (Critical for Production)

**Impact**: Improves both test and production performance  
**Effort**: 3-5 hours investigation, varies for fixes

**Method**:
```javascript
// Add middleware to track endpoint timing
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (duration > 100) { // Log slow operations
      console.warn(`⚠️  Slow endpoint: ${req.method} ${req.path} took ${duration}ms`);
    }
  });
  next();
});
```

**Run tests and capture slow endpoints**:
```bash
npm test 2>&1 | grep "Slow endpoint" > slow-endpoints.log
```

**Analyze**:
```bash
# Group by endpoint
cat slow-endpoints.log | cut -d' ' -f4-5 | sort | uniq -c | sort -rn
```

**Example Output**:
```
42 GET /api/gazetteer/places  (avg: 450ms)
18 POST /api/crawl/start      (avg: 230ms)
12 GET /api/analysis/results  (avg: 380ms)
```

**Next Steps**:
1. Profile the slow endpoints with Chrome DevTools or `0x`
2. Identify bottlenecks (queries, computations, I/O)
3. Optimize (indexes, caching, algorithm improvements)
4. Re-run tests to measure improvement

---

## 📊 Success Metrics

### Test Suite Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Total Test Time** | 6-10 min | <2 min | ⏳ Measure |
| **Unit Tests** | Unknown | <30s | ⏳ Measure |
| **Integration Tests** | Unknown | <90s | ⏳ Measure |
| **E2E Tests** | 3-4 min est. | <60s (CI-only) | ⏳ Measure |
| **Tests >10s** | Unknown | <5 | ⏳ Measure |
| **Avg Test Time** | Unknown | <1s | ⏳ Measure |

### Application Performance Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Server Start** | ~100-300ms | <100ms | ⏳ Measure |
| **API Response p95** | Unknown | <200ms | ⏳ Measure |
| **Gazetteer Queries** | Unknown | <100ms | ⏳ Measure |
| **Analysis Runtime** | Unknown | <5s | ⏳ Measure |

---

## 🛠️ Tools & Commands

### Timing Analysis

```bash
# Run with timing (already default)
npm test

# View latest timing log
Get-Content (Get-ChildItem test-timing-*.log | Sort-Object -Descending | Select-Object -First 1).Name

# Show slowest tests (>5s by default)
node tests/get-slow-tests.js
```

### Node.js Profiling

```bash
# CPU profiling
node --prof src/crawl.js --max-pages=10
node --prof-process isolate-*.log > cpu-profile.txt

# Memory profiling
node --inspect --inspect-brk src/crawl.js
# Open chrome://inspect in Chrome

# Heap snapshots
node --expose-gc --inspect src/crawl.js
# Take heap snapshots in Chrome DevTools
```

### SQLite Performance

```bash
# Analyze query plans
sqlite3 data/news.db "EXPLAIN QUERY PLAN SELECT * FROM articles WHERE url = ?;"

# Check indexes
sqlite3 data/news.db ".indexes articles"

# Statistics
sqlite3 data/news.db "ANALYZE; SELECT * FROM sqlite_stat1;"
```

### Test-Specific Profiling

```javascript
// In test files, add:
console.time('Test Setup');
beforeAll(async () => {
  // Setup code
});
console.timeEnd('Test Setup');

console.time('Actual Test');
it('should do something', async () => {
  // Test code
});
console.timeEnd('Actual Test');
```

---

## 📋 Investigation Checklist

### Phase 1: Measurement (This Week)

- [ ] Run `npm test` and capture timing report
- [ ] Review `test-timing-*.log` for top 20 slowest tests
- [ ] Categorize slow tests (E2E, HTTP, DB, Online)
- [ ] Document "why is this test slow?" for top 10
- [ ] Identify tests that can be skipped locally
- [ ] Profile server endpoints used by HTTP tests
- [ ] Analyze database operations in DB tests
- [ ] Check for CompressionWorkerPool overhead

### Phase 2: Quick Wins (Next Week)

- [ ] Skip E2E tests by default (env flag)
- [ ] Skip online tests by default (env flag)
- [ ] Replace arbitrary delays with events
- [ ] Batch Puppeteer tests into single suite
- [ ] Update CI to run all tests
- [ ] Document fast test workflow in README

### Phase 3: Deep Optimization (Ongoing)

- [ ] Optimize top 3 slowest server endpoints
- [ ] Add database indexes for slow queries
- [ ] Implement caching for gazetteer operations
- [ ] Refactor analysis workflow for parallelism
- [ ] Add performance budgets to CI
- [ ] Set up continuous performance monitoring

---

## 📝 Reporting Template

Use this template to document findings:

```markdown
## Performance Investigation Report - [Date]

### Timing Results
- Total Test Time: XXXs
- Avg Test Time: XXs
- Slow Tests (>5s): XX
- Very Slow Tests (>10s): XX

### Top 5 Slowest Tests
1. [File] - XXs - [Reason] - [Action]
2. [File] - XXs - [Reason] - [Action]
...

### Category Breakdown
- E2E/Puppeteer: XXs (XX%)
- HTTP Server: XXs (XX%)
- Online API: XXs (XX%)
- Database: XXs (XX%)
- Unit: XXs (XX%)

### Key Findings
- [Finding 1 + Impact]
- [Finding 2 + Impact]
...

### Optimization Recommendations
1. [Recommendation] - [Effort] - [Impact]
2. [Recommendation] - [Effort] - [Impact]
...

### Server Performance Insights
- [Endpoint] - XXms - [Bottleneck identified]
- [Endpoint] - XXms - [Bottleneck identified]
...

### Next Steps
- [ ] [Action item]
- [ ] [Action item]
...
```

---

**Ready to start**: Run `npm test` and analyze the output!
