# jsgui3 Patterns Analysis and Application

**Date**: October 11, 2025  
**Purpose**: Document how jsgui3-html and jsgui3-server patterns inform this codebase's activation architecture

## Executive Summary

After reviewing jsgui3 repositories, we conclude that:
1. ✅ **Core concepts align** - Two-phase lifecycle (render → activate) matches our current approach
2. ✅ **Terminology validated** - "Activation" is correct terminology (not "hydration")
3. ❌ **Architecture differs** - jsgui3 uses class inheritance; we use factory functions + modules
4. ✅ **Current approach is sound** - Our enhancer pattern achieves same goals with simpler code

**Recommendation**: Continue with current factory/enhancer pattern. Add optional lightweight ControlBase ONLY for complex components that need lifecycle management.

---

## jsgui3 Core Patterns

### 1. Control Class Base Pattern

**jsgui3 approach:**
```javascript
class MyControl extends Control {
  constructor(spec = {}) {
    super(spec);
    const { context } = this;
    
    // THIS RUNS ON BOTH SERVER AND CLIENT
    // Build UI structure
    this.button = new Control({ context, tagName: 'button' });
    this.button.add('Click me');
    this.add(this.button);
  }
  
  activate() {
    // THIS RUNS ONLY ON CLIENT
    if (!this.__active) {
      super.activate();
      
      // Attach event handlers
      this.button.on('click', () => {
        console.log('Clicked!');
      });
    }
  }
}
```

**Key features:**
- Base `Control` class provides common functionality
- Constructor builds structure (server + client)
- `activate()` attaches events (client only)
- `__active` flag prevents double-activation
- `context` object for shared state
- `data-jsgui-id` attributes map controls to DOM

### 2. Context-Based Architecture

**jsgui3 approach:**
```javascript
// context = { map_controls: {}, map_els: {}, ... }

// Register control
context.map_controls[ctrl._id()] = ctrl;

// Lookup control by ID
const ctrl = context.map_controls['control-123'];

// Activate all controls
recursive_dom_iterate(document, (el) => {
  const jsgui_id = el.getAttribute('data-jsgui-id');
  if (jsgui_id) {
    const ctrl = context.map_controls[jsgui_id];
    ctrl.activate(el);
  }
});
```

**Benefits:**
- Central registry for control lookup
- Parent-child relationships
- Shared resources (event bus, services)
- Recursive activation

### 3. Server-Side Rendering + Client Activation

**jsgui3 SSR flow:**
```javascript
// SERVER: Render to HTML
const ui = new Demo_UI({ context: serverContext });
const html = ui.all_html_render();
res.send(`<!DOCTYPE html>${html}`);

// CLIENT: Activate from HTML
const context = createClientContext();
jsgui.pre_activate(context);  // Map controls to DOM
jsgui.activate(context);       // Run activate() on all controls
```

**This is identical to our SSR → activation pattern!**

---

## Current Codebase Patterns (Already Aligned!)

### 1. Factory Functions + Enhancers

**Our approach:**
```javascript
// SERVER: Render via factory function
function renderCrawlsListPage(crawls) {
  return `
    <table data-jsgui-id="crawls-table">
      ${crawls.map(c => `
        <tr data-jsgui-id="crawl-row-${c.id}">
          <td>${c.host}</td>
          <td>${c.status}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

// CLIENT: Activate via enhancer script
function activateCrawlsTable(container) {
  const rows = container.querySelectorAll('[data-jsgui-id^="crawl-row-"]');
  rows.forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.jsguiId.replace('crawl-row-', '');
      window.location.href = `/crawls/${id}`;
    });
  });
}

function scanAndActivate() {
  const table = document.querySelector('[data-jsgui-id="crawls-table"]');
  if (table) activateCrawlsTable(table);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scanAndActivate);
} else {
  scanAndActivate();
}
```

**Comparison:**
| Feature | jsgui3 | Our Codebase |
|---------|--------|--------------|
| Two-phase lifecycle | ✅ Constructor + activate() | ✅ Render + enhancer |
| Server rendering | ✅ all_html_render() | ✅ renderPage() |
| Client activation | ✅ activate() method | ✅ scanAndActivate() |
| ID-based mapping | ✅ data-jsgui-id | ✅ data-jsgui-id |
| Control registry | ✅ context.map_controls | ❌ Not needed (simpler) |
| Base class | ✅ Control | ❌ Factory functions |
| Event system | ✅ on/off/emit | ✅ Native addEventListener |

**Our pattern achieves same results with:**
- ✅ Less boilerplate (no class hierarchy)
- ✅ Simpler code (function composition)
- ✅ Better tree-shaking (ES modules)
- ✅ Easier testing (pure functions)

### 2. EventSource for Real-Time Updates

**jsgui3 approach:**
```javascript
activate() {
  this.eventSource = new EventSource('/events');
  this.eventSource.addEventListener('progress', (e) => {
    this.updateProgress(JSON.parse(e.data));
  });
}
```

**Our approach (IDENTICAL):**
```javascript
function activateCrawlsTable(container) {
  const eventSource = new EventSource('/events');
  eventSource.addEventListener('progress', (e) => {
    const data = JSON.parse(e.data);
    updateRow(data);
  });
}
```

---

## When to Use Each Pattern

### Use Simple Enhancer (Default - 95% of cases)

**When:**
- List pages (crawls, queues, analysis)
- Simple forms (start, stop, pause buttons)
- Static content with minimal interaction
- No child component coordination needed

**Example:**
```javascript
function activateSimpleComponent(container) {
  const buttons = container.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('click', handleClick);
  });
}
```

**Benefits:**
- Minimal code
- Easy to understand
- No framework overhead
- Fast execution

### Use ControlBase Class (Optional - 5% of cases)

**When:**
- Complex components with internal state
- Multiple child components needing coordination
- Lifecycle hooks required (mount/unmount)
- Extensive cleanup needed

**Example: AnalysisProgressBar:**
```javascript
class AnalysisProgressControl extends ControlBase {
  constructor(element, { runId, onCancel }) {
    super(element, { runId, onCancel });
    
    // Find child elements (already rendered by server)
    this.bar = this.$('.progress-bar');
    this.label = this.$('.progress-label');
    this.cancelBtn = this.$('.cancel-button');
  }
  
  activate() {
    if (this.__active) return;
    super.activate();
    
    // Attach handlers
    this.cancelBtn.addEventListener('click', () => {
      this.options.onCancel?.(this.options.runId);
    });
    
    // Start updates
    this._eventSource = new EventSource(`/events?runId=${this.options.runId}`);
    this._eventSource.addEventListener('analysis-progress', (e) => {
      this.updateProgress(JSON.parse(e.data));
    });
    
    // Register cleanup
    this.onCleanup(() => {
      this._eventSource.close();
    });
  }
  
  updateProgress(data) {
    this.bar.style.width = `${data.percentage}%`;
    this.label.textContent = `${data.processed}/${data.total}`;
  }
}

// Usage in enhancer
function activateAnalysisPage() {
  document.querySelectorAll('[data-component="analysis-progress"]').forEach(el => {
    const control = new AnalysisProgressControl(el, {
      runId: el.dataset.runId,
      onCancel: (id) => fetch(`/api/analysis/${id}/cancel`, { method: 'POST' })
    });
    control.activate();
  });
}
```

**Benefits:**
- Structured lifecycle
- Automatic cleanup
- Child coordination
- Event system

---

## Recommended Adaptations (If Needed)

### 1. Optional ControlBase Class (For Complex Components Only)

**Create:** `src/ui/express/public/js/shared/ControlBase.js`

```javascript
/**
 * Lightweight control base (jsgui3-inspired)
 * Use ONLY for complex components needing lifecycle management.
 * Most components should use simple enhancer pattern!
 */

class EventEmitter {
  constructor() { this._listeners = {}; }
  on(event, handler) { ... }
  off(event, handler) { ... }
  emit(event, data) { ... }
}

class ControlBase extends EventEmitter {
  constructor(element, options = {}) {
    super();
    this.element = element;
    this.options = options;
    this.__active = false;
    this._children = [];
    this._cleanupFns = [];
  }
  
  activate() {
    if (this.__active) return;
    this.__active = true;
    this.emit('activate');
    this._children.forEach(c => c.activate());
  }
  
  deactivate() {
    this._children.forEach(c => c.deactivate());
    this._cleanupFns.forEach(fn => fn());
    this._cleanupFns = [];
    this.__active = false;
  }
  
  onCleanup(fn) {
    this._cleanupFns.push(fn);
  }
  
  $(selector) { return this.element.querySelector(selector); }
  $$(selector) { return Array.from(this.element.querySelectorAll(selector)); }
}
```

### 2. Component Registry (Optional, for debugging)

```javascript
class ComponentRegistry {
  constructor() { this._components = new Map(); }
  register(id, component) { this._components.set(id, component); }
  get(id) { return this._components.get(id); }
  activateAll() { this._components.forEach(c => c.activate()); }
}

// Global registry for dev tools
window.__components = new ComponentRegistry();
```

---

## Migration Path (If Adopting ControlBase)

### Phase 1: Add Optional ControlBase (1-2 hours)

1. Create `src/ui/express/public/js/shared/ControlBase.js`
2. Write tests for ControlBase
3. Update build system to include in bundle

### Phase 2: Convert Complex Components (Case-by-case)

**Candidates:**
- `AnalysisProgressBar` - multiple children, cleanup needed
- Any future drag-and-drop components
- Complex forms with validation

**DON'T convert:**
- Simple list activators (crawls, queues)
- Single-purpose buttons
- Static content enhancers

### Phase 3: Document Patterns (30 minutes)

Update `docs/HTML_COMPOSITION_ARCHITECTURE.md` with:
- When to use enhancer vs ControlBase
- Examples of each pattern
- Decision flowchart

---

## Conclusion

**Current Status: ✅ Aligned with jsgui3 Best Practices**

Our codebase already follows jsgui3's core principles:
1. ✅ Two-phase lifecycle (render → activate)
2. ✅ Server-side rendering with `data-jsgui-id` attributes
3. ✅ Client-side activation via dedicated scripts
4. ✅ EventSource for real-time updates
5. ✅ Separation of concerns (view model → renderer → enhancer)

**Differences are intentional and beneficial:**
- Factory functions > Class hierarchy (simpler, composable)
- Direct DOM manipulation > Framework abstraction (faster, smaller)
- Module system > Context object (ES modules, tree-shaking)

**Optional Enhancement:**
- Add lightweight ControlBase for 5% of components that need lifecycle
- Keep simple enhancer pattern for 95% of components
- Document when to use each approach

**No Breaking Changes Required** - Current architecture is sound and productive!

---

## 2025-11-17 Addendum — Client Entry Modularization Patterns

To keep the UI bundle maintainable, split the legacy `src/ui/client/index.js` responsibilities into focused modules:

1. **Control Manifest & Registry Checks**
  - Use `src/ui/controls/controlManifest.js` to seed the vendor jsgui registry on both SSR and client activation.
  - Expose `window.__COPILOT_EXPECTED_CONTROLS__` and `window.__COPILOT_REGISTERED_CONTROLS__` for diagnostics instead of relying on manual DOM scans.

2. **Diagram Atlas Bootstrap Extraction**
  - Move DOM/render helpers plus refresh polling into `src/ui/client/diagramAtlas.js` via a `createDiagramAtlasBootstrap()` factory that accepts `{ jsguiClient, registerControls }`.
  - Keep `index.js` limited to invoking `bootstrapDiagramAtlas()` so future Atlas changes stay isolated.

3. **Shared Listing State Store**
  - Seed `window.__COPILOT_URL_LISTING_STATE__` during SSR (`render-url-table.js`), then hydrate a singleton store via `ensureGlobalListingStateStore()` in `src/ui/client/listingStateStore.js`.
  - Mirror DOM updates through `attachListingDomBindings()` so UrlFilterToggle, diagnostics, pagers, and tables stay in sync after `/api/urls` calls.

4. **Validation Loop**
  - After each extraction, run `node src/ui/server/checks/diagramAtlas.check.js`, `node src/ui/server/checks/dataExplorer.check.js`, and the production/dev Data Explorer Jest suites to guard against regressions.

This pattern keeps the client entry as a small composition script (control registry + bootstrap calls) while larger features live in dedicated modules that can be tested and reasoned about independently.

---

## Cross-References

- **Current Architecture**: `docs/HTML_COMPOSITION_ARCHITECTURE.md`
- **Activation Pattern**: `docs/QUEUES_PAGE_OPTIMIZATION.md` (Section: Progressive Enhancement)
- **Example Implementations**: 
  - `src/ui/express/public/js/crawls-enhancer.js` (simple enhancer)
  - `src/ui/express/public/js/queues-enhancer.js` (simple enhancer)
  - `src/ui/express/public/components/AnalysisProgressBar.js` (complex component - could benefit from ControlBase)

---

## Detached Crawl API Service Blueprint (jsgui3 Server)

**Date**: November 7, 2025  
**Audience**: Backend + platform engineers implementing the crawler as a long-lived API powered by jsgui3-server patterns.

### Goals
- Expose crawl orchestration through a persistent HTTP API rather than short-lived CLI invocations.
- Reuse the existing `CrawlOperations` facade and sequence runner infrastructure without duplicating crawl logic.
- Adopt jsgui3-server conventions (Server, Publisher, lifecycle hooks) so the detached service aligns with the rest of the planned modular platform.
- Provide real-time progress streaming and durable run history that other services (dashboards, background tasks) can consume.

### Current Constraints
- `src/tools/crawl-operations.js` coordinates operations synchronously via CLI arguments; every run ends with process exit.
- Background-task infrastructure already exists (`src/background/`) but assumes tasks are scheduled inside the main Express app.
- There is no dedicated API surface for starting, inspecting, or cancelling crawler runs; the CLI JSON output is the only machine interface.
- jsgui3-server patterns in this repository are documented but not yet applied to crawler orchestration.

### Target Architecture Overview

```
┌──────────────────────────────┐
│  jsgui3 Server instance      │  Server bootstrap + middleware
│  (src/server/crawl-api.js)   │
└──────────────┬───────────────┘
          │ REST + SSE routes
┌──────────────▼───────────────┐
│  Publisher modules           │  map routes to domain actions
│  (publishers/crawl/*.js)     │
└──────────────┬───────────────┘
          │ Queue commands / queries
┌──────────────▼───────────────┐
│  Crawl Service orchestration │  wraps CrawlOperations + SequenceRunner
│  (services/CrawlService.js)  │
└──────────────┬───────────────┘
          │ Async jobs & state persistence
┌──────────────▼───────────────┐
│  Job store + telemetry       │  SQLite tables + background task bus
│  (db/crawl_runs, audit logs) │
└──────────────────────────────┘
```

### Mapping jsgui3-Server Concepts
| jsgui3 pattern | Proposed implementation |
| -------------- | ----------------------- |
| **Server** (`new Server({ name })`) | `src/server/crawl-api.js` instantiates `Server`, registers middleware (logging, JSON), mounts publishers under `/api/crawl`.
| **Publisher** (route handler module) | `publishers/crawl/start.js`, `publishers/crawl/status.js`, `publishers/crawl/cancel.js`, `publishers/crawl/runs.js` returning `{ method, path, handler }` objects.
| **Context** (shared runtime) | `createCrawlApiContext({ db, sequenceRunner, telemetry })` storing logger, job store, config, SSE hub references.
| **Lifecycle hooks** (`start`, `stop`) | Server `start()` boots the queue consumers and SSE channels; `stop()` drains jobs and closes db connections.
| **Event streams** (`publishers/sse.js`) | `/api/crawl/events/:runId` endpoint streams JSON events using jsgui3 SSE helper, reusing telemetry bus from background tasks.

### Core API Surface

| Endpoint | Method | Purpose | Handler responsibilities |
| -------- | ------ | ------- | ------------------------ |
| `/api/crawl/runs` | `POST` | Create a new crawl run (operation, sequence preset, or sequence config). | Validate payload, enqueue job, return `runId`, accepted parameters, and initial status (`pending`). |
| `/api/crawl/runs/:id` | `GET` | Retrieve run metadata, configuration, and latest progress snapshot. | Query job store, hydrate run summary, include aggregate stats mirroring CLI JSON output. |
| `/api/crawl/runs/:id/cancel` | `POST` | Request cancellation of an in-flight crawl. | Mark run as cancelling, signal worker via queue, append audit trail entry. |
| `/api/crawl/runs/:id/logs` | `GET` | Paginated access to structured log entries captured during the run. | Stream or chunk log rows (DB or file-backed) filtered by run ID. |
| `/api/crawl/runs/:id/events` | `GET` (SSE) | Push real-time status updates to clients. | Bind to telemetry bus, emit JSON payloads containing step status, metrics, errors. |
| `/api/crawl/availability` | `GET` | List operations, sequence presets, and sequence configs. | Reuse `buildOperationSummaries`/`buildSequenceSummaries`; acts like CLI `--list`. |

Authentication (API keys / session) plugs into the Server-level middleware; plan to reuse the existing Express auth strategy if co-hosted.

### Orchestration Flow
1. **Request intake**: Publisher validates payload against JSON schema (operation name, `startUrl`, overrides, `sequenceConfigName`, etc.) and normalises using the same helpers as the CLI (`normalizeOptions`).
2. **Job enqueue**: Persist a crawl run record in `crawl_runs` (new table) with fields for mode, payload, status, timestamps, requester, and derived metrics. Push a job message to the queue (reuse background task runner, or introduce lightweight BullMQ-like queue if needed).
3. **Worker execution**: A dedicated worker process (`workers/crawl-runner.js`) pulls jobs, instantiates `CrawlOperations` with injected logger, and executes `runOperation`, `runSequencePreset`, or `runSequenceConfig` depending on the job. Sequence config runs reuse `SequenceConfigRunner` exactly as the CLI.
4. **Telemetry + logging**: Instrument the worker to emit structured events (step start/finish, summary, warnings) through the telemetry hub. Persist the same metrics into the run record and append structured log rows to `crawl_run_logs`.
5. **Progress streaming**: SSE endpoint subscribes to telemetry events for a run, relays them to clients, and closes when the run reaches a terminal state (`ok`, `error`, `aborted`).
6. **Lifecycle management**: Server exposes `/healthz` and `/readyz` to integrate with deployment orchestrators. On shutdown, it waits for current jobs to finish or marks them as interrupted.

### Data Model Additions
- **`crawl_runs` table**
  - `id` (UUID or ULID)
  - `mode` (`operation`, `sequence`, `sequence-config`)
  - `operation_name`, `sequence_name`, `sequence_config_name`
  - `start_url`, `config_host`, `config_dir`
  - `overrides_json`, `shared_overrides_json`, `step_overrides_json`
  - `status`, `started_at`, `finished_at`, `elapsed_ms`
  - `summary_json` (stores final CLI-equivalent payload)
  - `requested_by`, `created_at`, `updated_at`

- **`crawl_run_logs` table**
  - `id`
  - `run_id`
  - `timestamp`
  - `level` (`info`, `warn`, `error`)
  - `context` (step name, operation)
  - `message`
  - `details_json`

Use existing DB helper factories under `src/db/sqlite/v1/` to expose typed query modules (`crawlRunsStore.js`, `crawlRunLogsStore.js`).

### Reusing Existing Modules
- **`CrawlOperations`**: Expose a factory `createCrawlRunner({ logger, db, options })` that can be shared by CLI and worker. Workers inject the queue-aware logger and telemetry hooks.
- **`SequenceConfigRunner`**: Already supports JSON metadata; worker can persist the metadata portion directly into the run summary for API consumers.
- **`CliFormatter` parity**: For JSON responses, reuse the helper functions currently used to build CLI payloads so behaviour stays consistent across CLI and API.
- **`createLogger`** (from CLI): adapt to accept `publishEvent(type, payload)` so log levels map to SSE events and log persistence.

### Implementation Phases
1. **Foundation (Week 1)**
  - Create new database tables + query adapters.
  - Establish a clean, version-aware directory layout under `src/server/crawl-api/` (for example `v1/jsgui3/`, `v1/express/`) so alternative server implementations can coexist without collisions.
  - Add `services/CrawlService.js` that wraps job persistence and orchestration triggers.
  - Scaffold the jsgui3 `Server` with basic middleware, health endpoint, and `/api/crawl/availability` route for smoke testing.

2. **Job Execution (Week 2)**
  - Implement worker process that consumes pending runs and executes them using existing facades.
  - Capture structured telemetry + logs, write them to the DB, and mirror CLI JSON summary.
  - Add cancellation support (job interruption, status transitions).

3. **API Completion (Week 3)**
  - Implement POST `/runs`, GET `/runs/:id`, SSE `/runs/:id/events`, logs endpoint.
  - Add request/response JSON schema validation and convert CLI-normalised payloads to API types.
  - Integrate authentication + rate limiting (reuse Express middleware if co-hosted, or implement API key guard).

4. **Observability & Docs (Week 4)**
  - Wire run metrics into existing telemetry dashboards (analysis runtime pages).
  - Document API in OpenAPI spec (extend the existing swagger plan).
  - Add automation tests (Jest integration hitting the API server with in-memory DB) and CLI compatibility tests (ensure CLI can poll API results for parity).

### Testing + Validation Strategy
- **Unit tests** for `CrawlService` (enqueue, cancel, summarise) and DB adapters.
- **Integration tests** launching the jsgui3 server against an in-memory SQLite database and executing a short mock operation using dependency-injected `CrawlOperations` stub.
- **Worker smoke tests** using a fixture database and invoking real operations in dry-run mode; assert status transitions and summary payloads match CLI output.
- **Contract tests** verifying SSE stream semantics (initial heartbeat, step updates, completion event).

### Risks & Mitigations
- **Long-running operations**: Use job-level heartbeat updates and enforce cancellation checks inside operation steps. Consider chunking sequences that loop indefinitely.
- **Resource contention**: The worker process should reuse the shared SQLite connection pool; enforce concurrency limits per host or global to avoid overloading target sites.
- **Security**: All mutating endpoints require authentication; rate-limited by IP/key. Logging should avoid storing secrets in overrides.
- **Backpressure on SSE**: Buffer events and drop clients that cannot keep up; store complete history in `crawl_run_logs` so clients can resume via pagination.

### Follow-Up Opportunities
- Expose background-task integration so existing scheduler can enqueue crawl runs via the same API.
- Add Web UI panel (jsgui3 client) that consumes the API for manual crawl management, reusing `jsgui3-html` inspired interfaces.
- Extend API to support batch submissions and upload of sequence config files.
- Maintain parallel `express` or other framework variants beside the jsgui3 implementation within the versioned directory structure, making framework swaps or A/B testing straightforward.
- Investigate running the API server and worker inside the existing Express app vs. separate process; document deployment trade-offs once prototype stabilises.

### References
- jsgui3-server `Server` and `Publisher` examples in the metabench repositories.
- Existing CLI implementation `src/tools/crawl-operations.js` (operation listing, JSON summaries).
- Sequence runner docs: `docs/PHASE_2_CRAWL_FACADE_IMPLEMENTATION_PLAN.md`, `docs/CHANGE_PLAN.md` (Sequence Config entries).
