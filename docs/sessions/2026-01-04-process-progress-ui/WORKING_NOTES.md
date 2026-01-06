# Working Notes – Multi-stage Process Progress UI

- 2026-01-04 — Session created via CLI. Add incremental notes here.

## Architecture Discovery

### Existing Infrastructure (already in place)
- **BackgroundTaskManager** — persists tasks in `background_tasks` table, manages lifecycle
- **SSE endpoint** — `/api/background-tasks/events` streams progress/telemetry
- **UI page** — `/background-tasks` with task cards, progress bars, telemetry panel
- **Task types** — `article-compression`, `analysis-run`, etc. already registered

### Key Insight
No need to build new streaming infrastructure. Focus on:
1. Making backfill a task type
2. Adding resume/pause semantics
3. Wrapping existing UI in Electron for distance viewing

## Implementation Log

### Electron Distance Monitor
- Created `src/ui/electron/backgroundTasksMonitor/main.js`
- Port selection: tries `BG_TASKS_PORT` → 3010..3020
- Env options: `BG_TASKS_ZOOM`, `BG_TASKS_DARK`
- Script: `npm run electron:background-tasks`

### Backfill Core Module
- Extracted from `backfill-dates.js` to `backfill-dates-core.js`
- Added `awaitIfPaused()` hook for cooperative pausing
- Added `startAfterId` for resumable cursor
- Uses `countCandidates()` for accurate totals

### BackfillDatesTask
- Implements `execute()`, `pause()`, `resume()`
- Loads cursor from `metadata.cursor.lastId` on start
- Reports stage via `metadata.stage`
- Quiet mode: no per-row telemetry (avoids SSE flood)

### Cancellation Fix
- BackgroundTaskManager completion/error handlers now check for CANCELLED status
- If already cancelled, skip status update and emit warning

### Task Definition
- Added `backfill-dates` to `taskDefinitions.js`
- Fields: limit, batchSize, redo, includeNav, url, listExisting

## Observations

### SSE Noise Concern
The original backfill CLI emits events per-row (useful for streaming CLI output).
For UI, this would flood the SSE connection with thousands of events.
Solution: `onRowEvent` callback is optional; BackfillDatesTask doesn't use it.

### Pause vs Cancel
- **Pause**: blocks work loop, task stays RUNNING, can resume
- **Cancel**: sets status to CANCELLED, aborts signal triggers, work stops

## Next Steps
1. Launch Electron monitor and test full lifecycle
2. Document backfill contract as a workflow guide
3. Consider big-screen CSS tweaks (larger fonts, auto-scroll telemetry)

## 2026-01-04 18:10 — Electron Monitor Validation

### Issue Encountered: Module Compatibility
The original approach embedded the server inside Electron, but this hit two problems:
1. **undici** requires web globals (`File`, `FormData`) not present in Electron's Node
2. **jsdom/parse5** are ESM-only but Electron 28's Node runtime uses CommonJS require

### Solution: Connect to External Server
Simplified the Electron entrypoint to just open a window pointing at an already-running server:
- Auto-detects running server on ports: 41000, 3000, 3007, 3010
- Shows error dialog if no server found
- No server embedding = no module compatibility issues

### Files Modified
- `src/ui/electron/backgroundTasksMonitor/main.js` — Simplified to URL-opening approach

### Validation
- Server running on `http://localhost:41000` (deprecated-ui auto-port)
- Electron monitor launched and connected
- `backfill-dates` task type available in UI
