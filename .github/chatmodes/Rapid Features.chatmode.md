---
description: 'Description of the custom chat mode.'
tools: []
---

# RAPID FEATURE IMPLEMENTATION MODE

**Purpose**: Guide AI agents to implement features quickly and reliably, minimizing test overhead during development while ensuring comprehensive testing afterward.

---

## Core Philosophy: "Build Fast, Test in Batches"

**During Feature Development**:
- Focus on implementation speed and correctness
- Skip test creation temporarily (mark as TODO)
- Use existing tests to verify nothing breaks
- Document assumptions and edge cases for later testing

**After Feature Batch Complete**:
- Write comprehensive tests for all new features
- Run full test suite and fix all failures
- Verify integration scenarios work end-to-end
- Update documentation

---

## Phase 1: Rapid Implementation (No Test Writing)

### Before Starting

1. **Read Existing Code First** (5-10 minutes)
   - Understand current architecture patterns
   - Identify similar features to copy from
   - Note existing helper functions/utilities
   - Check AGENTS.md for architectural decisions

2. **Plan Feature in 3 Sentences**
   ```
   What: [One sentence describing the feature]
   Why: [One sentence explaining the user benefit]
   How: [One sentence describing implementation approach]
   ```

3. **Identify Integration Points**
   - Which files will be modified?
   - Which existing functions will be called?
   - What database tables/APIs are involved?
   - Are there similar features to reference?

### Implementation Workflow

**Step 1: Backend Implementation**
```
✅ Create service/helper functions (business logic)
✅ Add API endpoints (thin controllers)
✅ Add database queries if needed
✅ Use existing error handling patterns
✅ Add inline comments for complex logic
❌ Skip writing tests (mark file as TODO in tracking doc)
```

**Step 2: Frontend Implementation (if applicable)**
```
✅ Create UI components following existing patterns
✅ Add API integration (fetch/SSE)
✅ Style using existing CSS patterns
✅ Add user feedback (loading states, errors)
❌ Skip component tests (mark as TODO)
```

**Step 3: Quick Validation (5 minutes)**
```
✅ Run existing tests: npm test
✅ Fix any broken tests immediately
✅ Start server: npm run gui
✅ Manual smoke test: Does feature work in browser?
✅ Check console for errors
```

**Step 4: Document & Move On**
```
✅ Add feature to todo list as "implemented, needs tests"
✅ Commit with message: "feat: [feature name] (tests TODO)"
✅ Move to next feature
```

---

## Phase 2: Batch Testing (After 3-5 Features)

### Test Planning Session (10 minutes)

**For each feature, identify**:
1. Happy path scenario (what should work)
2. Edge cases (empty data, invalid input, etc.)
3. Error scenarios (server errors, network failures)
4. Integration points (does it affect other features?)

### Test Writing Workflow

**Step 1: Create Test File Structure**
```javascript
describe('Feature Name', () => {
  let app, dbPath, cleanup;
  
  beforeEach(() => {
    // Setup: Use app's DB connection, don't create separate connections
    dbPath = createTempDb();
    app = createApp({ dbPath, verbose: false });
    // Seed data using app's DB handle
    const db = app.locals.backgroundTaskManager?.db || getDbFromApp(app);
    seedTestData(db);
  });
  
  afterEach(() => {
    if (cleanup) cleanup();
  });
  
  describe('Happy path', () => {
    it('should [expected behavior]', async () => {
      // Test implementation
    });
  });
  
  describe('Edge cases', () => {
    it('should handle [edge case]', async () => {
      // Test implementation
    });
  });
  
  describe('Error scenarios', () => {
    it('should return [error] when [condition]', async () => {
      // Test implementation
    });
  });
});
```

**Step 2: Write Tests Systematically**
```
✅ Start with happy path (prove basic functionality)
✅ Add edge cases (empty data, boundaries)
✅ Add error scenarios (invalid input, server errors)
✅ Run tests after each group: npm run test:file "feature.test"
✅ Fix failures before moving to next test group
```

**Step 3: Full Test Suite Validation**
```
✅ Run all tests: npm test
✅ Fix any failures systematically
✅ Verify console output <100 lines
✅ Check test timing (should be <90s)
✅ Update todo list: mark features as "tested and complete"
```

---

## Critical Rules for Reliability

### Database Connections (CRITICAL)

**❌ WRONG - Multiple Connections (WAL Isolation Issues)**:
```javascript
beforeEach(() => {
  dbPath = createTempDb();
  const db = ensureDb(dbPath);  // Connection 1
  seedData(db);
  db.close();
  
  app = createApp({ dbPath });  // Connection 2 (won't see writes from Connection 1!)
});
```

**✅ RIGHT - Single Shared Connection**:
```javascript
beforeEach(() => {
  dbPath = createTempDb();
  app = createApp({ dbPath, verbose: false });
  
  // Use app's DB connection for seeding
  const db = app.locals.backgroundTaskManager?.db;
  seedData(db);  // Same connection, writes are visible
});
```

### Test Console Output

**Keep output minimal (<100 lines total)**:
```javascript
✅ Pass verbose: false to createApp
✅ Use silent: true for background managers
✅ Check jest.setup.js for DROP_PATTERNS
✅ Add patterns for noisy logs
❌ Don't log unconditionally in library code
```

### Error Handling

**Copy existing patterns**:
```javascript
✅ Use InternalServerError, NotFoundError, BadRequestError
✅ Wrap async handlers with try/catch
✅ Return consistent JSON: { success: false, error: 'message' }
✅ Log errors in verbose mode only
```

### Async Prerequisites

**❌ WRONG - Fire-and-forget when order matters**:
```javascript
backgroundTaskManager.startTask(taskId);  // Async, doesn't wait
res.json({ taskId });  // Response sent before task persists
```

**✅ RIGHT - Await when order matters**:
```javascript
await backgroundTaskManager.startTask(taskId);  // Wait for task to persist
res.json({ taskId });  // Now safe to query task
```

**✅ ALSO CORRECT - Synchronous creation, async start**:
```javascript
const taskId = backgroundTaskManager.createTask(type, config);  // Sync
backgroundTaskManager.startTask(taskId).catch(err => log(err));  // Async fire-and-forget
res.json({ taskId });  // Task exists in DB, can be queried
```

---

## Mocking Strategy (For Later Test Phase)

### When to Mock

**✅ Mock for Unit Tests**:
- Database connections (test logic without I/O)
- External APIs (avoid network calls)
- File system operations (no side effects)
- Time-consuming operations (keep tests fast)

**❌ Don't Mock for Integration Tests**:
- Real database (verify actual SQL works)
- HTTP requests between components (test real flow)
- Core business logic (must work correctly)

### Mocking Patterns

**Database Mock (Unit Test)**:
```javascript
const mockDb = {
  prepare: jest.fn(() => ({
    get: jest.fn(() => ({ count: 10 })),
    all: jest.fn(() => [{ id: 1 }, { id: 2 }])
  }))
};

const service = new MyService({ db: mockDb });
```

**Real Database (Integration Test)**:
```javascript
const dbPath = createTempDb();
const app = createApp({ dbPath });
const db = app.locals.backgroundTaskManager.db;

// Test with real database
await request(app).post('/api/endpoint').send(data);
const result = db.prepare('SELECT * FROM table').all();
expect(result).toHaveLength(1);
```

---

## Speed Optimization Techniques

### 1. Copy-Paste Existing Patterns (5x Faster)

**Find similar feature → Copy → Modify**:
```bash
# Example: Adding new analysis endpoint
# 1. Find: grep -r "GET /api/analysis" src/ui/express/routes/
# 2. Copy: Duplicate similar endpoint
# 3. Modify: Change logic for new feature
```

### 2. Reuse Helper Functions

**Don't reinvent the wheel**:
```javascript
✅ Use existing: seedArticles(), createTempDb(), ensureDb()
✅ Use existing: InternalServerError, NotFoundError
✅ Use existing: isTruthyFlag(), createApp()
❌ Don't create: Custom error classes, custom DB helpers
```

### 3. Defer Optimization

**Make it work, then make it fast**:
```javascript
✅ First: Simple working implementation
✅ Later: Optimize if needed (profile first)
❌ Don't: Premature optimization during rapid development
```

### 4. Use Inline Comments Instead of Tests (Temporarily)

**Document assumptions inline**:
```javascript
// TODO(test): Verify this handles null values correctly
// TODO(test): Add edge case for empty array
// TODO(test): Test with large datasets (>10k items)
function processData(data) {
  // Implementation
}
```

---

## Quality Checkpoints (After Each Feature)

### Before Moving to Next Feature

1. **Does it work?** (2 min manual test)
   - Start server: `npm run gui`
   - Exercise feature in browser
   - Check browser console for errors

2. **Did I break existing tests?** (1 min)
   - Run tests: `npm test`
   - If failures: Fix immediately before continuing

3. **Is it documented?** (30 seconds)
   - Add to todo list with status
   - Update AGENTS.md if architectural decision made

4. **Is it committed?** (30 seconds)
   - Commit with clear message
   - Mark as "feat: X (tests TODO)"

### Red Flags to Stop and Fix

**❌ Stop if you see**:
- Tests that were passing now fail
- Server crashes on startup
- Feature doesn't work in manual test
- Browser console shows errors
- Multiple failed attempts (3+) to implement

**✅ Fix immediately, don't accumulate debt**

---

## Batch Testing Workflow (After 3-5 Features)

### Step 1: List All Features Needing Tests

```markdown
Features implemented, need tests:
1. [ ] Feature A - src/service/featureA.js
2. [ ] Feature B - src/routes/api.featureB.js  
3. [ ] Feature C - src/ui/components/FeatureC.js

Integration scenarios to test:
- Feature A → Feature B (does B receive A's output?)
- Feature C → API endpoint (does UI integration work?)
```

### Step 2: Write Tests Feature-by-Feature

```
FOR EACH FEATURE:
  1. Create test file (15 min)
  2. Write happy path tests (10 min)
  3. Run tests: npm run test:file "feature.test"
  4. Fix failures immediately
  5. Write edge case tests (10 min)
  6. Run tests again
  7. Write error scenario tests (10 min)
  8. Run tests again
  9. Mark feature as tested in todo list
  NEXT FEATURE
```

### Step 3: Integration Testing

```
1. Run full test suite: npm test
2. Fix any integration failures
3. Manual end-to-end test (5 min)
4. Update documentation
5. Mark all features complete
```

---

## Example: Rapid Feature Development Session

**Goal**: Add 3 new analysis features in 60 minutes

### Minutes 0-5: Planning
- Read existing analysis code
- Plan: Count API, Status API, Progress tracking
- Identify: Copy from existing endpoints, reuse analysisQueries.js

### Minutes 5-20: Implement Count API (15 min)
```
✅ Add countArticlesNeedingAnalysis() to analysisQueries.js
✅ Add GET /api/analysis/count to api.analysis.js
✅ Test manually: curl http://localhost:41000/api/analysis/count
✅ Commit: "feat: analysis count API (tests TODO)"
```

### Minutes 20-35: Implement Status API (15 min)
```
✅ Add getAnalysisStatusCounts() to analysisQueries.js
✅ Add GET /api/analysis/status to api.analysis.js
✅ Test manually: curl http://localhost:41000/api/analysis/status
✅ Commit: "feat: analysis status API (tests TODO)"
```

### Minutes 35-50: Implement Progress Tracking (15 min)
```
✅ Update analysis-run.js to emit progress events
✅ Add progress calculation logic
✅ Test manually: Watch progress in UI
✅ Commit: "feat: analysis progress tracking (tests TODO)"
```

### Minutes 50-60: Quick Validation (10 min)
```
✅ Run npm test - all existing tests pass
✅ Manual end-to-end test - features work
✅ Update todo list: 3 features implemented, need batch testing
```

**Result**: 3 features in 1 hour, ready for batch testing later

---

## When to Exit Rapid Mode

**Switch to full testing when**:
1. ✅ 3-5 features implemented
2. ✅ Before deploying to production
3. ✅ Before merging to main branch
4. ✅ When features interact in complex ways
5. ✅ When user-facing and quality critical

**Stay in rapid mode when**:
- Early prototyping / exploration
- Internal tooling
- Non-critical features
- Time-boxed experiments

---

## Success Metrics

**Good Rapid Development Session**:
- 2-5 features implemented per hour
- 0 broken existing tests
- All features work in manual testing
- Clear commit history with "tests TODO"
- Todo list updated with test requirements

**Signs You're Going Too Fast**:
- Existing tests failing frequently
- Multiple attempts to fix same issue
- Features don't work in manual testing
- Accumulating technical debt
- Losing track of what needs testing

---

## Templates

### Feature TODO Template
```markdown
- [ ] Feature Name
  - Implementation: [file paths]
  - Needs tests: [test scenarios]
  - Dependencies: [what it depends on]
  - Status: Implemented, tests TODO
```

### Commit Message Template
```
feat: [feature name] (tests TODO)

- Added [what was added]
- Modified [what was changed]
- Integration: [how it connects]

Tests needed:
- [ ] Happy path
- [ ] Edge cases
- [ ] Error scenarios
```

### Test File Template
```javascript
/**
 * [Feature Name] Tests
 * 
 * TODO: Add tests for:
 * - [ ] Happy path
 * - [ ] Edge cases
 * - [ ] Error scenarios
 */

describe('[Feature Name]', () => {
  // Test implementation
});
```

---

## Remember

- **Speed comes from patterns, not shortcuts**
- **Fix broken tests immediately, don't accumulate**
- **Manual testing catches 80% of issues in 20% of time**
- **Batch testing is more efficient than per-feature testing**
- **Copy existing code, don't reinvent**
- **Document assumptions for later test phase**
- **Single database connection per test (critical!)**
- **Commit frequently with clear messages**

**Most Important**: Rapid mode is about **controlled speed**, not reckless hacking. If quality drops, slow down.
