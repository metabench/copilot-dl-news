---
description: Implementing a full-stack feature from database to UI across all front-ends
---

# Full-Stack Feature Implementation Workflow

This workflow covers implementing a feature across the entire stack: database adapters (SQLite/Postgres), business logic, server-side rendering, and client-side activation. Features must be implemented across ALL relevant front-end interfaces.

---

## Phase 0: Research & Documentation Review

### 0.1 Read Existing Documentation
1. Read `docs/INDEX_FOR_AGENTS.md` for documentation overview
2. Read `docs/DATABASE_SCHEMA_ERD.md` to understand data model
3. Read `docs/SERVICE_LAYER_GUIDE.md` for service patterns
4. Read `src/ui/README.md` for UI architecture overview
5. Identify relevant session docs in `docs/sessions/` that relate to this feature

### 0.2 Review Skills Documentation
1. Check `docs/agi/skills/` for relevant skill files:
   - `jsgui3-lab-experimentation/SKILL.md` - How to run UI experiments
   - `jsgui3-ssr-activation-data-bridge/SKILL.md` - SSR to client data patterns
   - `jsgui3-wlilo-ui/SKILL.md` - WLILO design system usage
   - `telemetry-contracts/SKILL.md` - How to add observability
2. Review any relevant lab session results in `docs/sessions/*-lab*`

### 0.3 Identify All Affected Front-Ends
1. List all UI apps in `src/ui/server/` - there are 39+ app directories:
   - `dataExplorer/` - Main data exploration interface
   - `gazetteer/` - Geographic data management
   - `placeHubGuessing/` - Place hub discovery UI
   - `crawlObserver/` - Live crawl monitoring
   - `analyticsHub/` - Analytics dashboards
   - `designStudio/` - Visual design tools
   - ... and many more
2. List apps in `z-server/ui/` - Electron-based front-end
3. Determine which front-ends need this feature
4. Document the list of affected interfaces before proceeding

### 0.4 Create Session Documentation
1. Create a new session folder: `docs/sessions/YYYY-MM-DD-<feature-slug>/`
2. Create `PLAN.md` with:
   - Feature description and goals
   - Affected front-ends list
   - Database changes needed
   - Service layer changes needed
   - UI components needed
3. Create `WORKING_NOTES.md` for logging commands and discoveries

---

## Phase 1: Database Layer

### 1.1 Schema Design
1. Review existing schema in `src/data/db/migrations/`
2. Design new tables/columns needed
3. Consider indexes for query performance
4. Document schema in `PLAN.md`

### 1.2 SQLite Adapter Implementation
1. Location: `src/data/db/sqlite/`
2. Add migration file: `src/data/db/migrations/XXXX_<name>.js`
3. Implement queries in appropriate query file or create new one
4. Follow patterns from existing query files (parameterized queries, proper escaping)

### 1.3 Postgres Adapter Implementation
1. Location: `src/data/db/postgres/`
2. Create corresponding Postgres migration
3. Handle Postgres-specific syntax differences:
   - `$1, $2` parameter style (vs SQLite's `?`)
   - `RETURNING` clause usage
   - Index syntax differences
4. Test with `npm run test -- --findRelatedTests src/data/db/postgres/`

### 1.4 Database Facade Integration
1. Update `src/data/db/DualDatabaseFacade.js` if adding new high-level methods
2. Ensure both adapters are called through the facade
3. Add query telemetry hooks via `src/data/db/queryTelemetry.js`

### 1.5 Database Testing
// turbo
1. Run: `npm run test -- --findRelatedTests src/data/db/`
2. Add new tests in `src/data/db/__tests__/` if needed
3. Test both SQLite and Postgres paths

---

## Phase 2: Business Logic / Service Layer

### 2.1 Service Design
1. Review existing services in `src/services/` for patterns
2. Determine if feature fits existing service or needs new one
3. Services should:
   - Accept database adapter via constructor injection
   - Have clear public API
   - Handle errors gracefully with proper logging

### 2.2 Service Implementation
1. Create or modify service file in `src/services/`
2. Follow naming convention: `<Domain><Action>Service.js`
3. Inject dependencies in constructor:
   ```javascript
   constructor({ db, config, telemetry }) {
     this.db = db;
     this.config = config;
     this.telemetry = telemetry;
   }
   ```

### 2.3 Service Testing
// turbo
1. Run: `npm run test -- --findRelatedTests src/services/`
2. Create unit tests with mocked database
3. Create integration tests with real SQLite

### 2.4 Wire Service to Application
1. Register service in appropriate bootstrap file
2. Ensure service is accessible from API routes and UI servers

---

## Phase 3: Lab Experimentation (UI Components)

### 3.1 Create Lab Experiment
1. Create lab file: `src/ui/lab/<feature>-lab.js`
2. Lab structure:
   ```javascript
   // Lab: <Feature Name>
   // Purpose: Test <control> rendering in isolation
   // Run: node src/ui/lab/<feature>-lab.js
   
   const { Control } = require('jsgui3-html');
   // ... minimal implementation to test rendering
   ```
3. Test rendering output before full integration

### 3.2 Run and Validate Lab
// turbo
1. Run: `node src/ui/lab/<feature>-lab.js`
2. Inspect HTML output for correctness
3. Iterate on control design until satisfied
4. Document findings in `WORKING_NOTES.md`

### 3.3 Create Control Checks
1. Create check script: `src/ui/controls/checks/<Control>.check.js`
2. Check scripts validate:
   - Control renders without errors
   - Expected HTML structure is produced
   - CSS classes are correct
3. Run check after any control modifications

---

## Phase 4: Server-Side UI Components (jsgui3)

### 4.1 Control Implementation
1. Create control: `src/ui/controls/<ControlName>.js`
2. Follow jsgui3 patterns:
   ```javascript
   const { Control } = require('jsgui3-html');
   
   class MyControl extends Control {
     constructor(spec = {}) {
       super(spec);
       this.__type_name = 'MyControl';
       // ... initialization
     }
     
     compose() {
       const dom = super.compose();
       // ... build DOM structure
       return dom;
     }
   }
   
   module.exports = MyControl;
   ```
3. Add CSS in `src/ui/css/` or inline styles following WLILO design system
4. Export from `src/ui/controls/index.js`

### 4.2 Server Page/Route Implementation
1. For each affected front-end, update or create:
   - Route handler in `src/ui/server/<appName>/<page>Server.js`
   - Page component in `src/ui/server/<appName>/<Page>.js`
2. Wire route in Express app (check main server file)
3. Include proper diagnostics headers:
   ```javascript
   res.set('x-copilot-request-id', requestId);
   res.set('x-copilot-duration-ms', duration);
   ```

### 4.3 Shared Components
1. Reusable components go in `src/ui/server/shared/`
2. Update existing shared components if feature affects them
3. Ensure all front-ends using shared components get the update

---

## Phase 5: Client-Side Activation

### 5.1 Client Component (if interactive)
1. Create or update: `src/ui/client/<component>.js`
2. Register control for client activation:
   ```javascript
   import { registerControl } from 'jsgui3-client';
   import MyControl from '../controls/MyControl';
   
   registerControl('MyControl', MyControl);
   ```
3. Handle events, data binding, API calls

### 5.2 Build Client Bundle
// turbo
1. Run: `npm run ui:client-build`
2. Verify `public/assets/ui-client.js` was updated
3. Check for any esbuild errors

### 5.3 Client Testing
1. Test hydration works correctly
2. Verify events fire properly
3. Check browser console for errors
4. Use diagnostic events: `copilot:<featureName>` pattern

---

## Phase 6: Electron / z-server Integration

### 6.1 Check z-server Requirements
1. Review `z-server/ui/` for components that need updating
2. Check `z-server/main.js` for IPC handlers if needed
3. Update `z-server/renderer.src.js` for client-side integration

### 6.2 z-server Build
// turbo
1. Run from z-server directory: `npm run build`
2. Test in Electron: `npm start`

---

## Phase 7: Cross-Front-End Verification

### 7.1 Verify Each Affected Front-End
For EACH front-end identified in Phase 0.3:
1. Start the relevant server
2. Navigate to feature area
3. Verify feature works correctly
4. Check browser console for errors
5. Document any issues

### 7.2 E2E Testing
1. Create or update E2E tests: `tests/ui/e2e/<feature>.puppeteer.e2e.test.js`
2. Follow event-driven waiting pattern:
   ```javascript
   await page.waitForEvent('copilot:<featureName>', {
     predicate: ev => ev.detail.status === 'success'
   });
   ```
// turbo
3. Run: `npm run test:by-path tests/ui/e2e/<feature>.puppeteer.e2e.test.js`

---

## Phase 8: Documentation

### 8.1 Update Existing Documentation
1. Update `docs/DATABASE_SCHEMA_ERD.md` if schema changed
2. Update `docs/SERVICE_LAYER_GUIDE.md` if new service patterns
3. Update `src/ui/README.md` if UI patterns changed
4. Update any affected front-end docs

### 8.2 Create New Documentation
1. Create feature-specific doc if warranted: `docs/<FEATURE_NAME>.md`
2. Add API reference if new endpoints created
3. Document configuration options

### 8.3 Session Summary
1. Create `docs/sessions/YYYY-MM-DD-<feature-slug>/SESSION_SUMMARY.md`:
   - What was implemented
   - Files changed (list all)
   - How to use the feature
   - Any known limitations
   - Future improvements

### 8.4 Update Index
1. Update `docs/INDEX.md` with new documentation
2. Update `docs/INDEX_FOR_AGENTS.md` if relevant for AI agents

---

## Phase 9: Final Verification

### 9.1 Run Full Test Suite
// turbo
1. Run: `npm test`
2. Fix any failing tests

### 9.2 Run Application
// turbo
1. Run: `npm run ui:data-explorer`
2. Manually verify feature works

### 9.3 Code Review Checklist
- [ ] Database migrations work for both SQLite and Postgres
- [ ] Service layer has proper error handling
- [ ] All affected front-ends updated
- [ ] Client bundle rebuilt
- [ ] E2E tests added/updated
- [ ] Documentation updated
- [ ] Session summary completed

---

## Quick Reference: Key Directories

| Layer | Location |
|-------|----------|
| SQLite Adapter | `src/data/db/sqlite/` |
| Postgres Adapter | `src/data/db/postgres/` |
| Migrations | `src/data/db/migrations/` |
| Services | `src/services/` |
| UI Controls | `src/ui/controls/` |
| UI Lab | `src/ui/lab/` |
| Server Pages | `src/ui/server/<appName>/` |
| Shared UI | `src/ui/server/shared/` |
| Client JS | `src/ui/client/` |
| Client Bundle | `public/assets/ui-client.js` |
| z-server | `z-server/ui/` |
| E2E Tests | `tests/ui/e2e/` |
| Session Docs | `docs/sessions/` |
| Skills | `docs/agi/skills/` |

---

## Notes for AI Agents

- Always create a session folder before starting work
- Log ALL commands run in WORKING_NOTES.md
- Take screenshots/save HTML output for UI changes
- If unsure about patterns, check existing implementations first
- Run labs BEFORE full integration to validate approach
- Every front-end that could use the feature MUST be checked
