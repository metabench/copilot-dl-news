# Architectural Documentation Update - Crawls vs Background Tasks

**Date**: October 10, 2025  
**Status**: ✅ Complete
**When to Read**: When you need to understand the fundamental difference between the two main data processing systems in this project. This is the first document to read to understand the overall architecture.
---

## Summary

Updated architectural documentation to clarify the critical distinction between **crawls (foreground)** and **background tasks (background)**. These are two separate systems that share some infrastructure but serve fundamentally different purposes.

---

## Files Updated

### 1. New Comprehensive Document ⭐

**`docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`** (NEW - 600+ lines)

Complete architectural guide covering:
- Executive summary of the two systems
- Detailed comparison table
- Architecture diagrams for both systems
- When to use which system
- Shared infrastructure (telemetry, SSE, progress tracking)
- Integration points (geography crawl hybrid, post-crawl analysis)
- Anti-patterns to avoid
- Future enhancements

**Key Sections**:
- System Comparison Table (11 dimensions)
- Crawls Architecture (child processes, network I/O)
- Background Tasks Architecture (in-process, CPU/disk I/O)
- Shared Infrastructure (5 common patterns)
- Decision Matrix (when to use which)

### 2. AGENTS.md Updates

**Added Section**: "Crawls vs Background Tasks ⚠️ CRITICAL"

**Location**: After "Project Structure" header (lines 100-140)

**Content**:
- Quick reference to full documentation
- Side-by-side comparison of the two systems
- Key rule: Crawls acquire data, background tasks process data
- Examples for each system

**Architecture Documentation Section**:
- Moved "ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md" to **top of list** with ⭐ marker
- Clear signal that this is the starting point for understanding the system

### 3. BACKGROUND_TASKS_COMPLETION.md Update

**Added Warning**: At top of Overview section

**Content**:
```markdown
**⚠️ IMPORTANT**: Background tasks are **separate from crawls**. 
See `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` for the 
architectural distinction. Background tasks process data already 
in the database (compress, analyze, export), while crawls fetch 
new data from external websites (BBC, Wikidata, etc.).
```

### 4. ANALYSIS_AS_BACKGROUND_TASK.md Update

**Added Warning**: After status line, before Overview

**Content**:
```markdown
**⚠️ IMPORTANT**: Background tasks are **separate from crawls** 
(see `docs/ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md`). Analysis 
tasks process existing article data, while crawls fetch new 
articles from websites.
```

---

## Key Architectural Clarifications

### 1. Crawls (Foreground System)

**Purpose**: Fetch content from external websites  
**Location**: `src/crawler/`  
**Manager**: `CrawlerManager`  
**Execution**: Node.js child processes (spawned)  
**I/O Type**: Network I/O bound  
**Duration**: Minutes to hours  
**User Interaction**: High - actively monitored  
**Examples**: Crawl BBC News, fetch Wikidata countries, discover sitemaps

**Key Tables**:
- `crawl_jobs` - Job metadata and status
- `queue_events` - Progress events and telemetry
- `articles` - Crawled content

**Key APIs**:
- `POST /api/crawl` - Start a crawl
- `GET /api/crawls/:id` - Get crawl status
- `POST /api/crawls/:id/pause` - Pause crawl
- `POST /api/crawls/:id/resume` - Resume crawl

### 2. Background Tasks (Background System)

**Purpose**: Process data already in the database  
**Location**: `src/background/`  
**Manager**: `BackgroundTaskManager`  
**Execution**: In-process with optional worker pool  
**I/O Type**: CPU/disk I/O bound  
**Duration**: Hours to days  
**User Interaction**: Low - runs unattended  
**Examples**: Compress articles, run analysis, export database

**Key Tables**:
- `background_tasks` - Task metadata, status, and progress
- `compression_results` - Compression outcomes (if applicable)
- `analysis_runs` - Analysis outcomes (if applicable)

**Key APIs**:
- `POST /api/background-tasks` - Create a task
- `POST /api/background-tasks/:id/start` - Start task
- `POST /api/background-tasks/:id/pause` - Pause task
- `POST /api/background-tasks/:id/resume` - Resume task
- `GET /api/background-tasks/:id` - Get task status

### 3. Shared Infrastructure

Both systems share:
1. **Telemetry System** - Observability events (MILESTONE, PROGRESS, PROBLEM)
2. **Progress Tracking** - Current/total/percentage metrics
3. **SSE Broadcasting** - Real-time updates to connected clients
4. **Pause/Resume** - Ability to suspend and continue work
5. **Database Persistence** - State survives server restarts

**Key Difference**:
- Crawls: Telemetry via structured stdout (MILESTONE lines)
- Background Tasks: Telemetry via `_telemetry()` method

### 4. Hybrid Cases

**Geography Ingestion**: Technically a "crawl" (fetches external data) but runs as a **background task** for better infrastructure (auto-resume, long-running).

**Implementation**:
```javascript
// GeographyTask wraps WikidataCountryIngestor
class GeographyTask {
  constructor({ db }) {
    this.ingestor = new WikidataCountryIngestor({ db });
  }
  
  async execute({ signal, emitProgress }) {
    return await this.ingestor.execute({ signal, emitProgress });
  }
}
```

Uses crawler ingestors (`src/crawler/gazetteer/ingestors/`) but managed by `BackgroundTaskManager`.

---

## Decision Matrix

### Use Crawls When:

✅ Fetching content from external websites  
✅ Real-time progress monitoring needed  
✅ Network I/O bound operations  
✅ User-initiated and time-sensitive  
✅ Interactive pause/resume via stdin/stdout  
✅ Isolated child process execution needed  

### Use Background Tasks When:

✅ Processing data already in database  
✅ Can run unattended for hours/days  
✅ CPU or disk I/O bound operations  
✅ Automatic resume on server restart needed  
✅ Worker pool parallelization needed  
✅ Maintenance or optimization work  

---

## Anti-Patterns Documented

### ❌ Don't Mix Concerns

**Wrong**: Creating a "crawl" that compresses articles  
**Right**: Crawl populates articles → background task compresses them

**Wrong**: Creating a background task that fetches URLs  
**Right**: Crawl fetches URLs → background task processes them

### ❌ Don't Confuse the UIs

**Wrong**: Showing background tasks on `/crawls` page  
**Right**: `/crawls` for crawls, `/background-tasks.html` for tasks

### ❌ Don't Duplicate Infrastructure

**Wrong**: Creating separate telemetry systems  
**Right**: Both use shared telemetry with different event types

---

## Future Considerations

### Planned Background Tasks

- ExportTask - Database exports
- ImportTask - Gazetteer imports
- VacuumTask - Database maintenance
- BucketCompressionTask - Similar content grouping
- MigrationTask - Schema migrations (Phase 0-5)

### Potential Crawl Types

- RSS Crawl - Monitor RSS feeds
- Sitemap Monitor - Periodic sitemap checks
- Social Media Crawl - Fetch from social APIs
- Archive Crawl - Historical article fetching

### Integration Opportunities

- Scheduled Background Tasks (cron-like)
- Crawl Chains (auto-trigger analysis after crawl)
- Smart Resume (detect stale data, trigger refresh)
- Cost Optimization (prioritize cheap operations)

---

## Impact

### For Developers

- **Clearer mental model**: Two systems, distinct purposes
- **Better decisions**: Know which system to use when
- **Reduced confusion**: No more "why is this a crawl?" questions
- **Easier onboarding**: Read one doc, understand the architecture

### For AI Agents

- **Faster context gathering**: Read ARCHITECTURE doc first
- **Better code placement**: Know where new features belong
- **Correct patterns**: Use right infrastructure for the task
- **Avoid anti-patterns**: Clear guidance on what not to do

### For Users

- **Clearer UI**: Background tasks page vs crawls page
- **Better expectations**: Know what each system does
- **Predictable behavior**: Understand auto-resume, progress tracking

---

## Verification

All updated documents now:
1. ✅ Reference `ARCHITECTURE_CRAWLS_VS_BACKGROUND_TASKS.md` as source of truth
2. ✅ Include warning labels (⚠️ IMPORTANT) where needed
3. ✅ Use consistent terminology (crawls vs background tasks)
4. ✅ Clarify hybrid cases (geography ingestion)
5. ✅ Link related documentation

---

## Next Steps

### Immediate (Done)

- ✅ Create comprehensive architecture document
- ✅ Update AGENTS.md with quick reference
- ✅ Add warnings to related documents
- ✅ Document anti-patterns

### Short-term (Optional)

- Update README.md with architecture overview
- Add architecture diagram to README
- Create video walkthrough of the two systems
- Update JSDoc comments to reference architecture doc

### Long-term (Future)

- Implement planned background tasks (Export, Import, Vacuum)
- Add new crawl types (RSS, Sitemap Monitor)
- Create integration examples (crawl chains)
- Add scheduled task support

---

## Conclusion

The architectural documentation now clearly distinguishes between **crawls (foreground)** and **background tasks (background)**. This clarity will help developers, AI agents, and users understand the system better and make correct decisions about where new features belong.

**Key Takeaway**: Crawls **acquire new data** from the web. Background tasks **process existing data** in the database. They complement each other but remain architecturally separate.
