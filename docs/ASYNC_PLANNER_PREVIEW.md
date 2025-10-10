# Async Planner Preview Architecture

**When to Read**: Read this when implementing async planning features, understanding preview mode vs execution mode, or working with AsyncPlanRunner. For advanced GOFAI features, see ADVANCED_PLANNING_SUITE.md.

## Goals & Constraints
- Produce a plan preview asynchronously before the crawler starts executing requests.
- Stream rich planner telemetry to the UI while the plan is being built.
- Require an explicit confirmation before the crawler transitions from planning to execution.
- Keep the UI responsive for both fast (sub-second) and slow (multi-second) planning sessions.
- Avoid new database persistence for planner preview data; rely on in-memory state with safe fallbacks.

## Current Flow (Baseline)
1. `POST /api/crawl` immediately starts the crawler child process.
2. `IntelligentPlanRunner` runs inside the child, seeding queues and emitting `planner-stage` events.
3. SSE clients receive planner telemetry only after execution has already begun.
4. The UI has no opportunity to inspect or approve the plan before jobs run.

## Proposed End-to-End Flow
1. **Start request**: UI submits `POST /api/crawl/plan` with crawl options.
2. **Planning session**: Server creates an in-memory planning session (ID, options, timestamps) and launches an async planner runner.
3. **Telemetry streaming**: Planner stages emit `planner-stage` SSE events tagged with `phase: "preview"` and the `sessionId`.
4. **Plan preview payload**: When stages complete, the session emits a `plan-preview` SSE event summarising the blueprint (sections, hubs, seeds, navigation, targeted analysis insight).
5. **User confirmation**:
   - Confirm: UI posts `POST /api/crawl/plan/{sessionId}/confirm` to launch execution.
   - Cancel: UI posts `POST /api/crawl/plan/{sessionId}/cancel` (or simply ignores; session expires).
6. **Execution**: Confirmation calls the existing `CrawlOrchestrationService.startCrawl` to launch the crawler. The crawler re-runs its internal planner as it does today, but the preview data remains available for inspection and future optimisation.
7. **Cleanup**: Session caches expire automatically (TTL ~10 minutes) or immediately after confirmation/cancellation.

Fast planners will emit `plan-preview` almost immediately; the UI still displays the preview and requires a click to continue. Slow planners continue streaming stage progress in real time, keeping the UI responsive with status indicators.

## Backend Architecture Changes

### New Components
- **PlanningSessionManager** (service):
  - Stores active sessions in-memory (`Map<sessionId, session>`), enforces TTL and single-session-per-domain/job rules.
  - Provides methods `createSession(options)`, `appendStageEvent(sessionId, payload)`, `completeSession(sessionId, blueprint)`, `failSession`, `confirmSession`, `cancelSession`.
  - Exposes read-only views for API handlers and SSE seeders.
- **AsyncPlanRunner** (service):
  - Wraps `IntelligentPlanRunner` but operates in a dry-run mode with stubbed `enqueueRequest`/state objects.
  - Accepts session metadata, orchestrator dependencies, and an emitter callback to stream telemetry.
  - Produces a `PlanBlueprint` object (captured seeds, navigation links, summaries) without mutating queues.
- **PlanTelemetryEmitter**:
  - Bridges planner events to the SSE broadcaster.
  - Adds `sessionId`, `phase: "preview"`, and `jobCandidateId` (if available) to every event.
  - Emits high-level `plan-preview` / `plan-status` events.

### Modifications to Existing Modules
- **IntelligentPlanRunner**:
  - Accepts an optional `planCapture` adapter that records planner artefacts while stubbing out queue mutations.
  - Preview runs invoke `run()` with the capture adapter; execution runs continue to use the existing behaviour with real `enqueueRequest` functions.
  - The adapter captures sections, navigation, hub seeds, and targeted analysis highlights for later preview rendering.
- **HubSeeder** and related helpers:
  - Accept a strategy object: `{ mode: 'preview' | 'execute', recordSample(sample) {…}, enqueue(request) {…} }`.
  - Preview mode records seeds into the blueprint; execute mode keeps today’s behavior.
- **PlannerTelemetryBridge**:
  - Accept optional `sessionId` and `phase` metadata passed through to `telemetry.plannerStage`.
  - Continue to support legacy calls from the crawler process (fields default to `undefined`).
- **CrawlOrchestrationService**:
  - Exposes `startCrawl` unchanged for the confirmation step.
  - Accepts session metadata so confirmation can log/annotate which preview triggered execution (for telemetry).
- **JobEventHandlerService**:
  - Recognise and forward `planner-stage` events that carry a `sessionId`; allow them to reach SSE even before a job exists.
  - Add handler for `plan-status` events emitted directly from the server (no jobId yet).
- **Realtime broadcaster** (`broadcast.js`):
  - Permit events without `jobId`; for plan previews we inject `sessionId` field so clients can correlate.
  - Optionally track `sessionFilter` if we later need targeted streams.

## API Surface

| Endpoint | Method | Purpose | Response |
| --- | --- | --- | --- |
| `/api/crawl/plan` | `POST` | Start new planning session | `{ sessionId, status: "planning" }` (202) |
| `/api/crawl/plan/:sessionId/status` | `GET` | (Optional) Poll plan state | `{ status, blueprint?, error? }` |
| `/api/crawl/plan/:sessionId/confirm` | `POST` | Confirm preview and start execution | `{ jobId, startedAt }` (202) |
| `/api/crawl/plan/:sessionId/cancel` | `POST` | Cancel session | `{ status: "cancelled" }` (200) |
| `/api/crawl` | `POST` | (Legacy) Immediate start | unchanged |

All plan endpoints validate:
- No active crawler job unless multi-job mode is enabled.
- Session exists and is in the expected state (e.g., cannot confirm twice).
- Request payload matches original options (basic checksum to prevent stale confirmations).

## SSE & Telemetry Contracts

### Planner Stage Events (existing `planner-stage`)
- Add fields: `sessionId`, `phase` (`"preview" | "execution"`), `readyPct` (optional progress percentage), `summary`.
- During preview, `jobId` is omitted, but the event still streams to all clients. UI uses `sessionId` to scope stage history.

### New Events
- `plan-preview`:
  ```json
  {
    "sessionId": "plan_20251008_abc",
    "status": "ready",
    "blueprint": {
      "sections": [...],
      "navigation": { ... },
      "seedPlan": { ... },
      "targetedAnalysis": { ... }
    },
    "summary": {
      "seededCount": 48,
      "navigationLinks": 120,
      "countries": 6
    },
    "preparedAt": "2025-10-08T05:41:00.000Z"
  }
  ```
- `plan-status`:
  - `status: "planning" | "ready" | "failed" | "cancelled" | "confirmed"`.
  - Includes optional `error` message and `jobId` once confirmed.

### Telemetry History
- The realtime service caches the last N `plan-status` and `plan-preview` events so new SSE subscribers immediately see the latest plan state.

## UI Behaviour

### State Machine
```
Idle → Planning → PreviewReady → (Confirm → Executing) / (Cancel → Idle) / (Failed → Idle)
```

- **Idle**: Start button enabled, confirm button hidden.
- **Planning**: Start button disabled, status badge shows "Planning…", pipeline planner card updates with stage progress; confirm/cancel buttons hidden or disabled.
- **PreviewReady**: Display summary card with sections/stats, show confirm + cancel buttons, auto-scroll to preview card; start button remains disabled until user acts.
- **Executing**: After confirmation, existing execution UI takes over (progress, planner stages continue with `phase: "execution"`).

### UI Changes
- Introduce a `planPreviewPanel` (adjacent to pipeline cards) showing blueprint details.
- Add confirm/cancel button group (`Start crawl with this plan`, `Discard plan`).
- For fast planning (<1s) ensure the preview card animates in and requires a click (no auto-start).
- Store last confirmed session to prevent duplicate confirmations if user double-clicks.
- Surface errors (e.g., preview failure) as toast + pipeline status reset; re-enable start button with explanation.

### Accessibility & Responsiveness
- Buttons have ARIA labels reflecting states ("Planning in progress, please wait").
- Panel collapses gracefully on mobile; blueprint sections summarised with counts + tooltips.

## Session Lifecycle & Concurrency
- Sessions stored in-memory with TTL (default 10 minutes). Expired sessions emit `plan-status` with `expired`.
- Only one planning session per host/domain by default to avoid conflicting plans. Configurable if multi-crawl support is required later.
- Confirmation automatically removes session to free memory.
- Server restarts invalidate sessions; UI handles via SSE disconnect (shows "planning interrupted" on reconnect).

## Failure Handling
- Network failures or planner exceptions call `failSession`, emitting `plan-status` with `status: "failed"` and error summary.
- UI resets to Idle, showing failure message and re-enabling start.
- If confirmation occurs after expiration, API returns 410 Gone (UI prompts to re-plan).

## Testing Strategy
- **Unit Tests**:
  - PlanningSessionManager lifecycle and TTL behaviour (Node-based tests in `src/ui/express/__tests__/planningSessionManager.test.js`).
  - AsyncPlanRunner preview vs execute modes (mock `fetchPage`, `HubSeeder`, ensure no enqueue in preview).
  - PlannerTelemetryBridge metadata propagation.
  - Planning API contract tests covering start/status/confirm/cancel flows (`src/ui/express/__tests__/planning.api.test.js`). ✅
- **Integration Tests**:
  - `POST /api/crawl/plan` end-to-end using supertest; assert SSE stream includes `planner-stage` and `plan-preview` events.
  - Confirmation flow launching actual crawl (use mock runner to avoid real child process).
  - UI tests (JSdom) verifying reducer updates for plan preview state and confirm/cancel actions.
- **E2E Tests** (follow-up):
  - End-to-end happy path using Puppeteer once backend stabilises (optional for initial delivery).

## Implementation Roadmap
1. **Refactor Planner Core**
   - Introduce blueprint/dry-run support inside `IntelligentPlanRunner`, `HubSeeder`, and friends.
   - Add `PlanBlueprint` model + adapters.
2. **Session & Telemetry Infrastructure**
  - Implement `PlanningSessionManager` + `AsyncPlanRunner` + SSE emitters. ✅ (server wiring completed)
  - Update realtime broadcaster to cache new events. ✅ (plan preview/status history stored)
3. **API Layer**
  - Add plan endpoints, integrate with session manager, validate options. ✅ (`/api/crawl/plan` start/status/confirm/cancel)
4. **UI Store Updates**
   - Extend store/reducers with plan preview state (blueprint, status, sessionId).
   - Update SSE handlers to branch on `phase` / new events.
5. **UI Controls**
   - Modify start button flow, add confirm/cancel controls, update pipeline view.
6. **Tests & Docs**
   - Backend + frontend tests covering new flow.
   - Update docs/AGENTS with workflow notes once implementation stabilises.

## Assumptions & Future Work
- Only one planning session per host initially; multi-session support can be layered later with additional locking.
- Blueprint structure intentionally mirrors current planner summaries so future persistence (SQLite) can reuse the schema.
- Confirmation currently launches the crawler immediately; scheduling/deferred execution is out of scope.
- Database persistence and historical plan storage remain a future enhancement.

## Implementation Notes (October 2025)
- `createApp` now instantiates and shares `PlanningSessionManager`, `AsyncPlanRunner`, `JobEventHandlerService`, and `CrawlOrchestrationService` via `app.locals`, making the preview pipeline reusable across HTTP routes and realtime broadcasting.
- `RealtimeBroadcaster` records the latest `plan-status` and `plan-preview` events and replays them to newly connected SSE clients. Session expiry emits a dedicated `plan-status` message with `status: "expired"`.
- The planning API surface (`POST /api/crawl/plan`, `/status`, `/confirm`, `/cancel`) is implemented with option fingerprint checks, job-registry readiness validation, and confirmation that chains into the standard crawl orchestration.
- Tests in `planning.api.test.js` exercise the preview flow end-to-end with stubbed planner/runner implementations; run `npm run test:file -- planning.api.test.js` for a focused regression.
