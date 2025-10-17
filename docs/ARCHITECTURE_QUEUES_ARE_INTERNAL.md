# Architecture: Queues are Internal to Crawls

**Date**: October 14, 2025  
**Status**: Architectural Clarification  
**When to Read**: When working with crawl resume functionality, queue display, or terminology in UI/API

---

## Core Principle

**Queues are implementation details of crawls, not user-facing entities.**

Users interact with **crawls** (operations that fetch content from websites). Each crawl internally maintains a queue of URLs to visit, but users don't directly manipulate queues.

---

## Correct Terminology

### ✅ **User-Facing (What users see and control)**

- **Crawl** - A web crawling operation
  - Examples: "Start crawl", "Resume crawl", "Pause crawl"
  - Database: `crawl_jobs` table
  - UI: "Resume Crawls" section
  - Actions: Resume, pause, stop, clear incomplete crawls

- **Crawl job** - Technical term for a crawl record
  - Used in code and logs
  - Each has: `id`, `url`, `status`, `started_at`, `ended_at`

### ❌ **Internal Implementation (Users don't directly control)**

- **Queue** - Internal data structure within a crawl
  - Used by crawler to track URLs to visit
  - Database: `queue_events` table (events within a crawl)
  - Not exposed as controllable entity in UI
  - Users never "resume a queue" - they "resume a crawl"

- **Queue events** - Individual URL visits within a crawl
  - Recorded in `queue_events` table
  - Linked to crawl via `job_id` foreign key
  - Examples: "discovered URL", "visited URL", "found links"

---

## Architecture: How Queues Fit Into Crawls

```
Crawl (User-Facing Entity)
├── Crawl Job Record (crawl_jobs table)
│   ├── id: TEXT (primary key)
│   ├── url: TEXT (starting URL)
│   ├── status: TEXT ('running', 'completed', 'paused')
│   ├── started_at: INTEGER
│   ├── ended_at: INTEGER
│   └── args: TEXT (JSON configuration)
│
└── Internal Queue (Implementation Detail)
    ├── Queue Manager (QueueManager.js)
    │   ├── In-memory: URLs pending visit
    │   ├── Priority: discovery vs acquisition
    │   └── Heatmap: Domain rate limiting
    │
    └── Queue Events (queue_events table)
        ├── job_id: TEXT (foreign key → crawl_jobs.id)
        ├── action: TEXT ('discovered', 'visited', 'saved')
        ├── url: TEXT
        ├── depth: INTEGER
        └── ts: INTEGER (timestamp)
```

---

## Database Schema Relationship

```sql
-- User-facing: Crawl jobs
CREATE TABLE crawl_jobs (
  id TEXT PRIMARY KEY,           -- Crawl identifier
  url TEXT,                      -- Starting URL for crawl
  status TEXT,                   -- 'running', 'completed', 'paused'
  started_at INTEGER,
  ended_at INTEGER,
  args TEXT                      -- JSON: {maxPages, depth, etc}
);

-- Internal: Queue events within crawls
CREATE TABLE queue_events (
  id INTEGER PRIMARY KEY,
  job_id TEXT,                   -- Which crawl this belongs to
  action TEXT,                   -- 'discovered', 'visited', 'saved'
  url TEXT,                      -- URL being processed
  depth INTEGER,
  ts INTEGER,
  FOREIGN KEY (job_id) REFERENCES crawl_jobs(id)
);
```

**Key Point**: `queue_events` are **owned by** `crawl_jobs`. You can't have queue events without a parent crawl.

---

## API Design: Resume Functionality

### Current API (October 2025)

```javascript
// GET /api/resume-all - List incomplete crawls
{
  "total": 3,
  "runningJobs": 1,
  "availableSlots": 7,
  "recommendedIds": ["abc123", "def456"],
  "queues": [  // ⚠️ MISLEADING NAME - these are crawl jobs, not queues
    {
      "id": "abc123",
      "url": "https://example.com",
      "state": "recommended",
      "domain": "example.com",
      "queueSize": 45,  // Internal queue size (URLs pending)
      "visited": 120
    }
  ]
}

// POST /api/resume-all - Resume selected crawls
{
  "queueIds": ["abc123"]  // ⚠️ MISLEADING NAME - these are crawl job IDs
}
```

### ⚠️ Terminology Issues in Current API

**Problem**: API uses "queue" terminology but actually operates on crawl jobs:
- Response field `queues` → Should conceptually be `crawls` or `jobs`
- Request field `queueIds` → Should be `crawlIds` or `jobIds`
- Variable names throughout code: `incompleteQueues` → actually crawl jobs

**Why Not Fixed**: Breaking change. Clients expect these field names.

**Mitigation**: 
1. Add JSDoc comments explaining: "`queues` here means incomplete crawl jobs"
2. Update UI text to use "crawl" terminology
3. Consider API v2 with corrected terminology

---

## UI Terminology Standards

### ✅ Correct Usage

| Context | Use | Don't Use |
|---------|-----|-----------|
| Section header | "Resume Crawls" | "Resume Queues" |
| Button text | "Resume 2 crawls" | "Resume 2 queues" |
| Status message | "Checking paused crawls…" | "Checking paused queues…" |
| Empty state | "No incomplete crawls" | "No incomplete queues" |
| Action button | "Clear Crawls" | "Clear Queues" |
| Meta info | "visited: 120" | "queue: 45 visited: 120" ❓ |

### Queue Size in Meta

**Question**: Should "queue: 45" be shown to users?

**Answer**: Acceptable if clarified:
- ✅ "pending: 45" (clearer - URLs pending visit)
- ✅ "queue: 45 (URLs to visit)" (with explanation)
- ❌ "queue: 45" (ambiguous without context)

**Current approach**: Show "pending" instead of "queue" in UI.

---

## Code Implementation: Variable Naming

### Current Pattern (Confusing)

```javascript
// ❌ Variable name implies queues, actually crawl jobs
const incompleteQueues = listIncompleteCrawlJobs(db);

// API sends crawl jobs but calls them "queues"
res.json({
  queues: incompleteQueues  // ❌ Misleading
});
```

### Recommended Pattern

```javascript
// ✅ Variable name matches reality
const incompleteCrawls = listIncompleteCrawlJobs(db);

// ✅ Add comment explaining legacy API field name
res.json({
  queues: incompleteCrawls  // Legacy field name, actually crawl jobs
});
```

### Gradual Migration Strategy

1. **Phase 1** (Current): Update UI text only
   - Change "Resume Queues" → "Resume Crawls"
   - Change button text, messages, status text
   - Keep API field names unchanged (no breaking change)

2. **Phase 2** (Future): Add new API fields
   - Add `crawls` field alongside `queues`
   - Deprecate `queues` field
   - Document migration path

3. **Phase 3** (Future): Update variable names
   - Rename `incompleteQueues` → `incompleteCrawls`
   - Rename `queueIds` → `crawlIds`
   - Update all internal code

---

## Testing Implications

### What to Test

```javascript
// ✅ Test crawl resume functionality
test('should resume incomplete crawls', () => {
  // Create incomplete crawl job
  const crawlId = startCrawl({ url: 'https://example.com' });
  
  // Pause it (simulate incomplete)
  pauseCrawl(crawlId);
  
  // Resume it
  const result = resumeCrawl(crawlId);
  
  expect(result.resumed).toBe(1);
});

// ✅ Test that queue state is restored
test('should restore internal queue when resuming crawl', () => {
  const crawlId = startCrawl({ url: 'https://example.com' });
  
  // Let it discover some URLs (populate internal queue)
  waitForDiscovery(crawlId, { minUrls: 10 });
  
  // Pause and resume
  pauseCrawl(crawlId);
  resumeCrawl(crawlId);
  
  // Verify internal queue state restored
  const queueEvents = getQueueEvents(crawlId);
  expect(queueEvents.length).toBeGreaterThan(0);
});
```

### What NOT to Test

```javascript
// ❌ Don't test "queue resume" - queues aren't resumable entities
test('should resume queue', () => {  // Wrong mental model
  // Queues don't have independent lifecycle
});

// ✅ Instead, test crawl resume (which restores queue state)
test('should resume crawl and restore queue state', () => {
  // Correct mental model: crawls are resumable, queues are internal
});
```

---

## Documentation Updates Needed

1. **ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md**
   - Add section: "Queues are Internal to Crawls"
   - Clarify that queue_events table is subordinate to crawl_jobs

2. **API_ENDPOINT_REFERENCE.md**
   - Add note: "`queues` field in response actually represents incomplete crawl jobs"
   - Document future migration to `crawls` field name

3. **SERVICE_LAYER_ARCHITECTURE.md**
   - Rename `QueuePlannerService` → `CrawlResumeService` (or add alias)
   - Update method names: `planResumeQueues` → `planResumeCrawls`

4. **AGENTS.md**
   - Add rule: "Use 'crawl' terminology in UI, 'queue' only for internal implementation"
   - Update testing guidelines to reflect correct mental model

---

## Summary

- ✅ **Crawls** are user-facing entities that users start, pause, resume, clear
- ✅ **Queues** are internal implementation details of how crawls track URLs to visit
- ✅ Users control crawls, not queues
- ✅ Database: `crawl_jobs` (user-facing) owns `queue_events` (internal)
- ✅ UI should say "Resume Crawls", not "Resume Queues"
- ❌ **Never** present queues as independently controllable entities in UI

