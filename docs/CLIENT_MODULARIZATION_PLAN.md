# Client-Side Modularization Plan

**When to Read**: Read this when refactoring UI JavaScript, creating new client-side modules, or understanding the browser component architecture. Covers module boundaries, dependency patterns, and build process for UI code.

_Inspired by jsgui3-html patterns from metabench/jsgui3-html_

## Current State

**File**: `src/ui/public/index.js`  
**Size**: 2268 lines  
**Already Modularized**: statusIndicators.js, formatters.js, pipelineView.js, metricsView.js, sseClient.js, app.js, domUtils.js, theme/browserController.js

## jsgui3-html Patterns to Apply

### 1. Control-Based Architecture
- Everything is a Control class that extends base Control_Core
- Controls compose child controls via `.add(childControl)`
- Separation: `.data.model` (business logic), `.view.data.model` (UI state), `.dom` (DOM access)

### 2. Compositional Model Pattern
- `view.ui.compositional.model` defines structure declaratively
- Changes to model trigger automatic recomposition
- Array of control constructors/instances

### 3. Data Binding with Data_Object
- Use `Data_Object` from lang-tools for reactive state
- `Data_Model_View_Model_Control` for MVVM pattern
- Bidirectional binding with transformations

### 4. Isomorphic Rendering
- `constructor()` runs on both server and client - builds structure
- `activate()` runs only on client - attaches event handlers
- Guards like `if (this.dom.el)` protect server code

### 5. Factory Pattern for Modularity
- Export factory functions that accept dependencies
- Return API objects with update methods
- No global references - everything injected

## Modularization Strategy

### Phase 1: Extract Pure Rendering Helpers (Simple)
**Module**: `src/ui/public/index/renderingHelpers.js`

**Purpose**: Pure functions for HTML snippet generation

**Functions to Extract**:
- `compactDetails(details)` - Truncate/format details objects
- `formatFeatureName(key)` - Convert snake_case to Title Case
- `numericValue(entry)` - Normalize numeric values
- `describeEntry(entry)` - Generate entry descriptions
- `renderFeatureFlags(features)` - Render feature flag list
- `renderAnalysisStatus(summary, options)` - Render analysis status card
- `renderPriorityBonuses(queueConfig)` - Render priority bonus table
- `renderPriorityWeights(queueConfig)` - Render priority weight table
- `renderStructureSummary(structure)` - Render structure discovery panel

**Pattern**:
```javascript
// Pure functions, no side effects, no DOM access
export function compactDetails(details) {
  if (!details) return '';
  // ... pure logic
}

export function renderFeatureFlags(features) {
  if (!features) return '';
  const entries = Object.entries(features);
  // ... return HTML string
}
```

### Phase 2: Extract SSE Event Handlers (Medium)
**Module**: `src/ui/public/index/sseHandlers.js`

**Purpose**: Factory that creates SSE event handler object

**Handlers to Extract**:
- `handleMilestone(m)` - Process milestone events
- `handleAnalysisProgress(payload)` - Update analysis progress
- `handlePlannerStage(ev)` - Handle planner stage updates
- `updateIntelligentInsights(details, extras)` - Update insights panel
- `handleStructure(structure)` - Update structure discovery
- `handlePatternInsight(event)` - Update pattern insights

**Pattern** (following jsgui3-html's factory style):
```javascript
export function createSseHandlers({ elements, formatters, renderers, apis }) {
  return {
    handleMilestone(m) {
      // Uses injected elements and formatters
      // No globals, testable
    },
    
    handleAnalysisProgress(payload) {
      // ...
    },
    
    // ... other handlers
  };
}
```

### Phase 3: Extract Crawl Controls (Medium)
**Module**: `src/ui/public/index/crawlControls.js`

**Purpose**: Factory for crawl control panel (start/stop/pause/resume/analysis)

**Responsibilities**:
- Start button handler (form serialization, API call)
- Stop button handler
- Pause/Resume button handlers
- Analysis button handler
- Crawl type switching logic
- Form state persistence (localStorage)

**Pattern** (following jsgui3-html's Control-like API):
```javascript
export function createCrawlControls({ elements, apis, formatters, sseClient }) {
  const state = {
    currentCrawlType: '',
    analysisRunning: false
  };
  
  return {
    // Lifecycle methods (inspired by activate pattern)
    init() {
      // Attach event listeners
      elements.startBtn.addEventListener('click', handleStart);
      elements.stopBtn.addEventListener('click', handleStop);
      // ...
    },
    
    // Public API methods
    setCrawlType(type) {
      state.currentCrawlType = type;
      // Update UI
    },
    
    resetInsights() {
      // Clear insights panel
    },
    
    // Cleanup
    destroy() {
      // Remove event listeners
    }
  };
}
```

### Phase 4: Extract Jobs Manager (Medium)
**Module**: `src/ui/public/index/jobsManager.js`

**Purpose**: Factory for jobs list management and polling

**Responsibilities**:
- Render jobs list
- Poll jobs API (/api/crawls)
- Track active jobs
- Update job status indicators

**Pattern**:
```javascript
export function createJobsManager({ elements, formatters, apis }) {
  let pollInterval = null;
  let activeJobs = [];
  
  return {
    init() {
      startPolling();
    },
    
    renderJobs(jobs) {
      // Update DOM with job list
    },
    
    handleJobUpdate(job) {
      // Handle SSE job update
    },
    
    startPolling() {
      // Poll /api/crawls
    },
    
    stopPolling() {
      if (pollInterval) clearInterval(pollInterval);
    },
    
    destroy() {
      this.stopPolling();
    }
  };
}
```

### Phase 5: Extract Resume Queue Manager (Medium)
**Module**: `src/ui/public/index/resumeQueueManager.js`

**Purpose**: Factory for resume queue UI and polling

**Responsibilities**:
- Fetch resume inventory
- Render resume suggestions
- Handle resume button clicks
- Resume all button handler
- Polling logic

**Pattern**:
```javascript
export function createResumeQueueManager({ elements, apis, formatters }) {
  let refreshTimeout = null;
  
  return {
    init() {
      elements.resumeRefreshBtn.addEventListener('click', () => this.refresh());
      elements.resumeAllBtn.addEventListener('click', () => this.resumeAll());
      this.fetchInventory();
    },
    
    async fetchInventory() {
      // Fetch /api/resume-queues
      // Render list
    },
    
    async resumeAll() {
      // POST /api/resume
    },
    
    scheduleRefresh(delayMs) {
      // ...
    },
    
    destroy() {
      if (refreshTimeout) clearTimeout(refreshTimeout);
    }
  };
}
```

### Phase 6: Refactor Main index.js
**File**: `src/ui/public/index.js`

**Goal**: Reduce to composition/initialization logic

**Pattern**:
```javascript
import { createRenderingHelpers } from './index/renderingHelpers.js';
import { createSseHandlers } from './index/sseHandlers.js';
import { createCrawlControls } from './index/crawlControls.js';
import { createJobsManager } from './index/jobsManager.js';
import { createResumeQueueManager } from './index/resumeQueueManager.js';
// ... other imports

// Gather all DOM element references
const elements = {
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  // ... all elements
};

// Create module instances with dependency injection
const renderers = createRenderingHelpers();
const sseHandlers = createSseHandlers({ elements, formatters, renderers, apis });
const crawlControls = createCrawlControls({ elements, apis, formatters, sseClient });
const jobsManager = createJobsManager({ elements, formatters, apis });
const resumeQueueManager = createResumeQueueManager({ elements, apis, formatters });

// Initialize modules
crawlControls.init();
jobsManager.init();
resumeQueueManager.init();

// Remaining: initialization code, theme setup, health polling
```

## Testing Strategy

### Unit Tests for Pure Functions
```javascript
// renderingHelpers.test.js
import { compactDetails, formatFeatureName } from './renderingHelpers.js';

test('compactDetails truncates long JSON', () => {
  const long = { a: 'x'.repeat(500) };
  const result = compactDetails(long);
  expect(result.length).toBeLessThan(405);
});
```

### Integration Tests for Factories
```javascript
// crawlControls.test.js
import { createCrawlControls } from './crawlControls.js';

test('start button triggers API call', async () => {
  const mockElements = { startBtn: document.createElement('button') };
  const mockApis = { start: jest.fn().mockResolvedValue({ ok: true }) };
  
  const controls = createCrawlControls({ elements: mockElements, apis: mockApis });
  controls.init();
  
  mockElements.startBtn.click();
  
  await waitFor(() => {
    expect(mockApis.start).toHaveBeenCalled();
  });
});
```

## Benefits

1. **Testability**: Each module testable in isolation with mocked dependencies
2. **Reusability**: Modules can be used in different contexts (other pages, tests)
3. **Maintainability**: Clear boundaries, single responsibility
4. **Type Safety**: Explicit interfaces via JSDoc or TypeScript
5. **Debugging**: Easier to trace issues to specific modules
6. **Progressive Enhancement**: Modules can be conditionally loaded

## Migration Path

1. ✅ Phase 1: Extract rendering helpers (no dependencies, pure functions)
2. Phase 2: Extract SSE handlers (depends on Phase 1)
3. Phase 3: Extract crawl controls (depends on Phase 2)
4. Phase 4: Extract jobs manager (independent)
5. Phase 5: Extract resume queue manager (independent)
6. Phase 6: Refactor main index.js (depends on all above)
7. Add tests for each module
8. Update esbuild configuration if needed

## Success Criteria

- [ ] index.js reduced to <500 lines (composition only)
- [ ] All modules have unit tests with >80% coverage
- [ ] UI functionality remains identical (no regressions)
- [ ] Build size unchanged or reduced
- [ ] No global variable pollution
- [ ] JSDoc/TypeScript definitions for all public APIs

## Future Enhancements (Post-Refactor)

1. Convert to full jsgui3-html Controls with SSR support
2. Add Data_Object for reactive state management
3. Implement proper MVVM with Data_Model_View_Model_Control
4. Add client-side routing for multi-page app
5. Progressive enhancement for no-JS scenarios
