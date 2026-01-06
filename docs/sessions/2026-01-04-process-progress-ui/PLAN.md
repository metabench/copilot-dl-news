# Plan – Multi-stage Process Progress UI

## Objective
Build a pluggable UI + backend stream for monitoring long-running multi-stage tasks (backfills) with progress + logs, suitable for Electron "distance" viewing.

## Done When
- [x] Electron entrypoint opens `/background-tasks` in a large, zoomable window
- [x] Backfill core extracted to reusable module with resume/pause hooks
- [x] BackfillDatesTask registered in task manager with full lifecycle
- [x] Task definitions schema added for UI form creation
- [x] Cancellation semantics preserve CANCELLED status (no overwrite)
- [ ] Validate end-to-end: create task in UI → start → pause → resume → complete
- [ ] Document the "backfill contract" (stages, cursor, pause/cancel invariants)
- [ ] Polish big-screen UX (larger fonts, auto-focus active task, sorting)

## Change Set

### Completed
| File | Purpose |
|------|---------|
| `src/ui/electron/backgroundTasksMonitor/main.js` | Electron wrapper for distance monitor |
| `src/tools/backfill-dates-core.js` | Shared backfill logic with pause/resume/cursor |
| `src/background/tasks/BackfillDatesTask.js` | Background task wrapper for date backfill |
| `src/background/tasks/taskDefinitions.js` | Added `backfill-dates` schema for UI form |
| `src/db/sqlite/v1/queries/articles.backfillDates.js` | Added `countCandidates()` for totals |
| `src/background/BackgroundTaskManager.js` | Fix: don't overwrite CANCELLED with COMPLETED/FAILED |
| `src/deprecated-ui/express/server.js` | Registered `backfill-dates` task type |
| `src/api/server.js` | Registered `backfill-dates` task type |
| `package.json` | Added `electron:background-tasks` script |

### Pending
| File | Purpose |
|------|---------|
| `src/deprecated-ui/express/views/background-tasks.ejs` | Big-screen mode CSS/UX |
| `docs/workflows/backfill-contract.md` | Canonical backfill theory documentation |

## Backfill Contract (Theory)

### Resumable Cursor
- Persisted in `background_tasks.metadata.cursor.lastId`
- Each batch loop saves the last processed ID
- On resume, core reads `startAfterId` and continues from there

### Cooperative Pause
- `awaitIfPaused()` hook called inside work loops
- When paused, the hook blocks (polls `_paused` flag) without terminating
- Resume clears the flag and work continues

### Cancellation Correctness
- Completion/error handlers check if status is already CANCELLED
- If so, they emit a warning and skip the status update
- This prevents race conditions from stomping user intent

### Stage Reporting
- `metadata.stage` set to human-readable stage name ("scanning", "backfilling", etc.)
- UI displays stage alongside progress bar

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Cursor lost on crash | Cursor saved after each batch; worst case = redo one batch |
| Pause causes memory buildup | Pause blocks work loop, not accumulation; batches already loaded finish |
| SSE flood from per-row events | Per-row telemetry disabled by default; only batch/stage events emitted |
| UI not responsive during long poll | Using SSE stream, not long poll; UI remains interactive |

## Tests / Validation

- [ ] Manual: launch `npm run electron:background-tasks`, create a `backfill-dates` task with limit=500, run and observe
- [ ] Pause mid-run, confirm blocking (no progress increment)
- [ ] Resume, confirm continuation from cursor
- [ ] Cancel mid-run, confirm status stays CANCELLED
- [ ] Check progress bar accuracy (current/total matches expectation)
