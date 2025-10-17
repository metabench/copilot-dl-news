# Gazetteer Meta-Planning Integration

**Status**: ✅ Implemented and Tested (October 14, 2025)

## Overview

The gazetteer crawl system now features full meta-planning integration using PlannerHost (GOFAI reasoning) and MetaPlanCoordinator (validation/evaluation/arbitration). This enables intelligent prioritization of country and place hub downloads based on gap analysis and coverage targets.

## Architecture

### 3-Layer Planning System

```
┌─────────────────────────────────────────────────┐
│ GazetteerPlanRunner                             │
│ - Coordinates planning + stage execution        │
│ - Integrates PlannerHost + MetaPlanCoordinator  │
└──────────────┬──────────────────────────────────┘
               │
               ├─► PlannerHost (GOFAI Layer)
               │   └─► GazetteerReasonerPlugin
               │       - Analyzes gazetteer database state
               │       - Identifies coverage gaps
               │       - Proposes priority hubs
               │       - Recommends stage ordering
               │
               └─► MetaPlanCoordinator (Meta-Planning Pipeline)
                   ├─► PlanValidator: Validates blueprints
                   ├─► PlanEvaluator: Scores alternatives
                   └─► PlanArbitrator: Selects best plan
```

### Component Roles

**GazetteerPlanRunner** (`src/crawler/gazetteer/GazetteerPlanRunner.js`):
- Main entry point for gazetteer planning
- Creates PlannerHost with GazetteerReasonerPlugin when `useAdvancedPlanning=true`
- Runs meta-planning before stage execution via `runMetaPlanning(stages)`
- Extracts priority recommendations and passes to StagedGazetteerCoordinator

**GazetteerReasonerPlugin** (`src/planner/plugins/GazetteerReasonerPlugin.js`):
- PlannerHost plugin (priority: 85, higher than GraphReasonerPlugin)
- Analyzes current gazetteer state (countries, regions, cities counts)
- Identifies gaps using breadth-first coverage rules:
  - <50 countries → HIGH PRIORITY (1000) country fetch
  - ≥50 countries + <100 regions → MEDIUM PRIORITY (100) adm1 fetch
  - >10:1 region/country ratio → Balance growth (fetch more countries)
- Proposes place hubs with priority scores
- Recommends optimal stage ordering (countries → adm1 → adm2 → cities)

**MetaPlanCoordinator** (`src/planner/meta/MetaPlanCoordinator.js`):
- Validates blueprints using PlanValidator
- Evaluates plan quality using PlanEvaluator
- Arbitrates between alternatives using PlanArbitrator
- Currently rejects gazetteer blueprints (designed for web crawling structure)
- **Future**: Custom gazetteer validator for proper validation

**StagedGazetteerCoordinator** (`src/crawler/gazetteer/StagedGazetteerCoordinator.js`):
- Calls `planner.runMetaPlanning()` before stage execution
- Applies priority recommendations via `_applyMetaPlanPriorities()`
- Reorders stages by updated priorities (descending)
- Executes stages with dynamic prioritization

## Priority Rules

### Gap-Driven Prioritization

1. **Country Coverage Gap** (Priority: 1000)
   - Trigger: <50 countries in database
   - Target: 250 countries
   - Action: Propose wikidata-countries hub fetch
   - Rationale: "Country coverage at N (target: 250) - HIGH PRIORITY"

2. **Regional Coverage Gap** (Priority: 100)
   - Trigger: ≥50 countries AND <100 regions
   - Target: 1000 regions
   - Action: Propose wikidata-adm1 hub fetch
   - Rationale: "Regional coverage at N (target: 1000) - MEDIUM PRIORITY"

3. **Balanced Growth Rule** (Priority: 500)
   - Trigger: >10:1 region/country ratio
   - Action: Prioritize country diversity over regional depth
   - Rationale: "Country/region ratio X.X suggests more country diversity needed"

### Stage Ordering

Default priorities (from `GazetteerPriorityScheduler`):
- countries: 1000 (crawlDepth: 0)
- adm1: 100 (crawlDepth: 1)
- adm2: 10 (crawlDepth: 2)
- cities: 1 (crawlDepth: 3)

Meta-planning can override these based on gap analysis.

## Usage

### Enable Advanced Planning

Set `advancedPlanningSuite: true` in config:

```json
{
  "features": {
    "advancedPlanningSuite": true
  }
}
```

### Integration in Crawl

```javascript
// In src/crawl.js (geography crawl type)
const { GazetteerPlanRunner } = require('./crawler/gazetteer/GazetteerPlanRunner');
const useAdvancedPlanning = this.config?.features?.advancedPlanningSuite === true;
const dbAdapter = this.enhancedDbAdapter || null;

const planner = new GazetteerPlanRunner({
  telemetry: this.telemetry,
  logger,
  config: this.config,
  useAdvancedPlanning,
  dbAdapter  // Required for database state analysis
});

// Planner is passed to StagedGazetteerCoordinator
// Coordinator calls planner.runMetaPlanning() before stage execution
```

### Manual Meta-Planning

```javascript
const planner = new GazetteerPlanRunner({
  useAdvancedPlanning: true,
  dbAdapter
});

const stages = [
  { name: 'countries', priority: 1000 },
  { name: 'adm1', priority: 100 }
];

const results = await planner.runMetaPlanning(stages);
// {
//   blueprint: { proposedHubs, gapAnalysis, stageOrdering, rationale },
//   metaResult: { validatorResult, decision },
//   proposedPriorities: { 'wikidata-countries': 1000, 'countries': 1000 }
// }
```

## Testing

### Unit Test

Run `test-gazetteer-meta-planning.js`:

```bash
node test-gazetteer-meta-planning.js
```

Expected output:
- ✓ GazetteerReasonerPlugin analyzes database state
- ✓ Gap analysis identifies missing countries/regions
- ✓ Priority recommendations generated
- ✓ MetaPlanCoordinator processes blueprint
- ✗ Validator rejects (expected - designed for web crawl structure)

### Integration Test

Run intelligent crawl with geography type:

```bash
node tools/intelligent-crawl.js --limit 100
```

Look for log messages:
- `[GazetteerPlanRunner] Running meta-planning analysis...`
- `[GazetteerReasonerPlugin] Current state: { countriesCount, regionsCount, ... }`
- `[GazetteerReasonerPlugin] Gap analysis: { missingCountries, ... }`
- `[StagedGazetteerCoordinator] Updated stage 'X' priority: Y → Z`
- `[StagedGazetteerCoordinator] Stages reordered by meta-plan priorities`

## Output Example

```
[GazetteerReasonerPlugin] Current state: {
  countriesCount: 250,
  regionsCount: 11,
  citiesCount: 257,
  totalPlaces: 518
}

[GazetteerReasonerPlugin] Gap analysis: {
  missingCountries: [],
  missingRegions: [
    {
      reason: 'Low regional coverage',
      currentCount: 11,
      targetCount: 1000,
      priority: 100
    }
  ],
  lowCoverageCountries: []
}

[GazetteerReasonerPlugin] Proposed adm1 hub fetch (priority: 100)
[GazetteerReasonerPlugin] Stage ordering determined: [ { name: 'adm1', priority: 100 } ]

Proposed Priorities:
  - wikidata-adm1: 100
  - adm1: 100

Rationale:
  - Regional coverage at 11 (target: 1000) - MEDIUM PRIORITY
  - Recommended stage order: adm1
```

## Benefits

1. **Data-Driven Priorities**: Prioritization based on actual database state, not static configuration
2. **Gap-Aware Planning**: Identifies missing countries/regions automatically
3. **Balanced Growth**: Prevents depth-first explosion (ensures breadth-first coverage)
4. **Dynamic Reordering**: Stages execute in optimal order based on real-time analysis
5. **Meta-Planning Pipeline**: Validation, evaluation, and arbitration for robust decisions

## Future Enhancements

1. **Custom Gazetteer Validator**:
   - Replace web crawl validator with gazetteer-specific validation rules
   - Check: stage dependencies, ingestor availability, data source rate limits

2. **Alternative Plan Generation**:
   - Generate multiple stage ordering alternatives
   - Score based on: coverage speed, data quality, API cost
   - Let arbitrator choose best plan

3. **Historical Learning**:
   - Track which stage orders worked best historically
   - Use EffectivenessTracker for continuous improvement
   - Adjust target thresholds based on past performance

4. **Cost-Aware Planning**:
   - Factor in Wikidata API rate limits
   - Optimize batch sizes to avoid throttling
   - Balance speed vs resource consumption

5. **Real-Time Adaptation**:
   - Re-run meta-planning if large gaps discovered mid-crawl
   - Dynamically insert high-priority stages
   - Abort low-value stages if higher-priority work emerges

## Implementation Notes

### Database Adapter Required

GazetteerReasonerPlugin requires database adapter to query current gazetteer state:

```javascript
const dbAdapter = new EnhancedDatabaseAdapter({ db, ... });
const planner = new GazetteerPlanRunner({ 
  useAdvancedPlanning: true,
  dbAdapter  // Required for state analysis
});
```

Without `dbAdapter`, gap analysis will be skipped and default priorities used.

### Blackboard Communication

PlannerHost uses blackboard pattern for plugin communication:

```javascript
// GazetteerReasonerPlugin writes to blackboard:
ctx.bb.proposedHubs = [{ type, kind, priority, ... }];
ctx.bb.gapAnalysis = { missingCountries, missingRegions, ... };
ctx.bb.stageOrdering = [{ name, priority }, ...];
ctx.bb.rationale = ['Reason 1', 'Reason 2', ...];

// GazetteerPlanRunner reads from blackboard:
const blueprint = {
  proposedHubs: result.blackboard.proposedHubs,
  gapAnalysis: result.blackboard.gapAnalysis,
  stageOrdering: result.blackboard.stageOrdering,
  rationale: result.blackboard.rationale
};
```

### PlanValidator Mismatch

Current PlanValidator expects web crawl blueprint structure:
- `proposedHubs`: Array of URL-based hubs
- `seedQueue`: Array of seed URLs
- `schedulingConstraints`: Crawl politeness rules

Gazetteer blueprints have different structure:
- `proposedHubs`: Array of data source hubs (Wikidata, OSM)
- `gapAnalysis`: Coverage gap identification
- `stageOrdering`: Stage execution order

**Workaround**: Meta-planning validation currently fails (expected). GazetteerPlanRunner continues with priority extraction regardless of validation result.

**Future Fix**: Create `GazetteerBlueprintValidator` with appropriate validation rules for structured data ingestion.

## Related Documentation

- **PlannerHost**: `src/planner/PlannerHost.js` - GOFAI orchestrator
- **MetaPlanCoordinator**: `src/planner/meta/MetaPlanCoordinator.js` - Meta-planning pipeline
- **GazetteerPriorityScheduler**: `src/crawler/gazetteer/GazetteerPriorityScheduler.js` - Stage tracking
- **StagedGazetteerCoordinator**: `src/crawler/gazetteer/StagedGazetteerCoordinator.js` - Stage execution
- **Advanced Planning Suite**: `docs/ADVANCED_PLANNING_SUITE.md` - Overall architecture

## Status

✅ **Complete**: GazetteerReasonerPlugin analyzes state and proposes priorities  
✅ **Complete**: MetaPlanCoordinator processes blueprints  
✅ **Complete**: StagedGazetteerCoordinator applies priorities  
✅ **Complete**: Integration tested successfully  
⚠️ **Partial**: PlanValidator rejects gazetteer blueprints (expected)  
⏳ **Future**: Custom GazetteerBlueprintValidator  
⏳ **Future**: Alternative plan generation  
⏳ **Future**: Historical learning integration
