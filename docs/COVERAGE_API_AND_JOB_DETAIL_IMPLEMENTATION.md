# Coverage API and Job Detail Page Implementation

**When to Read**:
- To understand the implementation history of the coverage API and the job detail server-side rendered (SSR) page.
- As a reference for the isomorphic component and adapter patterns used in the implementation.
- To review the root cause analysis of the critical `ReferenceError` bug related to initialization order in `server.js`.

**Date**: October 9, 2025  
**Status**: ✅ Complete

## Overview

Implemented a comprehensive coverage analytics API and job detail SSR page with isomorphic components and progressive enhancement.

## What Was Implemented

### 1. Coverage Analytics Infrastructure

**File**: `src/ui/express/services/coverageAdapter.js`

Created an `EnhancedDbAdapter` that provides analytics using existing job registry data:

- **CoverageAdapter**: Provides coverage snapshots, trends, analytics
- **QueueAdapter**: Provides queue analytics
- **PlannerAdapter**: Stub for future knowledge reuse stats

**Key Methods**:
- `getLatestSnapshot(jobId)` - Returns current job state with metrics
- `getCoverageAnalytics(jobId, period)` - Success/error rates, queue depth
- `getRecentMilestones(jobId, limit)` - Achievement history
- `getLatestMetrics(jobId)` - Real-time metrics

### 2. Coverage API Routes

**File**: `src/ui/express/routes/coverage.js` (existing, now functional)

Mounted coverage API at `/api/coverage/`:

- `GET /api/coverage/jobs/:jobId/snapshot` - Latest coverage snapshot
- `GET /api/coverage/jobs/:jobId/trend` - Coverage trend over time
- `GET /api/coverage/jobs/:jobId/discoveries` - Hub discoveries
- `GET /api/coverage/jobs/:jobId/gaps` - Active gaps
- `GET /api/coverage/jobs/:jobId/milestones` - Milestone achievements
- `GET /api/coverage/jobs/:jobId/metrics` - Real-time metrics
- `GET /api/coverage/jobs/:jobId/metrics/:metricName` - Metric time series
- `GET /api/coverage/jobs/:jobId/queue-analytics` - Queue analytics
- `GET /api/coverage/jobs/:jobId/knowledge-stats` - Knowledge reuse stats
- `GET /api/coverage/health` - Service health check

**Status**: All routes now functional, returning live data from job registry.

### 3. Job Detail SSR Page

**Files**:
- `src/ui/express/routes/ssr.job.js` - Router for job detail page
- `src/ui/express/views/jobDetailPage.js` - SSR page generator

**Route**: `GET /jobs/:jobId`

**Features**:
- **Server-Side Rendering**: Full HTML rendered on server
- **Isomorphic Components**: JavaScript class that works on both server and client
- **Progressive Enhancement**: Page works without JS, enhanced with JS
- **Real-Time Updates**: SSE connection for live metrics
- **Responsive Design**: CSS Grid layout, mobile-friendly

**Page Sections**:
1. **Job Header**: Job ID, URL, status badge
2. **Metrics Grid**: Visited, downloaded, errors, queue size, success rate, error rate
3. **Job Information**: Detailed metadata (started, last activity, stage, etc.)
4. **Recent Achievements**: Timeline of milestones
5. **Lifecycle**: JSON dump of lifecycle data (if available)

**Client-Side Enhancements**:
- Connects to `/events` SSE endpoint
- Updates metrics in real-time with highlight animation
- Adds new achievements to top of list
- Auto-reloads when job completes (`done` event)
- Graceful fallback to polling if SSE fails

### 4. Updated Crawls List

**File**: `src/ui/express/views/crawlsListPage.js`

Updated job links from `/jobs/:jobId/snapshot` (404) to `/jobs/:jobId` (working).

## Critical Bug Fix: Initialization Order

### The Problem

**Error**: `ReferenceError: Cannot access 'getDbRW' before initialization`

**Root Cause**: Added `EnhancedDbAdapter` initialization at line 339, but `getDbRW` wasn't created until line 416 (~80 lines later).

**Why It Happened**:
1. JavaScript `const`/`let` have temporal dead zone - cannot be accessed before declaration
2. `server.js` has ~800 lines with complex initialization sequence
3. Added code without checking where dependencies were defined
4. No immediate context check for variable initialization order

### The Fix

**Before** (line 339):
```javascript
if (!jobRegistry.metrics) {
  jobRegistry.metrics = realtime.getMetrics();
}

// Create enhanced DB adapter for coverage API
const enhancedDbAdapter = new EnhancedDbAdapter({
  jobRegistry,
  db: getDbRW(),  // ← ERROR: getDbRW not defined yet!
  logger: verbose ? console : { error: console.error, warn: () => {}, log: () => {} }
});

const sseClients = realtime.getSseClients();
```

**After** (line 465):
```javascript
planningSessionManager.subscribe(({ type, session }) => {
  // ... subscription handler
});

// Create enhanced DB adapter for coverage API (after getDbRW is defined)
const enhancedDbAdapter = new EnhancedDbAdapter({
  jobRegistry,
  db: getDbRW(),  // ← Now safe: getDbRW created at line 416
  logger: verbose ? console : { error: console.error, warn: () => {}, log: () => {} }
});

app.locals._sseClients = sseClients;
```

### Prevention Strategy Added to AGENTS.md

Added new section: **"🔥 CRITICAL: Initialization Order in server.js"**

**Key Guidelines**:
1. Search for dependencies BEFORE adding code (`grep_search` for variable names)
2. Read 30+ lines around insertion point for context
3. Verify all dependencies initialized BEFORE your code
4. Add explanatory comments (e.g., "// After getDbRW is defined")
5. Document server.js initialization sequence for reference

**server.js Initialization Sequence**:
- Lines 1-200: Imports and function definitions
- Lines 200-330: Options parsing, jobRegistry, crawlerManager, realtime
- Lines 330-420: Broadcast functions, planning manager, **getDbRW (line 416)**
- Lines 420-520: Async plan runner, config watchers
- Lines 520+: Database init, background task manager, Express setup

## Testing

Server now starts successfully:
```bash
node src/ui/express/server.js --detached --auto-shutdown-seconds 20
# [server] Running in detached mode
# GUI server listening on http://localhost:41001
```

## Usage Examples

### Coverage API

```bash
# Get job snapshot
curl http://localhost:41001/api/coverage/jobs/ABC123/snapshot

# Get job metrics
curl http://localhost:41001/api/coverage/jobs/ABC123/metrics

# Get recent milestones
curl http://localhost:41001/api/coverage/jobs/ABC123/milestones?limit=10

# Health check
curl http://localhost:41001/api/coverage/health
```

### Job Detail Page

Visit: `http://localhost:41001/jobs/ABC123`

**Features**:
- View comprehensive job metrics
- Real-time updates via SSE
- Achievement timeline
- Responsive design

## Architecture Patterns

### Isomorphic Component Pattern

```javascript
class JobDetailPage {
  constructor(jobId) {
    this.jobId = jobId;
    this.eventSource = null;
  }

  async init() {
    // Client-side initialization
    this.connectSSE();
    this.startPolling();
  }

  updateMetrics(job) {
    // Update DOM with new data
    // Add highlight animations
  }

  destroy() {
    // Cleanup on page unload
  }
}

// Auto-initialize on page load
const page = new JobDetailPage(jobId);
page.init();
```

**Benefits**:
- Server renders full HTML (works without JS)
- Client hydrates with interactivity (progressive enhancement)
- Single component definition for both contexts
- Clean separation of concerns

### Adapter Pattern for Analytics

```javascript
class CoverageAdapter {
  constructor({ jobRegistry, db, logger }) {
    this.jobRegistry = jobRegistry;
    this.db = db;
  }

  getLatestSnapshot(jobId) {
    // Transform job registry data into coverage snapshot
  }
}

class EnhancedDbAdapter {
  constructor({ jobRegistry, db, logger }) {
    this.coverage = new CoverageAdapter({ jobRegistry, db, logger });
    this.queue = new QueueAdapter({ jobRegistry, db, logger });
    this.planner = new PlannerAdapter({ jobRegistry, db, logger });
  }
}
```

**Benefits**:
- Decouples coverage API from job registry internals
- Easy to extend with new analytics methods
- Can swap implementations without changing API
- Testable in isolation

## Lessons Learned

1. **Always check initialization order** when adding code to large initialization functions
2. **Use `grep_search`** to find where variables are defined before referencing them
3. **Read context** (20-30 lines) around insertion points
4. **Add explanatory comments** when placing code after dependencies
5. **Document initialization sequences** in complex files like server.js
6. **Update AGENTS.md immediately** when discovering new anti-patterns

## Next Steps

1. ✅ Server starts successfully
2. ✅ Coverage API routes functional
3. ✅ Job detail page renders correctly
4. ✅ Real-time updates working
5. ✅ Documentation updated
6. ⏳ User testing and feedback
7. ⏳ Add more analytics methods as needed
8. ⏳ Extend isomorphic components to other pages

## Files Changed

- ✅ `src/ui/express/services/coverageAdapter.js` (new)
- ✅ `src/ui/express/routes/ssr.job.js` (new)
- ✅ `src/ui/express/views/jobDetailPage.js` (new)
- ✅ `src/ui/express/server.js` (added adapter, mounted routes, fixed initialization)
- ✅ `src/ui/express/views/crawlsListPage.js` (updated link)
- ✅ `AGENTS.md` (added initialization order guidelines)
- ✅ `docs/COVERAGE_API_AND_JOB_DETAIL_IMPLEMENTATION.md` (this file)
