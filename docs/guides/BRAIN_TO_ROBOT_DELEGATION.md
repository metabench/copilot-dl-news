# Brain-to-Robot Delegation Guide

_Last Verified: 2025-12-01_

**Purpose**: How 🧠 brain agents create plans that 🤖 robot agents can execute perfectly. This guide ensures reliable handoff between thinking agents and executor agents.

---

## The Core Principle

**Robot agents are NOT stupid—they are precise.**

| Trait | Brain Agent (🧠) | Robot Agent (🤖) |
|-------|------------------|------------------|
| **Strength** | Strategy, context, judgment | Speed, precision, consistency |
| **Weakness** | Slow, expensive | Cannot handle ambiguity |
| **Input** | Vague requirements, goals | Explicit, atomic steps |
| **Output** | Plans, decisions, architecture | Executed code, reports |

**The handoff quality determines success.** A perfect plan → perfect execution. A vague plan → confused robot.

---

## Plan Structure Template

```markdown
# EXECUTION PLAN: <Clear Title>

## Context (Robot reads but doesn't act on)
- Purpose: <one sentence>
- Triggered by: <what caused this plan>
- Related files: <list>

## Prerequisites (Robot verifies before starting)
- [ ] File exists: `<path>`
- [ ] Server running: `<url>`
- [ ] Command available: `<command --version>`
- [ ] Previous plan completed: `<plan name>`

## Steps (Robot executes in order)

### Step 1: <Verb + Object>
**Type**: COMMAND | EDIT | VERIFY | CREATE
**Details**: <see type-specific format below>
**On success**: Continue
**On failure**: STOP

### Step 2: ...
(repeat)

## Completion Criteria
- [ ] <measurable criterion 1>
- [ ] <measurable criterion 2>

## Rollback (if critical failure)
1. <undo step 1>
2. <undo step 2>
```

---

## Step Type Formats

### COMMAND Type

```markdown
### Step N: Run <description>
**Type**: COMMAND
**Command**: `<exact command>`
**Working directory**: `<path or "current">`
**Expected output contains**: `<pattern>`
**Expected exit code**: 0
**Timeout**: <seconds or "none">
```

Example:
```markdown
### Step 3: Run tests
**Type**: COMMAND
**Command**: `npm run test:by-path tests/services/auth.test.js`
**Working directory**: current
**Expected output contains**: `Tests: .* passed`
**Expected exit code**: 0
**Timeout**: 60
```

### EDIT Type

```markdown
### Step N: Modify <file description>
**Type**: EDIT
**File**: `<absolute or relative path>`
**Operation**: FIND_REPLACE | INSERT_AFTER | INSERT_BEFORE | DELETE
**Find** (exact match, include 3+ context lines):
```
<exact text to find>
```
**Replace with** (or Insert/Delete):
```
<exact replacement>
```
**Verify command**: `<command to verify edit worked>`
```

Example:
```markdown
### Step 5: Add error handling
**Type**: EDIT
**File**: `src/services/UserService.js`
**Operation**: FIND_REPLACE
**Find**:
```javascript
async getUser(id) {
  const user = await db.users.findById(id);
  return user;
}
```
**Replace with**:
```javascript
async getUser(id) {
  try {
    const user = await db.users.findById(id);
    return user;
  } catch (error) {
    logger.error('getUser failed', { id, error });
    throw error;
  }
}
```
**Verify command**: `node -c src/services/UserService.js`
```

### VERIFY Type

```markdown
### Step N: Verify <what>
**Type**: VERIFY
**Check**: `<description of what to verify>`
**Command**: `<verification command>`
**Success pattern**: `<regex or exact text>`
**Failure pattern**: `<regex or exact text>`
```

Example:
```markdown
### Step 2: Verify server is running
**Type**: VERIFY
**Check**: Server responds on port 3000
**Command**: `curl -s http://localhost:3000/health`
**Success pattern**: `"status":"ok"`
**Failure pattern**: `connection refused|ECONNREFUSED`
```

### CREATE Type

```markdown
### Step N: Create <file description>
**Type**: CREATE
**File**: `<path>`
**Content**:
```<language>
<exact file content>
```
**Verify command**: `<verification>`
```

---

## Writing Unambiguous Instructions

### ❌ BAD: Ambiguous

```markdown
Step 1: Update the user service to handle errors better
Step 2: Make sure tests pass
Step 3: Clean up the code
```

### ✅ GOOD: Explicit

```markdown
### Step 1: Add try-catch to getUser method
**Type**: EDIT
**File**: `src/services/UserService.js`
**Operation**: FIND_REPLACE
**Find**:
```javascript
async getUser(id) {
  return db.users.findById(id);
}
```
**Replace with**:
```javascript
async getUser(id) {
  try {
    return db.users.findById(id);
  } catch (error) {
    throw new UserNotFoundError(id);
  }
}
```
**Verify command**: `node -c src/services/UserService.js`

### Step 2: Run user service tests
**Type**: COMMAND
**Command**: `npm run test:by-path tests/services/UserService.test.js`
**Expected output contains**: `passed`
**Expected exit code**: 0

### Step 3: Remove unused import on line 3
**Type**: EDIT
**File**: `src/services/UserService.js`
**Operation**: DELETE
**Find**:
```javascript
const unusedHelper = require('../utils/unused');
```
**Verify command**: `node -c src/services/UserService.js`
```

---

## Context Lines for FIND_REPLACE

**Always include 3+ lines of context** around the target text. This prevents:
- Matching wrong occurrence
- Ambiguous edits
- Phantom matches

### ❌ BAD: No context

```markdown
**Find**:
```
return user;
```
```

This might match 50 places in the file.

### ✅ GOOD: With context

```markdown
**Find**:
```javascript
  async getUser(id) {
    const user = await db.users.findById(id);
    return user;
  }
```
```

This matches exactly one place.

---

## Handling Conditional Logic

Robot agents don't handle conditionals well. Convert to explicit steps:

### ❌ BAD: Conditional

```markdown
Step 3: If the file exists, update it. Otherwise, create it.
```

### ✅ GOOD: Explicit

```markdown
### Step 3a: Check if config exists
**Type**: VERIFY
**Command**: `test -f config/app.json && echo EXISTS || echo MISSING`
**Success pattern**: `EXISTS`
**Failure pattern**: `MISSING`
**On failure**: Continue to Step 3b

### Step 3b: Create config if missing
**Type**: CREATE
**Condition**: Only if Step 3a failed
**File**: `config/app.json`
**Content**:
```json
{ "version": "1.0.0" }
```
```

Or better—split into two separate plans:
1. "Create config if missing" (robot checks and creates)
2. "Update existing config" (robot updates)

---

## Batch Operations

For operations across multiple files, be explicit:

```markdown
### Step 4: Add header to all test files
**Type**: BATCH_EDIT
**Files**: `tests/**/*.test.js`
**For each file**:
  1. **Operation**: INSERT_BEFORE
  2. **Find**: First line of file
  3. **Insert**:
```javascript
// @generated - Do not edit manually
```

**Expected count**: 15-20 files modified
**Verify**: `grep -r "@generated" tests/ | wc -l`
**Expected verification output**: `>= 15`
```

---

## Error Escalation Points

Tell the robot when to stop and escalate:

```markdown
## Error Escalation

STOP and report if:
- Any EDIT fails to find the target text
- Tests fail after edits
- Verification shows unexpected state
- More than 2 consecutive command failures

DO NOT:
- Attempt to fix failed edits
- Modify the plan
- Skip failing steps
```

---

## Plan Complexity Guidelines

| Plan Complexity | Steps | Recommended |
|-----------------|-------|-------------|
| Simple | 1-5 | ✅ Good for 🤖 |
| Medium | 6-15 | ✅ Acceptable |
| Complex | 16-30 | ⚠️ Consider splitting |
| Very Complex | 30+ | ❌ Split into sub-plans |

**Complex tasks should be split:**

```markdown
# MASTER PLAN: Refactor Auth Module

## Sub-plans (execute in order)

1. `PLAN-auth-1-extract-types.md` - Extract type definitions
2. `PLAN-auth-2-update-service.md` - Update service layer
3. `PLAN-auth-3-update-tests.md` - Update tests
4. `PLAN-auth-4-verify.md` - Full verification
```

---

## Pre-Flight Checklist for Brain Agents

Before handing off a plan to 🤖:

- [ ] Every step has explicit TYPE (COMMAND/EDIT/VERIFY/CREATE)
- [ ] All file paths are explicit (no "the file" or "that module")
- [ ] EDIT operations include 3+ lines of context
- [ ] Expected outputs are specified for commands
- [ ] Verification commands exist for all edits
- [ ] No conditional logic (split into explicit branches)
- [ ] Rollback steps defined for critical operations
- [ ] Error escalation points are clear

---

## Example: Complete Plan

```markdown
# EXECUTION PLAN: Add rate limiting to API

## Context
- Purpose: Prevent API abuse by adding rate limiting middleware
- Triggered by: Security review finding #42
- Related files: src/server/middleware/, src/server/app.js

## Prerequisites
- [x] File exists: `src/server/app.js`
- [x] File exists: `src/server/middleware/index.js`
- [ ] Verify: `npm list express-rate-limit` returns installed

## Steps

### Step 1: Verify rate-limit package
**Type**: COMMAND
**Command**: `npm list express-rate-limit`
**Expected output contains**: `express-rate-limit@`
**Expected exit code**: 0
**On failure**: STOP - package not installed

### Step 2: Create rate limiter middleware
**Type**: CREATE
**File**: `src/server/middleware/rateLimiter.js`
**Content**:
```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});

module.exports = { apiLimiter };
```
**Verify command**: `node -c src/server/middleware/rateLimiter.js`

### Step 3: Export from middleware index
**Type**: EDIT
**File**: `src/server/middleware/index.js`
**Operation**: FIND_REPLACE
**Find**:
```javascript
const { authMiddleware } = require('./auth');
const { loggerMiddleware } = require('./logger');

module.exports = {
  authMiddleware,
  loggerMiddleware
};
```
**Replace with**:
```javascript
const { authMiddleware } = require('./auth');
const { loggerMiddleware } = require('./logger');
const { apiLimiter } = require('./rateLimiter');

module.exports = {
  authMiddleware,
  loggerMiddleware,
  apiLimiter
};
```
**Verify command**: `node -e "require('./src/server/middleware').apiLimiter"`

### Step 4: Apply to app
**Type**: EDIT
**File**: `src/server/app.js`
**Operation**: FIND_REPLACE
**Find**:
```javascript
const { authMiddleware, loggerMiddleware } = require('./middleware');

app.use(loggerMiddleware);
app.use('/api', authMiddleware);
```
**Replace with**:
```javascript
const { authMiddleware, loggerMiddleware, apiLimiter } = require('./middleware');

app.use(loggerMiddleware);
app.use('/api', apiLimiter);
app.use('/api', authMiddleware);
```
**Verify command**: `node -c src/server/app.js`

### Step 5: Run server tests
**Type**: COMMAND
**Command**: `npm run test:by-path tests/server/`
**Expected output contains**: `passed`
**Expected exit code**: 0
**Timeout**: 120

## Completion Criteria
- [ ] rateLimiter.js exists and has no syntax errors
- [ ] middleware/index.js exports apiLimiter
- [ ] app.js uses apiLimiter before authMiddleware
- [ ] All server tests pass

## Rollback
1. Delete `src/server/middleware/rateLimiter.js`
2. Revert `src/server/middleware/index.js` to remove apiLimiter export
3. Revert `src/server/app.js` to remove apiLimiter usage

## Error Escalation
STOP and report if:
- rateLimiter.js fails syntax check
- Tests fail after Step 5
- Any EDIT cannot find target text
```

---

## Quick Reference

| Emoji | Role | Creates Plans? | Executes Plans? |
|-------|------|----------------|-----------------|
| 🧠 | Brain/Research | ✅ YES | ⚠️ Can, but usually delegates |
| 🤖 | Robot/Executor | ❌ NO | ✅ YES |
| 💡 | Specialist | ✅ YES | ✅ YES |

**The better the plan, the faster the robot.**
