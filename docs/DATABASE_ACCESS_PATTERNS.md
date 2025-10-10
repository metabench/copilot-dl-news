# Database Access Patterns — Unified Guide

**Date**: 2025-10-07  
**Status**: ✅ Standardized  
**Module**: `src/db/dbAccess.js`

**When to Read**:
- Wiring database access inside services, routes, or CLI scripts and choosing the correct helper
- Debugging connection lifecycle issues (dangling handles, WAL isolation) or test flakiness
- Auditing new code for consistency with the unified `dbAccess` patterns before review

## Problem Statement

Previously, the codebase had **three conflicting patterns** for database access:

```javascript
// Pattern 1: Direct instantiation (15+ files)
const db = new NewsDatabase(dbPath);

// Pattern 2: Factory function (10+ files)  
const db = getDbRW();

// Pattern 3: Read-only helper (8+ files)
const db = openDbReadOnly(dbPath);
```

**Issues**:
- ❌ No clear guidelines on which pattern to use when
- ❌ Test failures due to inconsistent access
- ❌ API 503 errors from incorrect patterns
- ❌ Memory leaks from forgotten `db.close()` calls
- ❌ Confusion about connection lifecycle

## Solution: Unified dbAccess Module

The `src/db/dbAccess.js` module provides **5 clear helpers** for all use cases:

| Helper | Use Case | Auto-Close? | Example |
|--------|----------|-------------|---------|
| `openNewsDb()` | Long-lived services | ❌ No (manual) | Background tasks |
| `withNewsDb()` | CLI scripts/tools | ✅ Yes | One-off operations |
| `createDbMiddleware()` | Express routes | N/A | Add `req.db` |
| `getDbOrError()` | Express handlers | N/A | Error handling |
| `isDbAvailable()` | Health checks | N/A | Availability test |

---

## Usage Patterns by Context

### 1. CLI Tools & Scripts ⭐ **MOST COMMON**

**Use**: `withNewsDb()` — Automatic connection cleanup

```javascript
const { withNewsDb } = require('./db/dbAccess');

// Example: Analyze database statistics
withNewsDb(null, (db) => {
  const articles = db.db.prepare('SELECT COUNT(*) as count FROM articles').get();
  const places = db.db.prepare('SELECT COUNT(*) as count FROM gazetteer_places').get();
  
  console.log(`Articles: ${articles.count}`);
  console.log(`Places: ${places.count}`);
  
  // No need to call db.close() — handled automatically!
});
```

**Benefits**:
- ✅ Automatic cleanup (even if exception thrown)
- ✅ No memory leaks
- ✅ Clean, readable code
- ✅ Works with async functions

**Migration Example**:

```javascript
// ❌ OLD PATTERN (manual cleanup required)
const NewsDatabase = require('./db/sqlite/SQLiteNewsDatabase');
const db = new NewsDatabase('data/news.db');
try {
  const count = db.getCount();
  console.log(count);
} finally {
  db.close(); // Easy to forget!
}

// ✅ NEW PATTERN (automatic cleanup)
const { withNewsDb } = require('./db/dbAccess');
withNewsDb(null, (db) => {
  const count = db.getCount();
  console.log(count);
}); // Automatically closed!
```

---

### 2. Express Route Handlers ⭐ **EXPRESS SPECIFIC**

**Option A**: Middleware Pattern (Recommended)

```javascript
const { createDbMiddleware } = require('../../db/dbAccess');

function createMyRouter({ getDbRW }) {
  const router = express.Router();
  
  // Add db to all routes
  router.use(createDbMiddleware(getDbRW));
  
  router.get('/api/data', (req, res) => {
    if (!req.db) {
      return res.status(503).json({ error: 'Database not available' });
    }
    
    const data = req.db.getSomeData();
    res.json(data);
  });
  
  return router;
}
```

**Option B**: Per-Route Pattern

```javascript
const { getDbOrError } = require('../../db/dbAccess');

function createMyRouter({ getDbRW }) {
  const router = express.Router();
  
  router.get('/api/data', (req, res) => {
    const db = getDbOrError(getDbRW, res);
    if (!db) return; // Error already sent to client
    
    const data = db.getSomeData();
    res.json(data);
  });
  
  return router;
}
```

**When to use which**:
- **Middleware**: All routes need database access
- **Per-Route**: Only some routes need database, or custom error handling needed

**Migration Example**:

```javascript
// ❌ OLD PATTERN (inconsistent, no error handling)
router.get('/api/data', (req, res) => {
  const db = req.app.get('newsDb'); // May be undefined!
  const data = db.getSomeData(); // Crashes if db is null
  res.json(data);
});

// ✅ NEW PATTERN (consistent, with error handling)
router.use(createDbMiddleware(getDbRW));
router.get('/api/data', (req, res) => {
  if (!req.db) {
    return res.status(503).json({ error: 'Database not available' });
  }
  const data = req.db.getSomeData();
  res.json(data);
});
```

---

### 3. Background Services & Long-Running Processes

**Use**: `openNewsDb()` — Manual lifecycle control

```javascript
const { openNewsDb } = require('./db/dbAccess');

class MyBackgroundService {
  constructor() {
    this.db = null;
  }
  
  async start() {
    this.db = openNewsDb(); // Open connection
    console.log('Service started with database connection');
  }
  
  async processData() {
    if (!this.db) {
      throw new Error('Service not started');
    }
    
    const data = this.db.db.prepare('SELECT * FROM articles LIMIT 100').all();
    // Process data...
  }
  
  async stop() {
    if (this.db) {
      this.db.close(); // Manually close when service stops
      this.db = null;
    }
  }
}
```

**When to use**:
- ✅ Service holds database connection for its lifetime
- ✅ Need explicit control over connection lifecycle
- ✅ Connection shared across multiple operations

**Warning**: Always remember to call `db.close()` in cleanup/shutdown!

---

### 4. Health Checks & Monitoring

**Use**: `isDbAvailable()` — Non-throwing check

```javascript
const { isDbAvailable } = require('./db/dbAccess');

router.get('/health', (req, res) => {
  const dbAvailable = isDbAvailable(() => req.app.get('newsDb'));
  
  res.json({
    status: dbAvailable ? 'healthy' : 'degraded',
    database: dbAvailable ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString()
  });
});
```

**Benefits**:
- ✅ Never throws exceptions
- ✅ Safe for health check endpoints
- ✅ Works with any `getDbRW`-style function

---

## Complete Migration Guide

### Step 1: Identify Pattern in File

```powershell
# Find all database access patterns
Select-String -Path "src/**/*.js" -Pattern "new NewsDatabase|openDbReadOnly|getDbRW" -Context 2,2
```

### Step 2: Choose Correct Helper

| Current Pattern | File Type | New Helper |
|----------------|-----------|------------|
| `new NewsDatabase(dbPath)` | CLI tool | `withNewsDb()` |
| `new NewsDatabase(dbPath)` | Service class | `openNewsDb()` |
| `req.app.get('newsDb')` | Express route | `createDbMiddleware()` or `getDbOrError()` |
| `getDbRW()` directly | Express route | Already correct (optionally wrap) |

### Step 3: Update Imports

```javascript
// ❌ OLD
const NewsDatabase = require('./db/sqlite/SQLiteNewsDatabase');
const { openDbReadOnly } = require('./db/utils');

// ✅ NEW
const { withNewsDb, openNewsDb, createDbMiddleware, getDbOrError } = require('./db/dbAccess');
```

### Step 4: Update Code

See examples above for each pattern.

### Step 5: Test

```bash
# Run tests to verify migration
npm test -- <test-file-for-migrated-module>

# Or run full suite
npm test
```

---

## Real-World Migration Examples

### Example 1: CLI Tool Migration

**File**: `src/tools/discover-news-websites.js` (line 197)

```javascript
// ❌ BEFORE
const NewsDatabase = require('../db/sqlite/SQLiteNewsDatabase');
const dbPath = path.join(process.cwd(), 'data', 'news.db');
const db = new NewsDatabase(dbPath);

try {
  const discoveryService = new NewsWebsiteDiscovery(db, discoveryOptions);
  const discovered = await discoveryService.run(runOptions);
  console.log(`Discovered ${discovered.length} news websites`);
} finally {
  db.close();
}

// ✅ AFTER
const { withNewsDb } = require('../db/dbAccess');

withNewsDb(null, async (db) => {
  const discoveryService = new NewsWebsiteDiscovery(db, discoveryOptions);
  const discovered = await discoveryService.run(runOptions);
  console.log(`Discovered ${discovered.length} news websites`);
}); // Automatic cleanup!
```

**Lines Reduced**: 8 → 5 (37.5% reduction)

---

### Example 2: Express Router Migration

**File**: `src/ui/express/routes/api.news-websites.js` (line 1-197)

```javascript
// ❌ BEFORE (inconsistent pattern)
const router = express.Router();

router.get('/api/news-websites', (req, res) => {
  const db = req.app.get('newsDb'); // May be undefined!
  if (!db) {
    return res.status(503).json({ error: 'Database not available' });
  }
  const websites = db.getNewsWebsites();
  res.json(websites);
});

// ✅ AFTER (factory pattern with middleware)
const { createDbMiddleware } = require('../../db/dbAccess');

function createNewsWebsitesRouter({ getDbRW }) {
  const router = express.Router();
  
  // Add db to all routes
  router.use(createDbMiddleware(getDbRW));
  
  router.get('/api/news-websites', (req, res) => {
    if (!req.db) {
      return res.status(503).json({ error: 'Database not available' });
    }
    const websites = req.db.getNewsWebsites();
    res.json(websites);
  });
  
  return router;
}

module.exports = { createNewsWebsitesRouter };
```

**Benefits**:
- ✅ Consistent pattern across all 5 endpoints
- ✅ Clear error handling
- ✅ Dependency injection (testable)
- ✅ No more 503 errors from undefined `newsDb`

---

### Example 3: Service Class Migration

**File**: `src/services/NewsWebsiteDiscovery.js` (line 14-30)

```javascript
// ✅ ALREADY CORRECT (accepts db in constructor)
class NewsWebsiteDiscovery {
  constructor(db, options = {}) {
    this.db = db; // Receives db from caller
    // ...
  }
  
  analyzeDomain(host) {
    // Uses this.db...
  }
}

// ✅ Usage in CLI tool (with automatic cleanup)
const { withNewsDb } = require('../db/dbAccess');

withNewsDb(null, async (db) => {
  const service = new NewsWebsiteDiscovery(db);
  const results = await service.run();
  console.log(results);
});
```

**No change needed** — Service class correctly receives db as dependency!

---

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Forgetting to Close

```javascript
// ❌ WRONG - memory leak!
function analyzeDatabase() {
  const db = new NewsDatabase('data/news.db');
  const count = db.getCount();
  return count;
  // db.close() never called!
}

// ✅ CORRECT - automatic cleanup
function analyzeDatabase() {
  return withNewsDb(null, (db) => {
    return db.getCount();
  }); // Automatically closed!
}
```

---

### ❌ Anti-Pattern 2: Re-opening Database in Loop

```javascript
// ❌ WRONG - opens db 100 times!
for (let i = 0; i < 100; i++) {
  const db = new NewsDatabase('data/news.db');
  const article = db.getArticle(i);
  console.log(article);
  db.close();
}

// ✅ CORRECT - open once
withNewsDb(null, (db) => {
  for (let i = 0; i < 100; i++) {
    const article = db.getArticle(i);
    console.log(article);
  }
});
```

---

### ❌ Anti-Pattern 3: Inconsistent Express Pattern

```javascript
// ❌ WRONG - inconsistent across routes
router.get('/route1', (req, res) => {
  const db = req.app.get('newsDb');
  // ...
});

router.get('/route2', (req, res) => {
  const db = getDbRW();
  // ...
});

// ✅ CORRECT - consistent middleware pattern
router.use(createDbMiddleware(getDbRW));
router.get('/route1', (req, res) => {
  if (!req.db) return res.status(503).json({ error: 'Database not available' });
  // Use req.db
});
router.get('/route2', (req, res) => {
  if (!req.db) return res.status(503).json({ error: 'Database not available' });
  // Use req.db
});
```

---

## Testing Database Access

### Unit Tests with Mock Database

```javascript
const { createDbMiddleware, getDbOrError } = require('../dbAccess');

describe('MyRouter', () => {
  test('should handle database unavailable', () => {
    const getDbRW = jest.fn().mockReturnValue(null);
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    const db = getDbOrError(getDbRW, res);
    
    expect(db).toBeNull();
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
```

### Integration Tests with Real Database

```javascript
const { withNewsDb } = require('../dbAccess');

describe('Database Integration', () => {
  test('should query real database', async () => {
    const count = await withNewsDb(null, (db) => {
      return db.getCount();
    });
    
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
```

---

## Performance Considerations

### Connection Pooling

- ✅ `getDbRW()` in Express uses **singleton pattern** (one connection per server)
- ✅ `withNewsDb()` opens **new connection** (suitable for isolated tasks)
- ✅ `openNewsDb()` allows **manual control** (for long-lived services)

### When to Use Which

| Scenario | Helper | Reason |
|----------|--------|--------|
| 100+ requests/sec | `getDbRW()` (Express) | Singleton avoids connection churn |
| Nightly batch job | `withNewsDb()` | Isolated connection, auto-cleanup |
| Background service | `openNewsDb()` | Persistent connection |
| Health check | `isDbAvailable()` | Lightweight, non-throwing |

---

## Troubleshooting

### Issue: "Database is locked"

**Cause**: Multiple connections trying to write simultaneously

**Solution**: Use `getDbRW()` singleton in Express routes

```javascript
// ❌ WRONG - creates new connection per request
router.get('/api/data', (req, res) => {
  withNewsDb(null, (db) => {
    const data = db.getSomeData();
    res.json(data);
  });
});

// ✅ CORRECT - uses singleton
router.use(createDbMiddleware(getDbRW));
router.get('/api/data', (req, res) => {
  const data = req.db.getSomeData();
  res.json(data);
});
```

---

### Issue: "Cannot read property 'db' of null"

**Cause**: Database not initialized before use

**Solution**: Check availability before accessing

```javascript
// ❌ WRONG - assumes db exists
router.get('/api/data', (req, res) => {
  const data = req.db.getSomeData(); // Crashes if req.db is null
  res.json(data);
});

// ✅ CORRECT - checks first
router.get('/api/data', (req, res) => {
  if (!req.db) {
    return res.status(503).json({ error: 'Database not available' });
  }
  const data = req.db.getSomeData();
  res.json(data);
});
```

---

### Issue: Memory leaks from unclosed connections

**Cause**: Using `openNewsDb()` without calling `close()`

**Solution**: Use `withNewsDb()` for automatic cleanup

```javascript
// ❌ WRONG - forgets to close
function myTask() {
  const db = openNewsDb();
  const data = db.getSomeData();
  return data;
  // db.close() never called!
}

// ✅ CORRECT - automatic cleanup
function myTask() {
  return withNewsDb(null, (db) => {
    return db.getSomeData();
  }); // Automatically closed
}
```

---

## Summary

### ✅ Do This

| Context | Helper | Reason |
|---------|--------|--------|
| CLI tools | `withNewsDb()` | Auto-cleanup |
| Express routes | `createDbMiddleware()` | Consistent pattern |
| Services | `openNewsDb()` | Manual control |
| Health checks | `isDbAvailable()` | Safe checking |

### ❌ Don't Do This

- ❌ Direct `new NewsDatabase()` in CLI tools (use `withNewsDb()`)
- ❌ `req.app.get('newsDb')` in routes (use middleware)
- ❌ Forgetting to call `db.close()` (use `withNewsDb()`)
- ❌ Re-opening database in loops (open once outside loop)
- ❌ Inconsistent patterns across files (pick one and stick to it)

---

## Migration Checklist

- [ ] Audit all files for database access patterns
- [ ] Update CLI tools to use `withNewsDb()`
- [ ] Convert Express routes to middleware pattern
- [ ] Update service classes to use dependency injection
- [ ] Add error handling for database unavailability
- [ ] Run test suite to verify migrations
- [ ] Update documentation and code comments
- [ ] Remove old import statements

---

**Next Steps**:
1. Review this guide with team
2. Begin migration starting with highest-impact files
3. Run tests after each file migration
4. Update AGENTS.md when migration complete

