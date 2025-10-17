# Planning System Architecture and Consolidation TODO

## Current State (October 2025)

The intelligent crawl system now supports **two separate planning backends**:

### 1. **APS (Advanced Planning Suite)** - `src/planner/`
- **Location**: `src/planner/`
- **Architecture**: Plugin-based GOFAI reasoning system
- **Key Components**:
  - `PlannerHost.js` - Plugin orchestrator
  - `plugins/` - Modular reasoner plugins
    - `GazetteerAwareReasonerPlugin.js` - Country hub predictions from gazetteer
    - `GraphReasonerPlugin.js` - Common hub patterns
    - `QueryCostEstimatorPlugin.js` - Cost-based prioritization
  - `meta/` - Meta-planning and coordination
  - `microprolog/` - Logic programming for symbolic reasoning
- **Features**:
  - Gazetteer-aware country hub discovery (PRIORITY)
  - Symbolic reasoning and pattern matching
  - Plugin architecture for extensibility
  - Cost-aware planning

### 2. **Legacy Planning System** - `src/crawler/planner/`
- **Location**: `src/crawler/planner/`
- **Architecture**: Orchestrator-based sequential execution
- **Key Components**:
  - `PlannerOrchestrator.js` - Stage-based workflow coordinator
  - `PlannerBootstrap.js` - Initial validation
  - `PatternInference.js` - Homepage analysis and pattern detection
  - `CountryHubPlanner.js` - Legacy country hub logic
  - `HubSeeder.js` - Hub URL generation
  - `TargetedAnalysisRunner.js` - Focused analysis tasks
  - `navigation/NavigationDiscoveryRunner.js` - Navigation tree discovery
  - `CompletionReporter.js` - Summary reporting
  - `PlanBlueprintBuilder.js` - Plan capture
  - `AdaptiveSeedPlanner.js` - Dynamic seed planning
- **Status**: Stable, proven in production

### 3. **Integration Layer** - `src/crawler/IntelligentPlanningFacade.js`
- **Purpose**: Clean separation between old and new systems
- **Switching**: Controlled by `advancedPlanningSuite` feature flag in config
- **Design**: No mixing of legacy and APS code - completely separate execution paths

## Configuration

```json
{
  "features": {
    "advancedPlanningSuite": true,  // false = use legacy, true = use APS
    "gazetteerAwareReasoner": true  // APS only - enable country hub predictions
  }
}
```

## TODO: Legacy Planner Consolidation

### Goals
1. **Reduce code duplication** between legacy and APS
2. **Modularize legacy planner** for easier maintenance
3. **Extract shared utilities** (URL normalization, pattern matching, etc.)
4. **Simplify directory structure** without breaking existing functionality

### Proposed Refactoring

#### Phase 1: Extract Shared Utilities
- [ ] Create `src/crawler/planner/utils/` directory
- [ ] Move shared code:
  - URL pattern matching
  - Domain validation
  - Telemetry formatting
  - Result normalization

#### Phase 2: Modularize Legacy Components
- [ ] Each legacy component becomes a self-contained module
- [ ] Clear interfaces between components
- [ ] Reduce coupling to orchestrator
- [ ] Document component responsibilities

#### Phase 3: Consolidate into Single Directory
- [ ] Consider structure like:
  ```
  src/crawler/planner/
    legacy/           # Old orchestrator-based system
      orchestrator.js
      bootstrap.js
      pattern-inference.js
      country-hub.js
      hub-seeder.js
      targeted-analysis.js
      navigation-discovery.js
    aps/              # Or move to src/planner/?
      (already separate in src/planner/)
    shared/           # Utilities used by both
      url-utils.js
      pattern-utils.js
      telemetry-utils.js
    facade.js         # Integration layer
  ```

#### Phase 4: Consider Deprecation Timeline
- [ ] Evaluate when APS can fully replace legacy
- [ ] Migration path for existing crawls
- [ ] Backward compatibility requirements
- [ ] Performance comparison metrics

### Non-Goals
- ❌ Don't merge APS and legacy into single system
- ❌ Don't break existing functionality
- ❌ Don't rush deprecation of legacy system
- ❌ Don't change external APIs

### Benefits of Consolidation
1. **Easier maintenance** - Clear separation of concerns
2. **Reduced duplication** - Shared utilities
3. **Better testing** - Isolated components
4. **Clearer architecture** - Single directory for planning logic
5. **Smoother transition** - Easy to compare old vs new

### Risks
1. **Breaking changes** - Must maintain backward compatibility
2. **Testing overhead** - Need comprehensive tests for refactored code
3. **Time investment** - Significant refactoring effort
4. **Production stability** - Legacy system is battle-tested

### Recommendation
- **Short term**: Keep current structure (clean separation working well)
- **Medium term** (1-2 months): Extract shared utilities, document interfaces
- **Long term** (3-6 months): Full consolidation once APS proves stable

## Current Architecture Status

✅ **Clean separation achieved** - Legacy and APS don't interfere  
✅ **Feature flag switching** - Easy to toggle between systems  
✅ **APS integrated** - CountryHubGapAnalyzer, GazetteerAwareReasonerPlugin working  
✅ **No inline SQL in services** - Database queries in proper modules  
⏳ **Legacy consolidation** - Deferred to allow APS to mature  
⏳ **APS country hub priority** - Implementation in progress  

## Related Documentation
- `src/planner/README.md` - APS architecture
- `src/crawler/planner/` - Legacy component documentation (TODO)
- `docs/HIERARCHICAL_PLANNING_INTEGRATION.md` - Meta-planning concepts
- `docs/GOFAI_ARCHITECTURE.md` - Symbolic reasoning foundation
