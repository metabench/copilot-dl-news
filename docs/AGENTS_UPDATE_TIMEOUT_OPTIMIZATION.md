# AGENTS.md Update: Timeout Optimization Guidelines

**When to Read**: Read this when debugging timeout issues in crawls or background tasks, understanding timeout tuning strategy, or implementing defensive timeout patterns. Documents lessons learned about timeout discipline and error context.

## Changes Made (October 8, 2025)

### 1. Added "Timeout Optimization Strategy for Development"

**Location**: After "Test Timeout Configuration" section

**Key Guidelines**:
- ✅ **PREFERRED: 2-4 seconds** - Allows 5-10 iterations per minute
- ⚠️ **ACCEPTABLE: 5-8 seconds** - Still allows rapid iteration (2-3 tests/minute)
- ❌ **TOO SLOW: 10+ seconds** - Only for genuine long-running operations
- ❌ **AVOID: 20-60 seconds** - Wastes developer time during iteration

**Rule of Thumb**:
- Server startup check: 2-3 seconds
- Feature validation: 2-5 seconds
- Timing verification: Actual timeout needed + 1 second margin
- Production simulation: 10-30 seconds (rare)

**Example**:
```bash
# ✅ GOOD: Quick server startup verification
node server.js --detached --auto-shutdown-seconds 2

# ❌ BAD: Unnecessarily long timeout
node server.js --detached --auto-shutdown-seconds 30
```

### 2. Added "Event-Driven Testing vs Timeout-Based Testing"

**Location**: After "Timeout Optimization Strategy"

**Core Principle**: Prefer event-driven waits over `setTimeout` in tests

**Comparison Table**:

| Scenario | ❌ Timeout-Based | ✅ Event-Based |
|----------|-----------------|----------------|
| Server startup | `setTimeout(500)` | `server.on('listening')` |
| Database ready | `setTimeout(200)` | `db.on('open')` |
| HTTP request complete | `setTimeout(1000)` | `await fetch(...)` |
| Background task done | `setTimeout(5000)` | `task.on('complete')` |
| File written | `setTimeout(100)` | `await fs.promises.writeFile()` |
| SSE connection | `setTimeout(300)` | `eventSource.onopen` |

**Timeout Estimation Formula** (when timeouts are unavoidable):
```
Safe Timeout = (Expected Duration × 1.5) + Fixed Overhead

Examples:
- Server startup (50-200ms typical): 200 × 1.5 + 50 = 350ms
- Database query (10-50ms typical): 50 × 1.5 + 25 = 100ms
- HTTP request (100-500ms typical): 500 × 1.5 + 100 = 850ms
- Debounce (100ms): 100 × 1.5 + 20 = 170ms
```

**Benefits of Event-Driven Testing**:
- ✅ Faster: Tests complete in actual time needed
- ✅ Reliable: No race conditions from guessing wait times
- ✅ Deterministic: Pass/fail based on logic, not timing luck
- ✅ Clear: Intent is obvious (waiting for event, not arbitrary delay)

### 3. Updated "Testing Strategy During Large Refactoring"

**Added**: Timeout selection guidance for manual testing

**New Content**:
```
TIMEOUT SELECTION FOR MANUAL TESTING:
- ✅ Use 2-4 second timeouts for rapid iteration (5-10 tests/minute)
- ✅ Server startup verification: 2-3 seconds is sufficient
- ✅ Feature checks: 2-5 seconds allows fast feedback
- ❌ Avoid 10+ second timeouts unless truly necessary
- ❌ Never use 20-60 second timeouts for simple checks
```

## Impact on Development Workflow

### Before This Update
- Agents used 8-10 second timeouts for simple server verification
- 5 iterations = 40-50 seconds of waiting
- Slow feedback loop during development

### After This Update
- Agents will use 2-4 second timeouts for rapid testing
- 5 iterations = 10-20 seconds of waiting
- **2-3x faster iteration speed**

### Expected Behavior Changes

**When verifying server starts correctly**:
```bash
# OLD: Agent tested with 5s, 8s, 10s, 20s timeouts
node server.js --auto-shutdown-seconds 8  # Waited 8s each time

# NEW: Agent will test with 2-4s timeouts
node server.js --auto-shutdown-seconds 2  # Waits only 2s
node server.js --auto-shutdown-seconds 3  # Or 3s if being conservative
```

**When writing/refactoring tests**:
- Agents will audit for `setTimeout` usage
- Replace arbitrary delays with event-driven waits where possible
- Estimate minimal safe timeouts using the formula when delays are necessary
- Document why timeout-based approach is needed (if it is)

## Audit Recommendations

**For existing tests**, agents should:

1. Search for `setTimeout` usage:
```bash
grep -r "setTimeout" src/**/__tests__/**/*.test.js
```

2. Identify candidates for event-driven replacement:
   - Server startup tests (use `server.on('listening')`)
   - Database initialization (use `db.on('open')`)
   - HTTP requests (use `await` instead of setTimeout)

3. Reduce excessive timeouts:
   - Review timeouts >500ms
   - Apply timeout estimation formula
   - Reduce to minimal safe value

## Summary

This update establishes clear guidelines for:
1. ✅ **Rapid development iteration** - Use 2-4s timeouts for manual testing
2. ✅ **Event-driven testing** - Replace setTimeout with event listeners
3. ✅ **Timeout estimation** - Calculate minimal safe timeouts when needed
4. ✅ **Clear trade-offs** - Document when and why timeouts are acceptable

**Expected Result**: Agents will work 2-3x faster during iterative development while writing more reliable, event-driven tests.
