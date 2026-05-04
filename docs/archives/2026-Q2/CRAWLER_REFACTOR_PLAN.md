# Crawler Refactoring Plan: Modularity & DRY Improvements

**Status**: Proposed
**Date**: 2025-11-21
**Context**: The current crawler architecture exhibits strong separation of concerns in its leaf services (`FetchPipeline`, `QueueManager`, etc.) but suffers from a "God Class" problem in `NewsCrawler.js`, which handles massive manual dependency wiring. Configuration logic is also scattered between the CLI, the orchestrator, and JSON files.

## Objectives
1.  **Decouple Wiring from Execution**: Move service instantiation out of `NewsCrawler.js`.
2.  **Centralize Configuration**: Unify config loading, merging, and validation into a single source of truth.
3.  **DRY up Entry Points**: Remove repetitive flag parsing and config merging from `crawl.js`.
4.  **Improve Testability**: Make it easier to test `NewsCrawler` by injecting mock services instead of relying on internal instantiation.

---

## Phase 1: Centralized Configuration Service

**Goal**: Eliminate "config drift" and scattered parsing logic.

### 1.1 Create `src/config/ConfigurationService.js`
This service will be responsible for:
-   Loading `config.json` and runner configs (YAML/JSON).
-   Parsing CLI arguments (moving logic from `crawl.js`).
-   Merging sources with strict precedence: `CLI Args > Runner Config > config.json > Defaults`.
-   Validating the final configuration object against a schema.

### 1.2 Refactor `crawl.js`
-   Replace manual `readFlag`, `readIntegerFlag`, etc., with calls to `ConfigurationService`.
-   The CLI should become a thin layer that passes `process.argv` to the service and receives a validated config object.

---

## Phase 2: The Crawler Factory (Dependency Injection)

**Goal**: Remove the "God Class" responsibility from `NewsCrawler.js`.

### 2.1 Create `src/crawler/CrawlerFactory.js`
This factory will encapsulate the complexity of wiring the system.
-   **Input**: A validated configuration object.
-   **Output**: A fully instantiated `NewsCrawler` instance.
-   **Responsibilities**:
    -   Instantiate leaf services (`UrlPolicy`, `RobotsCoordinator`, `ArticleCache`).
    -   Instantiate core services (`FetchPipeline`, `QueueManager`).
    -   Inject dependencies (e.g., passing `dbAdapter` to `FetchPipeline`).
    -   Handle conditional logic (e.g., "If `isGazetteerMode`, swap the planner").

### 2.2 Define Service Interfaces
-   Formalize the "Services Container" object that `NewsCrawler` will expect.
-   Example:
    ```javascript
    const services = {
      fetchPipeline,
      queueManager,
      robotsCoordinator,
      telemetry,
      // ...
    };
    ```

---

## Phase 3: Slim Down `NewsCrawler.js`

**Goal**: Transform `NewsCrawler` into a pure orchestrator.

### 3.1 Refactor Constructor
-   **Current**: Accepts `options`, manually builds 20+ services.
-   **New**: Accepts `config` and `services`.
    ```javascript
    constructor(config, services) {
      super(config.startUrl, config);
      this.fetchPipeline = services.fetchPipeline;
      this.queue = services.queueManager;
      // ...
    }
    ```

### 3.2 Remove Internal Wiring
-   Delete the massive blocks of `new Service(...)` calls.
-   Remove internal feature flag checks that determine *which* service class to use (this logic moves to the Factory).

---

## Phase 4: Implementation Steps & Migration

### Step 1: Extract Config Logic
1.  Extract schema and default values from `NewsCrawler.js` and `crawl.js` into `src/config/defaults.js`.
2.  Implement `ConfigurationService` to handle the merge logic.
3.  Update `crawl.js` to use this service.

### Step 2: Build the Factory
1.  Create `CrawlerFactory.js`.
2.  Copy the instantiation logic from `NewsCrawler.js` into the factory.
3.  Ensure the factory produces an identical object graph to the current implementation.

### Step 3: Refactor the Orchestrator
1.  Modify `NewsCrawler.js` to accept injected services.
2.  Update `src/server/crawl-api.js` (and other consumers) to use `CrawlerFactory.create()` instead of `new NewsCrawler()`.

### Step 4: Cleanup
1.  Remove unused imports in `NewsCrawler.js`.
2.  Verify that `crawl.js` is significantly smaller and cleaner.

---

## Benefits
-   **Testability**: We can now test `NewsCrawler` logic by passing mock services (e.g., a `QueueManager` that is pre-filled).
-   **Maintainability**: Adding a new service requires changing the Factory, not the Orchestrator.
-   **Clarity**: `NewsCrawler.js` will focus solely on the *lifecycle* of the crawl (start, pause, drain, stop), not the *assembly* of the crawler.
