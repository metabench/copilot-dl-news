---
type: implementation-quick-start
title: "Quick-Start: Build Session/Context System"
subtitle: "Proof-of-Concept Implementation (4-6 hours)"
date: 2025-11-13
priority: "high"
complexity: "intermediate"
estimated-effort: "4-6 hours"
---

# Quick-Start: Build Session/Context System (Enhancement #4 Foundation)

## Why Start Here?

The **Session/Context System** is the foundation for all other enhancements:
- Enables context passing between tool invocations
- Unlocks pipeline composition without repeated analysis
- Requires minimal new infrastructure (leverages existing TokenCodec)
- Immediate productivity gain for agents
- **ROI: 20:1+ with 4-6 hour investment**

---

## What You'll Build

A session management layer that allows agents to:

```javascript
// Step 1: Start analysis session
node js-scan.js --session-start \
  --search "processData" \
  --save-session marketing-refactor \
  --json

// Step 2: Continue later, building on prior analysis
node js-scan.js --session-continue \
  --from marketing-refactor \
  --analyze-ripple \
  --json

// Result: Ripple analysis runs with context from Step 1
// No need to re-search; analysis built on prior results
```

---

## Implementation Blueprint

### Phase 0: Setup (30 min)

**Create directory structure:**
```bash
tools/dev/sessions/
  ├─ SessionManager.js (core session logic)
  ├─ SessionStore.js (filesystem storage)
  ├─ SessionCache.js (in-memory cache)
  └─ __tests__/
     ├─ SessionManager.test.js
     └─ SessionStore.test.js
```

**Files to examine first:**
- `tools/dev/shared/TokenCodec.js` (understand token format)
- `tools/dev/js-scan.js` (where session logic hooks in)
- `src/utils/CliArgumentParser.js` (argument parsing)

### Phase 1: Core Session Manager (1.5-2 hours)

**File: `tools/dev/sessions/SessionManager.js`**

```javascript
'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const SessionStore = require('./SessionStore');

/**
 * Manages agent analysis sessions with state persistence.
 * Sessions allow agents to chain analyses without repeating work.
 */
class SessionManager {
  constructor(cacheDir = path.join(__dirname, '../../..', 'tmp/.ai-cache/sessions')) {
    this.cacheDir = cacheDir;
    this.store = new SessionStore(cacheDir);
    this.inMemoryCache = new Map();
    this.sessionTTL = 3600000; // 1 hour in ms
  }

  /**
   * Start a new analysis session
   * @param {string} sessionName - User-friendly name (e.g., 'marketing-refactor')
   * @param {object} initialContext - Initial analysis results
   * @returns {object} Session metadata + continuation token
   */
  async createSession(sessionName, initialContext) {
    if (!sessionName || typeof sessionName !== 'string') {
      throw new Error('Session name required (string)');
    }

    const sessionId = this.generateSessionId(sessionName);
    const continuationToken = this.generateContinuationToken(sessionId);

    const sessionData = {
      sessionId,
      sessionName,
      continuationToken,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.sessionTTL,
      context: initialContext || {},
      operations: [],
      metadata: {
        agentId: process.env.AGENT_ID || 'unknown',
        tool: 'js-scan',
        version: 1
      }
    };

    // Save to persistent storage
    await this.store.save(sessionId, sessionData);

    // Cache in memory for quick access
    this.inMemoryCache.set(sessionId, sessionData);

    return {
      sessionId,
      sessionName,
      continuationToken,
      expiresIn: Math.floor(this.sessionTTL / 1000),
      cachePath: path.join(this.cacheDir, `${sessionId}.json`)
    };
  }

  /**
   * Continue an existing session
   * @param {string} continuationTokenOrSessionId - Token or session name
   * @returns {object} Session data + any cached results
   */
  async continueSession(continuationTokenOrSessionId) {
    const sessionId = this.resolveSessionId(continuationTokenOrSessionId);

    // Try memory cache first
    if (this.inMemoryCache.has(sessionId)) {
      const cached = this.inMemoryCache.get(sessionId);
      if (cached.expiresAt > Date.now()) {
        return {
          from: 'memory-cache',
          session: cached,
          cacheAge: Date.now() - cached.retrievedAt
        };
      } else {
        // Expired; remove from cache
        this.inMemoryCache.delete(sessionId);
      }
    }

    // Load from persistent storage
    const session = await this.store.load(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (session.expiresAt < Date.now()) {
      // Session expired; clean up
      await this.store.delete(sessionId);
      throw new Error(`Session expired: ${sessionId}`);
    }

    // Update retrieved time for cache coherency
    session.retrievedAt = Date.now();
    this.inMemoryCache.set(sessionId, session);

    return {
      from: 'disk',
      session,
      cacheAge: Date.now() - session.createdAt
    };
  }

  /**
   * Add result to session (continue building context)
   * @param {string} sessionId - Session to update
   * @param {string} operationName - What operation just ran
   * @param {object} result - Result data to append
   */
  async appendResult(sessionId, operationName, result) {
    let session = this.inMemoryCache.get(sessionId);
    if (!session) {
      session = await this.store.load(sessionId);
    }

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Append operation to history
    session.operations.push({
      name: operationName,
      completedAt: Date.now(),
      resultKeys: Object.keys(result)
    });

    // Merge result into context (new key-value pairs only)
    session.context = {
      ...session.context,
      ...result
    };

    // Persist changes
    await this.store.save(sessionId, session);
    this.inMemoryCache.set(sessionId, session);

    return {
      operationsCompleted: session.operations.length,
      contextSize: Object.keys(session.context).length
    };
  }

  /**
   * Get summary of session state
   */
  async getSummary(sessionId) {
    const session = await this.continueSession(sessionId);
    return {
      sessionId: session.session.sessionId,
      sessionName: session.session.sessionName,
      age: Date.now() - session.session.createdAt,
      expiresIn: session.session.expiresAt - Date.now(),
      operationsCompleted: session.session.operations.length,
      contextKeys: Object.keys(session.session.context),
      lastOperation: session.session.operations[session.session.operations.length - 1]
    };
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpired() {
    const deleted = await this.store.deleteExpired(Date.now());
    return {
      deletedCount: deleted,
      timestamp: Date.now()
    };
  }

  // ===== Private helpers =====

  generateSessionId(sessionName) {
    // Combine name + timestamp for uniqueness
    const timestamp = Date.now();
    const hash = crypto
      .createHash('sha256')
      .update(`${sessionName}-${timestamp}`)
      .digest('hex')
      .slice(0, 8);
    return `sess-${sessionName}-${hash}`;
  }

  generateContinuationToken(sessionId) {
    // Format: js--<8-char-hash>-<operation>-<seq>
    // Example: js--abc123de-search-001
    const hash = sessionId.slice(-8); // Use last 8 chars of sessionId
    return `js--${hash}-sess-001`;
  }

  resolveSessionId(tokenOrName) {
    // If it's already a sessionId format, use it
    if (tokenOrName.startsWith('sess-')) {
      return tokenOrName;
    }
    // Otherwise, it's a name; convert to sessionId
    // For now, treat as substring match
    return tokenOrName;
  }
}

module.exports = SessionManager;
```

**File: `tools/dev/sessions/SessionStore.js`**

```javascript
'use strict';

const fs = require('fs').promises;
const path = require('path');

/**
 * Persistent storage for sessions (filesystem-based)
 */
class SessionStore {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
  }

  async save(sessionId, sessionData) {
    await this._ensureDir();
    const filePath = path.join(this.cacheDir, `${sessionId}.json`);
    await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2), 'utf8');
  }

  async load(sessionId) {
    try {
      const filePath = path.join(this.cacheDir, `${sessionId}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async delete(sessionId) {
    try {
      const filePath = path.join(this.cacheDir, `${sessionId}.json`);
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async deleteExpired(now) {
    await this._ensureDir();
    const files = await fs.readdir(this.cacheDir);
    let deletedCount = 0;

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(this.cacheDir, file);
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));

        if (data.expiresAt < now) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      } catch (err) {
        // Skip files we can't parse
      }
    }

    return deletedCount;
  }

  async _ensureDir() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw err;
      }
    }
  }
}

module.exports = SessionStore;
```

### Phase 2: Integration with js-scan (1-1.5 hours)

**Modify: `tools/dev/js-scan.js` (add session arguments)**

Find the argument parser section and add:

```javascript
// Add to argument definition
parser.defineFlag('session-start', {
  alias: ['session_start'],
  description: 'Start new analysis session',
  type: 'string',
  example: 'marketing-refactor'
});

parser.defineFlag('session-continue', {
  alias: ['session_continue'],
  description: 'Continue existing session',
  type: 'string',
  example: 'marketing-refactor'
});

parser.defineFlag('from', {
  alias: [],
  description: 'Session ID or continuation token',
  type: 'string'
});

// Add at main execution logic (after args parsed):
const SessionManager = require('./sessions/SessionManager');
const sessionMgr = new SessionManager();

if (args['session-start']) {
  const sessionName = args['session-start'];
  
  // Run search or other operation
  const results = await runSearch(args);
  
  // Create session with results
  const sessionInfo = await sessionMgr.createSession(sessionName, results);
  
  outputJson({
    ...results,
    session: sessionInfo,
    continuationToken: sessionInfo.continuationToken
  });
  
  process.exit(0);
}

if (args['session-continue']) {
  const sessionId = args.from || args['session-continue'];
  
  // Load prior session
  const sessionData = await sessionMgr.continueSession(sessionId);
  
  // Run new operation (e.g., ripple analysis) with prior context
  const newResults = await runRippleAnalysis(args, sessionData.session.context);
  
  // Append to session
  await sessionMgr.appendResult(
    sessionData.session.sessionId,
    'ripple-analysis',
    newResults
  );
  
  outputJson({
    ...newResults,
    session: await sessionMgr.getSummary(sessionData.session.sessionId),
    fromPriorContext: true
  });
  
  process.exit(0);
}
```

### Phase 3: Tests (1-1.5 hours)

**File: `tools/dev/sessions/__tests__/SessionManager.test.js`**

```javascript
'use strict';

const SessionManager = require('../SessionManager');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');

describe('SessionManager', () => {
  let sessionMgr;
  let testCacheDir;

  beforeEach(async () => {
    // Create temp directory for tests
    testCacheDir = path.join(os.tmpdir(), `session-test-${Date.now()}`);
    await fs.mkdir(testCacheDir, { recursive: true });
    sessionMgr = new SessionManager(testCacheDir);
  });

  afterEach(async () => {
    // Cleanup temp directory
    const files = await fs.readdir(testCacheDir);
    for (const file of files) {
      await fs.unlink(path.join(testCacheDir, file));
    }
    await fs.rmdir(testCacheDir);
  });

  it('should create a new session', async () => {
    const result = await sessionMgr.createSession('test-session', {
      initialData: 'test'
    });

    expect(result).toHaveProperty('sessionId');
    expect(result).toHaveProperty('continuationToken');
    expect(result.sessionName).toBe('test-session');
  });

  it('should continue an existing session', async () => {
    const created = await sessionMgr.createSession('test-session', {
      initialData: 'test'
    });

    const continued = await sessionMgr.continueSession(created.sessionId);

    expect(continued.session.sessionName).toBe('test-session');
    expect(continued.session.context.initialData).toBe('test');
  });

  it('should append results to session', async () => {
    const created = await sessionMgr.createSession('test-session', {});

    await sessionMgr.appendResult(created.sessionId, 'search', {
      results: ['file1.js', 'file2.js']
    });

    const continued = await sessionMgr.continueSession(created.sessionId);

    expect(continued.session.operations).toHaveLength(1);
    expect(continued.session.operations[0].name).toBe('search');
    expect(continued.session.context.results).toEqual(['file1.js', 'file2.js']);
  });

  it('should reject expired sessions', async () => {
    const created = await sessionMgr.createSession('test-session', {});

    // Mock TTL as 1ms (immediate expiry)
    sessionMgr.sessionTTL = 1;

    await new Promise(resolve => setTimeout(resolve, 10));

    try {
      await sessionMgr.continueSession(created.sessionId);
      fail('Should have thrown');
    } catch (err) {
      expect(err.message).toContain('expired');
    }
  });

  it('should cleanup expired sessions', async () => {
    const created = await sessionMgr.createSession('test-session', {});
    sessionMgr.sessionTTL = 1;

    await new Promise(resolve => setTimeout(resolve, 10));

    const cleanup = await sessionMgr.cleanupExpired();
    expect(cleanup.deletedCount).toBe(1);
  });
});
```

### Phase 4: Documentation (30 min)

**File: `docs/SESSION_SYSTEM_GUIDE.md`**

```markdown
# Session System Quick Guide

## Starting a Session

When beginning a complex analysis, start a session:

```bash
node js-scan.js --session-start refactor-users \
  --search "processUserData" \
  --json
```

Output includes continuation token:
```json
{
  "results": [...],
  "session": {
    "continuationToken": "js--abc123de-sess-001",
    "expiresIn": 3600
  }
}
```

## Continuing a Session

Later, continue with `--session-continue`:

```bash
node js-scan.js --session-continue refactor-users \
  --analyze-ripple \
  --json
```

The ripple analysis runs with context from the prior search.

## Use Cases

1. **Multi-step refactors** - Search, analyze ripple, prepare batch edits
2. **Bug investigation** - Find bug, analyze callers, trace through tests
3. **Performance optimization** - Find pattern, understand impact, apply fix

## Session Lifetime

- Sessions expire after **1 hour**
- Stored in `tmp/.ai-cache/sessions/`
- Auto-cleaned on startup

## Tips

- Use descriptive session names (e.g., `refactor-users`, not `s1`)
- One session per task/agent
- Sessions are independent; multiple can run in parallel
```

---

## Testing the Implementation

### Manual Testing Script

**File: `tools/dev/sessions/__manual-test__.js`**

```javascript
'use strict';

const SessionManager = require('./SessionManager');

async function test() {
  console.log('📝 Session System Manual Test\n');

  const sessionMgr = new SessionManager();

  // Step 1: Create session
  console.log('Step 1: Creating session...');
  const session1 = await sessionMgr.createSession('manual-test', {
    searchTerm: 'processData',
    filesFound: ['src/app.js', 'src/service.js']
  });

  console.log(`✅ Session created: ${session1.continuationToken}`);
  console.log(`   Expires in ${session1.expiresIn} seconds\n`);

  // Step 2: Continue session
  console.log('Step 2: Continuing session...');
  const session2 = await sessionMgr.continueSession(session1.sessionId);

  console.log(`✅ Session continued`);
  console.log(`   Operations: ${session2.session.operations.length}`);
  console.log(`   Context keys: ${Object.keys(session2.session.context).join(', ')}\n`);

  // Step 3: Append result
  console.log('Step 3: Appending ripple analysis result...');
  await sessionMgr.appendResult(session1.sessionId, 'ripple-analysis', {
    callers: ['test-file-1.js', 'test-file-2.js'],
    impact: 'moderate'
  });

  console.log(`✅ Result appended\n`);

  // Step 4: Get summary
  console.log('Step 4: Getting session summary...');
  const summary = await sessionMgr.getSummary(session1.sessionId);

  console.log(`✅ Summary:`, JSON.stringify(summary, null, 2));
}

test().catch(console.error);
```

Run: `node tools/dev/sessions/__manual-test__.js`

---

## Success Criteria

- ✅ Sessions persist to disk and memory cache
- ✅ Continuation tokens work reliably
- ✅ Context accumulates across operations
- ✅ Expired sessions are cleaned up
- ✅ Tests pass (unit + manual)
- ✅ Integration with js-scan works

---

## Next Steps After Implementation

1. **Integrate with js-edit**: Enable batch edits to reference prior analyses
2. **Add pipeline support**: Chain multiple operations in one invocation
3. **Agent feedback**: Collect metrics on time savings
4. **Extend to other tools**: md-scan, other CLI tools

---

## Estimated Implementation Timeline

| Task | Time | Owner |
|------|------|-------|
| Setup + SessionManager | 1.5-2h | Backend engineer |
| SessionStore + tests | 45-60 min | Backend engineer |
| js-scan integration | 45-60 min | Backend engineer |
| Manual testing + iteration | 30-45 min | QA + Backend |
| Documentation | 30 min | Docs lead |
| **Total** | **4-6 hours** | — |

---

## Key Design Decisions

### Why File-Based Storage?
- Simple, reliable, no DB dependency
- Easy to inspect during debugging
- Good performance for agent workflows (low concurrency)

### Why In-Memory Cache?
- 99th percentile latency for repeated accesses
- Automatic expiry management
- Prevents thrashing disk I/O

### Why 1-Hour TTL?
- Long enough for multi-step workflow (typical: 30-45 min)
- Short enough to prevent stale contexts
- Balances storage + freshness

---

## Troubleshooting

**Session not found?**
- Check session name matches (case-sensitive)
- Verify session hasn't expired (1 hour TTL)
- Check `tmp/.ai-cache/sessions/` directory exists

**Continuation token invalid?**
- Use session name instead of token
- Regenerate by using `--session-start` again

**Out of disk space?**
- Run manual cleanup: `node SessionManager.js --cleanup`
- Increase automatic TTL enforcement

---

_This quick-start gets you to 80% of the value with 20% of the complexity. Phase 2 enhancements can build on this foundation._
