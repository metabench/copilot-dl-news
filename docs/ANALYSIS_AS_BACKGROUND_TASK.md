# Analysis as Background Task

**Status**: ✅ **Implemented** (October 2025)  
**Integration**: Analysis runs can now execute as background tasks with full pause/resume support

**⚠️ IMPORTANT**: Background tasks are **separate from crawls** (see `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`). Analysis tasks process existing article data, while crawls fetch new articles from websites.

**When to Read**:
- Planning or maintaining analysis workflows that should run through `BackgroundTaskManager`
- Extending the analysis task UI/API (pause/resume, status pages) or triaging related bugs
- Auditing how legacy child-process analysis compares to the background-task implementation

---

## Overview

Analysis runs have been integrated into the BackgroundTaskManager framework, enabling them to run as long-running background tasks with persistence, progress tracking, pause/resume capabilities, and error recovery. This provides a more robust and user-friendly experience compared to the previous child process approach.

**Key Benefit**: Analysis modules remain lightweight and reusable throughout the system (for targeted analysis, planning, decision-making), while full analysis runs benefit from background task infrastructure.

---

## Architecture

### Dual Approach

The system now supports **two methods** for running analysis:

1. **Child Process (Legacy)** - `POST /api/analysis/start`
   - Spawns analysis-run.js as child process
   - Real-time stdout/stderr streaming
   - Progress tracking via stdout parsing
   - Legacy compatibility maintained

2. **Background Task (New)** - `POST /api/analysis/start-background` ✨
   - Runs via BackgroundTaskManager
   - Persistent task state in database
   - Pause/resume support
   - Better progress tracking
   - Survives server restarts
   - Integrated with background tasks UI

### Component Integration

```
Analysis System Architecture:

┌─────────────────────────────────────────────────────────┐
│  Analysis Modules (Core, Lightweight, Reusable)        │
│  • analyse-pages-core.js - Page analysis logic          │
│  • page-analyzer.js - Single page analysis              │
│  • place-extraction.js - Place detection                │
│  • deep-analyzer.js - Content quality analysis          │
│  • milestones.js - Achievement tracking                 │
│                                                          │
│  Used by: Crawler planning, targeted analysis,          │
│           decision-making systems                       │
└─────────────────────────────────────────────────────────┘
                          ↓ Uses
┌─────────────────────────────────────────────────────────┐
│  Analysis Orchestration (Two Paths)                     │
├─────────────────────────────────────────────────────────┤
│  Path 1: Child Process (Legacy)                         │
│  • analysis-run.js - CLI orchestrator                   │
│  • Spawned via analysisRunner.start()                   │
│  • Progress via stdout/stderr                           │
│                                                          │
│  Path 2: Background Task (New) ✨                       │
│  • AnalysisTask.js - BackgroundTask adapter             │
│  • Managed by BackgroundTaskManager                     │
│  • Progress via onProgress callbacks                    │
│  • Pause/resume/cancel support                          │
└─────────────────────────────────────────────────────────┘
                          ↓ Consumed by
┌─────────────────────────────────────────────────────────┐
│  API Endpoints                                           │
│  • POST /api/analysis/start (child process)             │
│  • POST /api/analysis/start-background (bg task) ✨     │
│  • GET /api/background-tasks/:id (task status)          │
│  • POST /api/background-tasks/:id/pause                 │
│  • POST /api/background-tasks/:id/resume                │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Details

### 1. AnalysisTask Class

**File**: `src/background/tasks/AnalysisTask.js` (330 lines)

**Purpose**: Wraps analysis logic to work with BackgroundTaskManager

**Key Features**:
- Orchestrates page analysis → domain analysis → milestone awarding
- Reports progress via `onProgress` callbacks
- Supports pause/resume (sets flag, checks during execution)
- Handles cancellation via `AbortSignal`
- Tracks statistics (pages processed, places extracted, milestones awarded)

**Configuration Options**:
```javascript
{
  analysisVersion: 1,        // Analysis algorithm version
  pageLimit: 0,              // Max pages (0 = unlimited)
  domainLimit: 0,            // Max domains (0 = unlimited)
  skipPages: false,          // Skip page analysis
  skipDomains: false,        // Skip domain analysis
  skipMilestones: false,     // Skip milestone awarding
  verbose: false,            // Enable verbose logging
  dbPath: './data/news.db'   // Database path
}
```

**Stages**:
1. **starting** - Initialize, count total work
2. **page-analysis** - Analyze article content (calls `analysePages()`)
3. **domain-analysis** - Aggregate to domain level (placeholder for now)
4. **milestones** - Award achievements (calls `awardMilestones()`)
5. **completed** - Final summary

**Progress Reporting**:
```javascript
{
  current: 50,                    // Current progress (pages processed)
  total: 100,                     // Total work items
  message: "Pages: 50/100",       // Human-readable message
  metadata: {
    stage: 'page-analysis',       // Current stage
    stats: {
      pagesProcessed: 50,
      pagesUpdated: 45,
      placesExtracted: 120,
      domainsAnalyzed: 0,
      milestonesAwarded: 0,
      errors: 0
    }
  }
}
```

### 2. Task Registration

**File**: `src/ui/express/server.js`

**Registration Code**:
```javascript
// Import AnalysisTask
const { AnalysisTask } = require('../../background/tasks/AnalysisTask');

// Register with BackgroundTaskManager
backgroundTaskManager.registerTaskType('analysis-run', AnalysisTask, {
  dbPath: urlsDbPath  // Injected as registration option
});
```

**Why This Works**:
- `AnalysisTask` constructor receives `options.config` from registration
- `dbPath` is merged into task instance options
- Each task instance gets fresh database connection

### 3. API Endpoint

**File**: `src/ui/express/routes/api.analysis-control.js`

**Endpoint**: `POST /api/analysis/start-background`

**Request Body**:
```json
{
  "analysisVersion": 1,
  "pageLimit": 1000,
  "domainLimit": 0,
  "skipPages": false,
  "skipDomains": false,
  "skipMilestones": false,
  "verbose": false
}
```

**Response** (202 Accepted):
```json
{
  "success": true,
  "taskId": 42,
  "runId": "analysis-2025-10-07T12:34:56-789Z",
  "taskUrl": "/api/background-tasks/42",
  "detailUrl": "/analysis/analysis-2025-10-07T12:34:56-789Z/ssr",
  "apiUrl": "/api/analysis/analysis-2025-10-07T12:34:56-789Z",
  "message": "Analysis started as background task"
}
```

**Implementation**:
```javascript
router.post('/api/analysis/start-background', (req, res) => {
  const backgroundTaskManager = req.app.locals?.backgroundTaskManager;
  
  if (!backgroundTaskManager) {
    return res.status(503).json({ 
      error: 'Background task manager not available' 
    });
  }
  
  const config = { /* build from req.body */ };
  const taskId = backgroundTaskManager.createTask('analysis-run', config);
  
  backgroundTaskManager.startTask(taskId).catch(err => {
    console.error(`Background task ${taskId} failed:`, err);
  });
  
  res.status(202).json({ /* task info */ });
});
```

### 4. Task Definition

**File**: `src/background/tasks/taskDefinitions.js`

**Purpose**: Schema for background tasks UI (property editor)

**Definition**:
```javascript
'analysis-run': {
  taskType: 'analysis-run',
  title: 'Run Content Analysis',
  description: 'Analyze article content for places, topics, quality metrics, and award milestones',
  icon: '🔍',
  fields: [
    {
      name: 'analysisVersion',
      label: 'Analysis Version',
      type: FieldType.NUMBER,
      default: 1,
      min: 1,
      max: 10,
      required: true,
      description: 'Analysis algorithm version to use'
    },
    // ... more fields
  ]
}
```

**Usage**: Enables creating analysis tasks from the background tasks UI with proper validation

---

## Usage Examples

### Starting Analysis as Background Task

**Via API**:
```bash
curl -X POST http://localhost:41000/api/analysis/start-background \
  -H "Content-Type: application/json" \
  -d '{
    "analysisVersion": 1,
    "pageLimit": 500,
    "verbose": true
  }'
```

**Via UI** (Background Tasks Page):
1. Navigate to `/background-tasks`
2. Click "Create Task"
3. Select "Run Content Analysis"
4. Configure parameters
5. Click "Start Task"

**Via Code** (within server):
```javascript
const taskId = backgroundTaskManager.createTask('analysis-run', {
  analysisVersion: 1,
  pageLimit: 1000,
  skipPages: false,
  skipDomains: false,
  skipMilestones: false,
  verbose: false,
  dbPath: './data/news.db'
});

await backgroundTaskManager.startTask(taskId);
```

### Monitoring Progress

**Via API**:
```bash
# Get task details
curl http://localhost:41000/api/background-tasks/42

# Response:
{
  "success": true,
  "task": {
    "id": 42,
    "task_type": "analysis-run",
    "status": "running",
    "progress_current": 50,
    "progress_total": 100,
    "progress_message": "Pages: 50/100",
    "metadata": "{\"stage\":\"page-analysis\",\"stats\":{...}}",
    "created_at": "2025-10-07T12:34:56.000Z",
    "started_at": "2025-10-07T12:34:57.000Z"
  }
}
```

**Via SSE** (Server-Sent Events):
```javascript
const eventSource = new EventSource('/events');

eventSource.addEventListener('task-progress', (event) => {
  const data = JSON.parse(event.data);
  
  if (data.taskId === 42) {
    console.log(`Progress: ${data.progress_current}/${data.progress_total}`);
    console.log(`Stage: ${data.metadata.stage}`);
    console.log(`Stats:`, data.metadata.stats);
  }
});
```

### Pausing/Resuming/Cancelling

**Pause Task**:
```bash
curl -X POST http://localhost:41000/api/background-tasks/42/pause
```

**Resume Task**:
```bash
curl -X POST http://localhost:41000/api/background-tasks/42/resume
```

**Cancel Task**:
```bash
curl -X POST http://localhost:41000/api/background-tasks/42/stop
```

**Note**: Analysis doesn't support mid-batch cancellation. Pause/cancel will take effect at the next batch boundary (typically 100-250 articles).

---

## Database Schema

### background_tasks Table

**Created by**: `ensureBackgroundTasks()` in `src/db/sqlite/ensureDb.js`

**Schema**:
```sql
CREATE TABLE background_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'pending', 'resuming', 'running', 
    'paused', 'completed', 'failed', 'cancelled'
  )),
  progress_current INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  progress_message TEXT,
  config TEXT,              -- JSON configuration
  metadata TEXT,            -- JSON metadata (stage, stats, etc.)
  error_message TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  resume_started_at TEXT
);

CREATE INDEX idx_background_tasks_status ON background_tasks(status);
CREATE INDEX idx_background_tasks_type ON background_tasks(task_type);
CREATE INDEX idx_background_tasks_created ON background_tasks(created_at DESC);
```

**Stored Data Example**:
```json
{
  "id": 42,
  "task_type": "analysis-run",
  "status": "running",
  "progress_current": 50,
  "progress_total": 100,
  "progress_message": "Pages: 50/100",
  "config": "{\"analysisVersion\":1,\"pageLimit\":100,\"dbPath\":\"./data/news.db\"}",
  "metadata": "{\"stage\":\"page-analysis\",\"stats\":{\"pagesProcessed\":50,\"pagesUpdated\":45,\"placesExtracted\":120}}",
  "error_message": null,
  "created_at": "2025-10-07T12:34:56.000Z",
  "started_at": "2025-10-07T12:34:57.000Z",
  "updated_at": "2025-10-07T12:35:12.000Z",
  "completed_at": null
}
```

---

## Benefits Over Child Process Approach

### Persistence

**Child Process**:
- ❌ Task state lost if server restarts
- ❌ No way to resume interrupted tasks
- ❌ Progress tracking relies on parsing stdout

**Background Task**:
- ✅ Task state persisted to database
- ✅ Tasks can resume after server restart
- ✅ Structured progress tracking in database

### Control & Monitoring

**Child Process**:
- ❌ Limited control (can only kill process)
- ❌ No pause/resume support
- ❌ Progress monitoring via stdout parsing

**Background Task**:
- ✅ Pause, resume, cancel operations
- ✅ Structured progress via callbacks
- ✅ Real-time SSE updates
- ✅ Background tasks UI integration

### Error Handling

**Child Process**:
- ❌ Exit codes provide limited error info
- ❌ stderr must be parsed for errors
- ❌ Hard to distinguish error types

**Background Task**:
- ✅ Structured error reporting
- ✅ Error messages stored in database
- ✅ Automatic retry support (if configured)
- ✅ Error categorization

### Resource Management

**Child Process**:
- ❌ Spawns new Node.js process (high overhead)
- ❌ Multiple processes compete for CPU
- ❌ No coordination between concurrent runs

**Background Task**:
- ✅ Runs in same process (lower overhead)
- ✅ Task manager coordinates resources
- ✅ Can enforce concurrency limits
- ✅ Shared worker pools (if needed)

---

## Module Reusability

**Critical Design Decision**: Analysis modules remain independent and lightweight, usable throughout the system for targeted analysis.

### Core Analysis Modules (Unchanged)

**These remain pure, focused, and reusable**:

1. **`analyse-pages-core.js`**
   - Pure function: `analysePages({ dbPath, limit, ... })`
   - No task manager coupling
   - Used by: AnalysisTask, CLI tools, tests

2. **`page-analyzer.js`**
   - Analyzes single page: `analyzePage({ url, html, ... })`
   - Used by: Crawler intelligence, targeted analysis, planning

3. **`place-extraction.js`**
   - Extracts places from text: `extractGazetteerPlacesFromText(text, gazetteer)`
   - Used by: Page analyzer, domain analyzer, quality scoring

4. **`deep-analyzer.js`**
   - Content quality analysis: `performDeepAnalysis({ text, ... })`
   - Used by: Page analyzer, quality scoring

5. **`milestones.js`**
   - Award achievements: `awardMilestones({ db, dryRun })`
   - Used by: AnalysisTask, manual award triggers

### Usage in Planning & Intelligence

**Crawler Planning** (still works unchanged):
```javascript
const { analyzePage } = require('./analysis/page-analyzer');

// Analyze sample pages during crawl planning
const analysis = analyzePage({
  url: sampleUrl,
  html: fetchedHtml,
  gazetteer,
  db,
  targetVersion: 1
});

// Use analysis.findings to make crawl decisions
if (analysis.findings.isArticle && analysis.findings.wordCount > 300) {
  // High-quality article - prioritize similar pages
}
```

**Targeted Analysis** (still works unchanged):
```javascript
const { analysePages } = require('./tools/analyse-pages-core');

// Analyze specific subset without full orchestration
const result = await analysePages({
  dbPath: './data/news.db',
  analysisVersion: 1,
  limit: 100,  // Just 100 pages
  verbose: false
});
```

**Quality Scoring** (still works unchanged):
```javascript
const { performDeepAnalysis } = require('./analysis/deep-analyzer');

// Check article quality during crawl
const quality = performDeepAnalysis({
  text: articleText,
  wordCount: 500,
  hasMedia: true
});

if (quality.score > 0.7) {
  // High-quality content - continue crawling domain
}
```

---

## Testing Strategy

### Unit Tests

**Test AnalysisTask in isolation**:
```javascript
const { AnalysisTask } = require('./AnalysisTask');

test('AnalysisTask reports progress correctly', async () => {
  const progressUpdates = [];
  const task = new AnalysisTask({
    db: testDb,
    taskId: 1,
    config: { pageLimit: 10 },
    signal: new AbortController().signal,
    onProgress: (data) => progressUpdates.push(data)
  });
  
  await task.execute();
  
  expect(progressUpdates.length).toBeGreaterThan(0);
  expect(progressUpdates[0]).toMatchObject({
    message: expect.stringContaining('Starting'),
    metadata: { stage: 'starting' }
  });
});
```

### Integration Tests

**Test background task creation and execution**:
```javascript
test('Analysis runs as background task', async () => {
  const taskId = backgroundTaskManager.createTask('analysis-run', {
    analysisVersion: 1,
    pageLimit: 10,
    dbPath: testDbPath
  });
  
  await backgroundTaskManager.startTask(taskId);
  
  const task = backgroundTaskManager.getTask(taskId);
  expect(task.status).toBe('completed');
  expect(task.progress_current).toBeGreaterThan(0);
});
```

### API Tests

**Test endpoint integration**:
```javascript
test('POST /api/analysis/start-background creates task', async () => {
  const response = await request(app)
    .post('/api/analysis/start-background')
    .send({ analysisVersion: 1, pageLimit: 10 })
    .expect(202);
  
  expect(response.body).toMatchObject({
    success: true,
    taskId: expect.any(Number),
    runId: expect.stringMatching(/^analysis-/),
    taskUrl: expect.stringContaining('/api/background-tasks/')
  });
});
```

---

## Future Enhancements

### 1. Smart Resume

**Current**: Resume continues from last processed ID  
**Enhancement**: Skip already-analyzed articles, only process new/updated

**Implementation**:
```javascript
// In AnalysisTask._runPageAnalysis()
const alreadyAnalyzed = this.config.resumeProgress?.lastProcessedId || 0;

const result = await analysePages({
  dbPath: this.dbPath,
  analysisVersion: this.analysisVersion,
  limit: this.pageLimit,
  startAfter: alreadyAnalyzed,  // Skip already processed
  onProgress: ...
});
```

### 2. Incremental Analysis

**Current**: Analyzes all articles up to limit  
**Enhancement**: Only analyze articles modified since last run

**Implementation**:
```javascript
// Add lastAnalysisRun timestamp to config
const config = {
  analysisVersion: 1,
  pageLimit: 1000,
  analyzeSince: '2025-10-01T00:00:00Z'  // Only articles fetched/updated after this
};
```

### 3. Parallel Analysis Tasks

**Current**: Single analysis task at a time  
**Enhancement**: Multiple concurrent tasks with different configurations

**Example Use Cases**:
- Task 1: Analyze new articles (version 1)
- Task 2: Re-analyze old articles (version 2, better algorithm)
- Task 3: Targeted analysis (specific domain)

**Implementation**: Already supported! Just create multiple tasks:
```javascript
const task1 = backgroundTaskManager.createTask('analysis-run', {
  analysisVersion: 1,
  pageLimit: 1000
});

const task2 = backgroundTaskManager.createTask('analysis-run', {
  analysisVersion: 2,
  pageLimit: 500
});

await Promise.all([
  backgroundTaskManager.startTask(task1),
  backgroundTaskManager.startTask(task2)
]);
```

### 4. Analysis Scheduling

**Enhancement**: Schedule periodic analysis runs

**Implementation**:
```javascript
// In server.js
const scheduleAnalysis = () => {
  const taskId = backgroundTaskManager.createTask('analysis-run', {
    analysisVersion: 1,
    pageLimit: 5000
  });
  
  backgroundTaskManager.startTask(taskId);
};

// Run analysis every 6 hours
setInterval(scheduleAnalysis, 6 * 60 * 60 * 1000);
```

### 5. Analysis Result Feedback to Crawler

**Enhancement**: Feed analysis insights back to crawler priorities

**Implementation**:
```javascript
// In AnalysisTask.execute() after completion
if (this.stats.pagesProcessed > 0) {
  const insights = {
    highQualityDomains: [], // Domains with >80% quality articles
    coverageGaps: [],       // Topics with low coverage
    problemDomains: []      // Domains with analysis errors
  };
  
  // Extract insights from analysis results
  // Feed to crawler intelligence system
  crawlerIntelligence.updatePriorities(insights);
}
```

---

## Migration Guide

### For Existing Code Using Child Process

**Old Code**:
```javascript
const response = await fetch('/api/analysis/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    analysisVersion: 1,
    pageLimit: 1000
  })
});

const { runId } = await response.json();
```

**New Code** (background task):
```javascript
const response = await fetch('/api/analysis/start-background', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    analysisVersion: 1,
    pageLimit: 1000
  })
});

const { taskId, runId } = await response.json();

// Monitor via background tasks API
const taskStatus = await fetch(`/api/background-tasks/${taskId}`);
```

**Migration Strategy**:
1. **Phase 1**: Add background task endpoint (✅ done)
2. **Phase 2**: Update UI to use background tasks
3. **Phase 3**: Deprecate child process endpoint (keep for compatibility)
4. **Phase 4**: Remove child process endpoint (future)

---

## Summary

**What Changed**:
- ✅ Created `AnalysisTask` class (background task adapter)
- ✅ Registered `analysis-run` task type
- ✅ Added `/api/analysis/start-background` endpoint
- ✅ Added task definition for background tasks UI
- ✅ Analysis modules remain unchanged and reusable

**What Stayed the Same**:
- ✅ Core analysis modules (analyse-pages-core, page-analyzer, etc.)
- ✅ Analysis algorithms and logic
- ✅ Database schema (analysis_runs table)
- ✅ Existing `/api/analysis/start` endpoint (child process)
- ✅ Module usage in crawler planning and intelligence

**Benefits**:
- ✅ Better user experience (pause/resume, progress tracking)
- ✅ More reliable (persistence, error recovery)
- ✅ Better resource management (no child processes)
- ✅ Integrated with background tasks UI
- ✅ Analysis modules stay lightweight and reusable

**Next Steps**:
1. Update UI to use background task endpoint
2. Add comprehensive tests
3. Implement smart resume and incremental analysis
4. Feed analysis results to crawler intelligence
