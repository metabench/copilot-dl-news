# Advanced Planning Suite — GOFAI Architecture

**Status**: MVP Complete (October 2025)  
**Integration**: AsyncPlanRunner with optional PlannerHost mode  
**Key Feature**: Query cost estimation from historical telemetry  
**When to Read**: Read this when implementing advanced planning features, understanding GOFAI architecture, working with the PlannerHost plugin system, or integrating cost-based plan prioritization. This is NOT for basic crawl planning - see AsyncPlanRunner for simpler use cases.

---

## Overview

The **AdvancedPlanningSuite** introduces a **GOFAI (Good Old-Fashioned AI)** planning layer on top of the existing async preview system. Unlike the basic preview (which runs IntelligentPlanRunner in dry-run mode), the advanced suite uses:

- **Cooperative multi-plugin architecture** with blackboard working memory
- **Historical query telemetry** for cost-based plan prioritization
- **Time budget enforcement** (default: 3.5s)
- **Plugin lifecycle orchestration** (init/tick/teardown)
- **Real-time SSE telemetry** with `gofai-trace` events

This enables intelligent, cost-aware planning that learns from historical crawl performance.

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                      AsyncPlanRunner                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  usePlannerHost flag determines planner mode:        │   │
│  │  • false → IntelligentPlanRunner (basic preview)     │   │
│  │  • true  → PlannerHost (GOFAI suite)                 │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                       PlannerHost                           │
│  Cooperative ticking loop with time budget enforcement      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Blackboard (Shared Memory)               │   │
│  │  • proposedHubs: Array<Object>                      │   │
│  │  • seedQueue: Array<Object>                         │   │
│  │  • costEstimates: Object                            │   │
│  │  • rationale: Array<string>                         │   │
│  │  • graphHubsReady: boolean                          │   │
│  │  • hubSeedingComplete: boolean                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                            ↓                                │
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────┐ │
│  │ GraphReason │  │ QueryCostEstim. │  │ RuleEngine ... │ │
│  │   Plugin    │  │     Plugin      │  │   (future)     │ │
│  │ priority:80 │  │   priority:70   │  │                │ │
│  └─────────────┘  └─────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Meta-Planning Layer (NEW – October 2025)

Once the blackboard snapshot is built, every preview now flows through a
meta-layer that validates, scores, and arbitrates competing plan sources before
the result is published to the UI. The orchestration lives in
`MetaPlanCoordinator` and wires the sequence:

```
PlannerHost → PlanValidator → PlanEvaluator → PlanArbitrator
                │                 │               │
                │                 │               ├─ DecisionLogger (immutable log)
                │                 ├─ EffectivenessTracker (preview telemetry)
                └─ RiskScorer / ReplaySimulator / ExperimentManager (side inputs)
```

| Component             | Responsibility                                                                           | Status |
| --------------------- | ---------------------------------------------------------------------------------------- | ------ |
| `PlanValidator`       | Deduplicate/sanitise blueprint, enforce robots/concurrency/trap/risk gates               | ✅ live |
| `PlanEvaluator`       | Produce unified scorecard with weighted metrics + recommendation                         | ✅ live |
| `PlanArbitrator`      | Choose `accept_microprolog` / `accept_alternative` / `fuse` / `replan` / `seek_human`   | ✅ live |
| `PlanFusion`          | Safety-first rank-interleaving for blended plans                                         | ✅ live |
| `EffectivenessTracker`| Collect preview scores & execution KPIs for weekly rollups                               | ✅ live |
| `DecisionLogger`      | Append immutable audit entries and emit `planner-decision` telemetry                     | ✅ live |
| `ExperimentManager`   | Controls A/B, epsilon-greedy bandit, team-draft interleaving modes                       | 🔬 design |
| `ReplaySimulator`     | Offline replay against archived snapshots to derisk MicroProlog plans                    | 🔬 design |
| `RiskScorer`          | Geo/policy risk estimation feeding Validator & Arbitrator                                | ✅ live |

The validator thresholds start at `trap_risk ≤ 0.2`, `robots_ok = 100%`,
minimum one seed, and host parallelism ≤ 3. Sanitised blueprints (deduped seeds,
hubs, constraints) are what downstream components now consume.

#### Unified Scorecard (PlanEvaluator)

| Dimension          | Metric(s)                                 | Why it matters                                      | Data source(s)                      |
| ------------------ | ----------------------------------------- | -------------------------------------------------- | ----------------------------------- |
| Coverage / Novelty | `coverage_novelty`                        | Avoid duplicative crawl effort                     | SeedQueue, historical novelty lift  |
| Compliance         | `policy_compliance`                       | Robots/concurrency guardrails                      | PlanValidator metrics               |
| Trap Risk          | `trap_risk` (inverted)                    | Prevent pagination/session loops                   | Sanitised rationale / heuristics    |
| Feasibility        | `feasibility`                             | CSP/politeness viability                           | Scheduling constraints + robots     |
| Cost / Time        | `cost_time`                               | Stay within crawl budgets                          | Cost estimates + telemetry history  |
| Precision Proxy    | `precision_proxy`                         | Confidence seeds land on valid content             | Historical seed precision           |
| Explainability     | `explainability`                          | Preview approval and operator trust                | Rationale depth + proof digests     |
| Stability          | `stability`                               | Robustness to small perturbations                  | Historical sensitivity index        |
| Diversity          | `diversity`                               | Avoid monoculture plans                            | Host/path entropy                   |

Weights default to `coverage:0.18`, `compliance:0.14`,
`trap:0.12`, `feasibility:0.14`, `cost:0.12`, `precision:0.12`,
`explainability:0.09`, `stability:0.05`, `diversity:0.04`. Scores ≥ 0.7 with
explainability and precision ≥ 0.6 trigger automatic MicroProlog acceptance; 0.5
– 0.7 moves to safety-first fusion.

#### Arbitration Policies

- **Gate-first**: invalid blueprints short-circuit to `replan` with reasons.
- **Static thresholds**: MicroProlog accepted when score/metrics clear
  thresholds; alternatives accepted using the same ladder.
- **Safety-first fusion**: guarantees a ≥20% budget for validated MicroProlog
  seeds while blending top alternatives via `PlanFusion` interleaving.
- **Bandit ready**: `ExperimentManager` exposes epsilon-greedy selection; replay
  and effectiveness metrics feed future contextual policies.

Every arbitration outcome is logged to `DecisionLogger` (persisted for audit)
and surfaced in preview summaries (`blueprint.meta.decision`).

### Blackboard Pattern

The **blackboard** is a shared working memory where plugins coordinate:

```javascript
{
  // Stage completion flags
  bootstrapComplete: boolean,
  patternInferenceComplete: boolean,
  graphHubsReady: boolean,
  hubSeedingComplete: boolean,
  
  // Plan artifacts
  proposedHubs: [
    { url, source, confidence, reason }
  ],
  seedQueue: [ { url, depth, type } ],
  
  // Cost analysis (QueryCostEstimatorPlugin)
  costEstimates: {
    available: true,
    model: { totalSamples, queryTypes },
    hubCosts: [
      { hubUrl, estimatedMs, confidence }
    ],
    totalEstimatedMs: number,
    highCostCount: number
  },
  
  // Rationale for preview UI
  rationale: [
    "Graph analysis proposed 5 hubs",
    "All hubs have acceptable costs (< 500ms)"
  ]
}
```

---

## Plugins

### 1. GraphReasonerPlugin ✅ COMPLETE

**Purpose**: Fast hub proposals from domain analysis  
**Priority**: 80 (high)  
**Ticks**: 1 (completes immediately)

**Strategy**:
- Proposes common hub paths (`/news`, `/articles`, `/blog`, etc.)
- Marks `bb.graphHubsReady = true`
- Emits `gofai-trace` with hub count

**Example Output**:
```javascript
bb.proposedHubs = [
  { url: 'https://example.com/news', source: 'graph-reasoner', confidence: 0.7, reason: 'Common hub pattern: /news' }
]
```

### 2. QueryCostEstimatorPlugin ✅ COMPLETE

**Purpose**: Cost-based prioritization from historical telemetry  
**Priority**: 70 (medium-high)  
**Ticks**: 1 (completes after model build)

**Strategy**:
1. Read query telemetry from `query_telemetry` table
2. Build cost model: `{ queryType → avgDurationMs }`
3. Estimate costs for proposed hubs
4. Warn if any hub exceeds budget threshold (default: 500ms)

**Cost Model**:
```javascript
{
  totalSamples: 150,
  queryTypes: {
    'fetch_articles': {
      avgDurationMs: 87.5,
      minDurationMs: 50,
      maxDurationMs: 200,
      sampleCount: 50
    }
  }
}
```

**Example Output**:
```javascript
bb.costEstimates = {
  available: true,
  model: { ... },
  hubCosts: [
    { hubUrl: 'https://example.com/news', estimatedMs: 70, confidence: 0.8 }
  ],
  totalEstimatedMs: 350,
  highCostCount: 0
}
bb.rationale.push('All proposed hubs have acceptable estimated costs (< 500ms)');
```

### 3. RuleEnginePlugin ⏳ PLANNED

**Purpose**: Forward-chaining rule DSL for heuristics  
**Priority**: 60 (medium)

**Rule DSL**:
```javascript
[
  {
    name: 'robots-txt-heuristic',
    when: (ctx) => ctx.bb.hasRobotsTxt && ctx.bb.robotsHasSitemap,
    then: (ctx) => {
      ctx.bb.rationale.push('robots.txt indicates sitemap available');
      ctx.bb.useSitemap = true;
    }
  }
]
```

**Working Memory**:
- Facts: Assertions from previous plugins
- Fired rules: Track which rules applied
- Emit `gofai-trace` on rule activation

### 4. HTNPlugin ⏳ PLANNED

**Purpose**: Hierarchical task network decomposition  
**Strategy**: Expand high-level tasks (e.g., "crawl domain") into subtasks (fetch hub → seed queue → analyze)

### 5. CSPPolitenessPlugin ⏳ PLANNED

**Purpose**: Constraint satisfaction for scheduling  
**Strategy**: Ensure politeness delays, rate limits, concurrent request limits

### 6. ExplanationPlugin ⏳ PLANNED

**Purpose**: Generate human-readable rationale  
**Strategy**: Synthesize blackboard state into coherent explanation for preview UI

---

## Query Telemetry Schema

**Table**: `query_telemetry`  
**Purpose**: Record database query performance for cost estimation

```sql
CREATE TABLE query_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query_type TEXT NOT NULL,           -- 'fetch_articles', 'lookup_place', etc.
  operation TEXT NOT NULL,            -- 'SELECT', 'INSERT', 'UPDATE', 'DELETE'
  duration_ms REAL NOT NULL,          -- Query execution time
  result_count INTEGER DEFAULT 0,     -- Rows returned/affected
  query_complexity TEXT,              -- 'simple' | 'moderate' | 'complex'
  host TEXT,                          -- Domain (if applicable)
  job_id TEXT,                        -- Crawl job ID (if applicable)
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  metadata TEXT                       -- JSON: { table, filters, etc. }
);
```

**Recording Queries**:
```javascript
const { recordQuery } = require('./db/queryTelemetry');

const start = Date.now();
const results = db.prepare('SELECT * FROM articles WHERE domain = ?').all(domain);
recordQuery(db, {
  queryType: 'fetch_articles',
  operation: 'SELECT',
  durationMs: Date.now() - start,
  resultCount: results.length,
  complexity: 'simple',
  host: domain,
  metadata: { table: 'articles', filters: ['domain'] }
});
```

**Aggregating Stats**:
```javascript
const { getQueryStats } = require('./db/queryTelemetry');

const stats = getQueryStats(db, { queryType: 'fetch_articles' });
// [{ query_type, avg_duration_ms, sample_count, ... }]
```

---

## Enabling PlannerHost Mode

### 1. Server Configuration

In `src/ui/express/server.js`, enable PlannerHost when creating AsyncPlanRunner:

```javascript
const asyncPlanRunner = new AsyncPlanRunner({
  planningSessionManager,
  logger: console,
  emitEvent: realtime.broadcast.bind(realtime),
  usePlannerHost: true,        // ← Enable GOFAI suite
  dbAdapter: db                // ← Required for query telemetry
});
```

### 2. API Response Format

When `usePlannerHost: true`, the plan blueprint includes GOFAI-specific fields:

```json
{
  "sessionId": "preview-abc123",
  "status": "ready",
  "blueprint": {
    "gofaiResult": {
      "blackboard": { ... },
      "elapsedMs": 1250,
      "budgetExceeded": false,
      "statusReason": "Planning completed successfully"
    },
    "proposedHubs": [
      { "url": "https://example.com/news", "source": "graph-reasoner", "confidence": 0.7 }
    ],
    "costEstimates": {
      "available": true,
      "hubCosts": [
        { "hubUrl": "https://example.com/news", "estimatedMs": 70, "confidence": 0.8 }
      ]
    },
    "rationale": [
      "Graph analysis proposed 5 hubs",
      "All hubs have acceptable costs (< 500ms)"
    ]
  }
}
```

### 3. SSE Telemetry Events

PlannerHost emits `gofai-trace` events during planning:

```javascript
{
  type: 'gofai-trace',
  data: {
    pluginId: 'query-cost-estimator',
    stage: 'tick',
    message: 'Estimated cost for 5 hub(s)',
    data: {
      totalEstimatedMs: 350,
      avgCostPerHub: 70,
      highCostCount: 0
    }
  },
  timestamp: 1696800000000
}
```

---

## Testing

### Unit Tests

**PlannerHost**:
```bash
npm run test:file "PlannerHost"
```

- ✅ Single plugin execution
- ✅ Telemetry event capture
- ✅ Time budget enforcement
- ✅ Plugin failure handling
- ✅ Priority-based sorting

**QueryCostEstimatorPlugin**:
```bash
npm run test:file "QueryCostEstimatorPlugin"
```

- ✅ Cost model building from telemetry
- ✅ Hub cost estimation
- ✅ High-cost warnings
- ✅ Missing telemetry graceful handling

**Query Telemetry**:
```bash
npm run test:file "queryTelemetry"
```

- ✅ Record telemetry
- ✅ Aggregate statistics
- ✅ Filter by complexity
- ✅ Prune old data

### Integration Tests

Test full preview flow with PlannerHost:

```javascript
const app = createApp({ dbPath, usePlannerHost: true });

const res = await request(app)
  .post('/api/crawl/plan')
  .send({ startUrl: 'https://example.com', plannerEnabled: true })
  .expect(200);

expect(res.body.session.blueprint.gofaiResult).toBeDefined();
expect(res.body.session.blueprint.costEstimates).toBeDefined();
```

---

## Performance Characteristics

**Time Budget**: 3.5s default (configurable)  
**Plugin Ticks**: 1-10 iterations per plugin (cooperative yielding)  
**Query Telemetry Overhead**: <5ms per query (async recording)

**Typical Execution**:
- GraphReasonerPlugin: 10-50ms (1 tick)
- QueryCostEstimatorPlugin: 50-200ms (1 tick, DB query)
- Total: 100-500ms for MVP suite

**Budget Enforcement**:
- Plugins tick cooperatively (yield per loop)
- If budget exhausted → teardown gracefully
- Return partial results with `budgetExceeded: true`

---

## Extension Points

### Adding New Plugins

1. Implement plugin interface:
```javascript
class MyPlugin {
  constructor({ priority = 50 } = {}) {
    this.pluginId = 'my-plugin';
    this.priority = priority;
  }
  
  async init(ctx) { ... }
  async tick(ctx) { return isDone; }
  async teardown(ctx) { ... }
}
```

2. Register in `src/planner/register.js`:
```javascript
const standardPlugins = [
  new GraphReasonerPlugin({ priority: 80 }),
  new QueryCostEstimatorPlugin({ priority: 70 }),
  new MyPlugin({ priority: 60 })
];
```

3. Test independently:
```javascript
const host = new PlannerHost({
  plugins: [new MyPlugin()],
  options: { ... }
});
const result = await host.run();
```

### Future Plugin Ideas

1. **MicroPrologPlugin** ⭐ **Priority Extension**
   - Horn-clause reasoner for symbolic seed validation and ranking
   - SLD resolution with backtracking and proof trees
   - Sandboxed, explainable, time-boxed queries
   - See: `src/planner/microprolog/` (isolated, not in execution path)
   - Use cases: robots.txt compliance, trap pattern checking, seed prioritization
   - Integration: Projects blackboard to Prolog facts, queries for `safe_seed/1`, `priority_seed/1`

2. **RuleEnginePlugin**: Forward-chaining with Rete network (optional)
3. **HTNPlugin**: Hierarchical task network decomposition
4. **STRIPSPlugin**: Classical planning with preconditions/effects
5. **CSPPolitenessPlugin**: Constraint satisfaction for scheduling
6. **TemporalLogicValidatorPlugin**: LTL/CTL checks for plan correctness
7. **ExplanationPlugin**: Rich rationale generation with proof digests
8. **DatalogPlugin**: Stratified negation, semi-naive evaluation
9. **PDDLPlugin**: Import PDDL domains for richer planning
10. **GNN Novelty Predictor**: Machine learning for hub quality prediction
11. **HeuristicSearchPlugin**: A* or beam search for optimal plan paths

---

## MicroProlog Extension (Isolated)

**Status**: Architecture defined, not in execution path  
**Location**: `src/planner/microprolog/` (future)  
**Purpose**: Symbolic reasoning for seed validation, trap detection, robots compliance

### Key Features

- **Horn-clause logic**: Facts + rules with SLD resolution
- **Proof trees**: Explainable "why" chains for seed decisions
- **Sandboxed**: No side effects, time-boxed, cancelable
- **Query-driven**: Ask `safe_seed(URL)`, get bindings + justifications

### Integration Design (Not Yet Active)

```javascript
// Future: MicroPrologPlugin projects blackboard to facts
const plugin = new MicroPrologPlugin({
  priority: 65,
  rulePacks: ['news-domain', 'robots-compliance'],
  maxSolutions: 100,
  budgetMs: 500
});

// Blackboard → Prolog facts
// hub(URL) ← bb.proposedHubs
// robots_allow(Path) ← bb.robotsPolicy
// trap_pattern(Regex) ← bb.trapPatterns
// novelty_score(Host, Score) ← bb.noveltyScores

// Query: safe_seed(URL) :- hub(URL), robots_allow(URL), \+ trap_pattern(URL).
// Returns: bindings + proof tree → bb.validatedSeeds

// Rationale: "Seed X validated by rule R3, facts F1/F2, no traps"
```

### Class Structure (Inheritance Map)

```
PlannerPlugin (abstract)
  ├─ MicroPrologPlugin ← orchestrates KB + queries
  
MicroPrologEngine ← SLD resolution loop
  ├─ MicroPrologKnowledgeBase ← predicates, clauses, indexing
  ├─ MicroPrologUnifier ← unification with trail
  ├─ MicroPrologProofTree ← explanation capture
  
MicroPrologTerm (abstract)
  ├─ Atom
  ├─ Variable
  ├─ NumberTerm
  ├─ Compound
  └─ ListTerm
```

### Safety & Sandboxing

- No network I/O, no filesystem access in preview
- Time budget: ≤ 700ms for ≤ 5k clauses
- Step counter: prevents infinite loops
- Memory ceiling: truncate cleanly if exceeded
- Clause validation: reject forbidden functors, cap sizes

### Use Cases

1. **Seed Validation**: Prove seeds are robots-compliant, non-trap
2. **Conflict Detection**: Find contradictions in allowlists
3. **Heuristic Amplification**: Combine graph novelty with strict rules
4. **Counterfactuals**: "What must change to admit this hub?"

### Extension Tracks

- **Tabling (SLG)**: Cache subgoals, avoid loops
- **CLP(FD)**: Integrate schedule constraints symbolically
- **Datalog Mode**: Stratified negation, semi-naive evaluation
- **Negation-as-failure**: `not/1` with closed-world assumption
- **Cut (`!`)**: Prune choice points for performance

### Performance Targets (MVP)

- Load ≤ 5k clauses in ≤ 100ms
- Return ≥ 10 validated seeds in ≤ 700ms
- Produce ≥ 1 rationale entry with proof chain
- Honor time budget and cancellation
- Zero side effects, zero network calls

---

## Comparison: Basic Preview vs GOFAI Suite

| Feature | Basic Preview | GOFAI Suite |
|---------|---------------|-------------|
| **Planner** | IntelligentPlanRunner (dry-run) | PlannerHost (plugin-based) |
| **Cost Awareness** | No | ✅ Yes (telemetry-based) |
| **Extensibility** | Monolithic pipeline | ✅ Pluggable architecture |
| **Time Budget** | Fixed 120s | ✅ Configurable 3.5s |
| **Rationale** | Limited | ✅ Rich explanation |
| **Telemetry** | planner-stage events | ✅ gofai-trace events |
| **Use Case** | Quick preview | **Cost-optimized planning** |

---

## Migration Path

**Phase 1** (Current): Basic preview as default  
**Phase 2** (Optional): Enable PlannerHost via `usePlannerHost: true`  
**Phase 3** (Future): Add RuleEngine, HTN, CSP plugins  
**Phase 4** (Future): Make GOFAI default, deprecate basic preview

No breaking changes — both modes coexist via feature flag.

---

## References

- **AGENTS.md**: AI agent workflow and refactoring guide
- **ASYNC_PLANNER_PREVIEW.md**: Basic preview architecture
- **docs/DATABASE_NORMALIZATION_PLAN.md**: Schema evolution strategy
- **src/planner/PlannerHost.js**: Core orchestrator implementation
- **src/planner/plugins/QueryCostEstimatorPlugin.js**: Cost estimation logic
- **src/db/queryTelemetry.js**: Telemetry recording utilities

---

**Status**: MVP Complete — GraphReasonerPlugin + QueryCostEstimatorPlugin operational  
**Next Steps**: Add RuleEnginePlugin, integrate with UI preview display
