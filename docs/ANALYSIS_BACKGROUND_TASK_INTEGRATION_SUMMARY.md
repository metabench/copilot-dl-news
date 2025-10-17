# Analysis Background Task Integration - Summary (October 11, 2025)

## What Was Delivered

### 1. Database Schema Enhancement

**Added columns to `analysis_runs` table**:
- `background_task_id` (INTEGER, nullable) - Links to `background_tasks.id`
- `background_task_status` (TEXT, nullable) - Cached task status for quick display

**Migration strategy**:
- ✅ Automatic upgrade on server start via `ensureAnalysisRunSchema()`
- ✅ ALTER TABLE with duplicate-column race handling
- ✅ Index created: `idx_analysis_runs_background_task`
- ✅ Existing records gracefully handle NULL values
- ✅ Manual upgrade tool: `node tools/upgrade-analysis-schema.js`

### 2. UI Integration

**Server-side rendering** (`renderAnalysisTable.js`):
- Added "Task" column to analysis table (9 columns total, was 8)
- Links to `/api/background-tasks/{id}` when task ID present
- Shows task status inline: "Task #42 (running)"
- Displays em dash (—) for legacy runs without background tasks

**Client-side enhancement** (`analysis-enhancer.js`):
- State tracking includes `backgroundTaskId`, `backgroundTaskStatus`, `backgroundTaskHref`
- SSE updates hydrate task metadata from progress events
- Dynamic DOM updates create Task column on-the-fly for older markup
- `renderTaskCell()` helper renders consistent HTML

**View model** (`createAnalysisViewModel.js`):
- Normalizes background task fields from raw DB rows
- Generates `backgroundTaskHref` for convenient linking
- Client payload includes all task metadata

### 3. Developer Tooling

**New tools (no approval dialogs)**:

```bash
# Schema inspection
node tools/db-schema.js tables
node tools/db-schema.js table analysis_runs
node tools/db-schema.js indexes analysis_runs
node tools/db-schema.js stats

# Read-only queries
node tools/db-query.js "SELECT * FROM analysis_runs LIMIT 5"
node tools/db-query.js --json "SELECT * FROM analysis_runs WHERE status='running'"

# Schema upgrade (manual)
node tools/upgrade-analysis-schema.js
```

**Documentation**:
- `tools/debug/README.md` - Database Schema Tools section
- `AGENTS.md` - Database Schema Tools + common workflows
- `docs/ANALYSIS_AS_BACKGROUND_TASK.md` - Updated with linkage details

### 4. Documentation Updates

**Files updated**:
- `docs/ANALYSIS_AS_BACKGROUND_TASK.md`:
  - Added "analysis_runs Linkage" section explaining columns
  - Updated "What Changed" to include background task persistence
  - Updated "Next Steps" to reference field population
  
- `AGENTS.md`:
  - Added quick reference note after "When to Read Which Docs" table
  - Added "Database Schema Tools" section with examples
  - Documented common workflows for schema verification

- `tools/debug/README.md`:
  - Added "Database Schema Tools (Parent Directory)" section
  - Documented all three tools with usage examples
  - Explained safety features (read-only mode)

## Verification Steps

1. **Schema upgrade tested**:
   ```bash
   node tools/upgrade-analysis-schema.js
   # ✓ Columns added, index created
   ```

2. **Legacy data safe**:
   ```bash
   node tools/db-query.js "SELECT background_task_id FROM analysis_runs LIMIT 3"
   # ✓ All NULL (expected for existing records)
   ```

3. **Tools work without dialogs**:
   ```bash
   node tools/db-schema.js table analysis_runs
   # ✓ Shows 17 columns including new ones
   
   node tools/db-schema.js indexes analysis_runs
   # ✓ Shows idx_analysis_runs_background_task
   ```

## Next Steps

1. **Populate fields on new runs**: Update `BackgroundTaskManager` or `AnalysisTask` to call `updateAnalysisRun()` with background task ID when starting tasks

2. **SSE broadcast**: Ensure `analysis-progress` events include `backgroundTaskId` and `backgroundTaskStatus` fields

3. **Test UI rendering**: Start a new analysis via background tasks and verify Task column appears with clickable link

4. **Add tests**: Write focused tests for:
   - Schema upgrade with legacy data
   - View model normalization with NULL/non-NULL values
   - Client rendering of Task column
   - SSE updates with task metadata

## Files Modified

### Schema & Services
- `src/ui/express/services/analysisRuns.js` - Schema upgrade logic

### UI Rendering
- `src/ui/express/views/analysis/renderAnalysisTable.js` - SSR Task column
- `src/ui/express/views/analysis/createAnalysisViewModel.js` - View model normalization
- `src/ui/express/public/js/analysis-enhancer.js` - Client state + DOM updates

### Tools
- `tools/db-schema.js` - NEW: Schema inspection (with progress indicator)
- `tools/db-query.js` - NEW: Read-only query runner
- `tools/upgrade-analysis-schema.js` - NEW: Manual schema upgrade

### Documentation
- `docs/ANALYSIS_AS_BACKGROUND_TASK.md` - Updated with linkage details
- `AGENTS.md` - Added tools section and quick reference
- `tools/debug/README.md` - Added database tools documentation

## Key Design Decisions

1. **Nullable columns**: Backward compatibility for existing analysis runs without breaking UI
2. **Cached status**: Avoid N+1 queries when rendering analysis list
3. **ALTER TABLE guard**: Try-catch for duplicate column race conditions
4. **Client-side adaptation**: Dynamic column insertion for older SSR markup
5. **Read-only tools**: Safety first - inspection tools can't modify data
6. **Progress indicator**: `db-schema.js stats` shows live progress to avoid appearing stuck
