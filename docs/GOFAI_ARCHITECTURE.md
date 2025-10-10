# GOFAI Planning Architecture

**When to Read**: When exploring advanced planning systems for crawls, understanding STRIPS planning, or implementing intelligent crawl sequencing. NOT currently in execution path - future research. — Complete System Design

**Status**: Partial MVP (October 2025)  
**Completed**: PlannerHost, GraphReasonerPlugin, QueryCostEstimatorPlugin  
**In Progress**: MicroProlog design (isolated, not in execution path)  
**Planned**: RuleEngine, HTN, STRIPS, CSP, Temporal, Explanation plugins

---

## System Overview

The **GOFAI (Good Old-Fashioned AI) Planning Suite** provides symbolic, explainable planning for intelligent web crawling. It combines multiple AI paradigms:

- **Graph reasoning**: Novelty scoring, centrality analysis
- **Cost estimation**: Query telemetry analysis (✅ MVP)
- **Rule-based reasoning**: Forward-chaining heuristics
- **Logic programming**: Horn-clause validation (MicroProlog)
- **Classical planning**: STRIPS/HTN operator decomposition
- **Constraint satisfaction**: Schedule windows, rate limits
- **Temporal logic**: LTL/CTL invariant checking
- **Explanation**: Human-readable rationale generation

All plugins operate on a shared **blackboard** with time budgets, cooperative ticking, and incremental telemetry.

---

## Class Inventory & Inheritance

### Orchestration Layer

| Class | Purpose | Parent |
|-------|---------|--------|
| `PlannerHost` | Plugin orchestrator, time budget, blackboard lifecycle | — |
| `PlanningSessionManager` | Session TTL, status transitions | — |
| `AsyncPlanRunner` | Async preview, SSE streaming | — |
| `PlanTelemetryEmitter` | Event shaping (planner-stage, gofai-trace) | — |
| `PlannerEventBus` | Internal pub/sub for SSE bridge | — |
| `PlanContext` | Immutable session snapshot (IDs, options, timing) | — |
| `Blackboard` | Shared working memory (facts, artifacts) | — |
| `PlanBlueprint` | Structured preview output | — |
| `PlanCaptureAdapter` | Dry-run adapter (no DB writes) | — |
| `PlannerConfig` | Normalized config/options, limits, flags | — |

### Plugin Base & Concrete Implementations

| Class | Purpose | Parent | Status |
|-------|---------|--------|--------|
| `PlannerPlugin` | Base lifecycle (init/tick/teardown) | — | ✅ MVP |
| `GraphReasonerPlugin` | Host graph, novelty heuristics | `PlannerPlugin` | ✅ MVP |
| `QueryCostEstimatorPlugin` | Telemetry-based cost model | `PlannerPlugin` | ✅ MVP |
| `RuleEnginePlugin` | Forward-chaining, optional Rete | `PlannerPlugin` | ⏳ Planned |
| `HTNPlugin` | Hierarchical task decomposition | `PlannerPlugin` | ⏳ Planned |
| `STRIPSPlugin` | Operator grounding, search | `PlannerPlugin` | ⏳ Planned |
| `CSPPolitenessPlugin` | Schedule windows, rate limits | `PlannerPlugin` | ⏳ Planned |
| `TemporalLogicValidatorPlugin` | LTL/CTL checks | `PlannerPlugin` | ⏳ Planned |
| `ExplanationPlugin` | Rationale assembly | `PlannerPlugin` | ⏳ Planned |
| `MicroPrologPlugin` | Horn-clause queries | `PlannerPlugin` | 🔬 Design |

### Rule Engine (Internal)

| Class | Purpose | Parent |
|-------|---------|--------|
| `Rule` | Name, conditions, actions | — |
| `RuleSet` | Collection + salience/order | — |
| `WorkingMemory` | Asserted/derived facts | — |
| `ReteNetwork` | Alpha/beta network (optional) | — |
| `AlphaNode` | Filter node in Rete | — |
| `BetaNode` | Join node in Rete | — |
| `RuleTracer` | Fires, activations, conflict resolution trace | — |

### HTN (Internal)

| Class | Purpose | Parent |
|-------|---------|--------|
| `Task` | Abstract task symbol | — |
| `Method` | Task → subtasks + guards | — |
| `HTNLibrary` | Registry of methods | — |
| `HTNAgenda` | Pending tasks stack/queue | — |
| `HTNDecomposer` | Method selection strategy | — |

### STRIPS / Classical Planning (Internal)

| Class | Purpose | Parent |
|-------|---------|--------|
| `Predicate` | Symbolic predicate signature | — |
| `State` | Set of grounded literals | — |
| `Operator` | Preconditions, add/delete lists, cost | — |
| `OperatorLibrary` | Domain operators | — |
| `Heuristic` | h(n) provider (goal count, relaxed plan) | — |
| `SearchNode` | (state, g, h, parent, op) | — |
| `AStarPlanner` | Best-first/A* over operator space | — |

### CSP / Scheduling (Internal)

| Class | Purpose | Parent |
|-------|---------|--------|
| `ConstraintSolver` | Abstract API (variables, domains, constraints) | — |
| `PolitenessConstraintSolver` | Backtracking/min-conflicts | `ConstraintSolver` |
| `Variable` | CSP variable | — |
| `Domain` | Value domain | — |
| `Constraint` | Relation over variables | — |
| `Assignment` | Variable → value binding | — |
| `ScheduleWindow` | Per-host time windows | — |
| `TokenBucket` | Rate limiting state | — |

### Graph Reasoning (Internal)

| Class | Purpose | Parent | Status |
|-------|---------|--------|--------|
| `HostGraph` | Nodes/edges of hosts | — | ✅ Partial |
| `HostNode` | Host vertex | — | ✅ Partial |
| `HostEdge` | Link edge | — | ✅ Partial |
| `GraphMetrics` | Degree, centrality, k-core | — | ⏳ Planned |
| `NoveltyScorer` | Change likelihood, freshness | — | ⏳ Planned |

### Temporal Logic (Internal)

| Class | Purpose | Parent |
|-------|---------|--------|
| `TemporalSpec` | Named LTL/CTL requirement | — |
| `TemporalChecker` | Evaluates specs over transitions | — |
| `LTLFormula` | AST for G/F/X/U operators | — |
| `CTLFormula` | AST for A/E operators | — |
| `TransitionSystem` | Finite model of planned stages | — |

### Explanation & Rationale (Internal)

| Class | Purpose | Parent |
|-------|---------|--------|
| `ExplanationBuilder` | Composes why/why-not narratives | — |
| `Rationale` | Structured entries (proofs, checks, failures) | — |
| `TraceEvent` | Cross-plugin trace artifact | — |

### MicroProlog Inner Core (Isolated)

**Location**: `src/planner/microprolog/` (future)  
**Status**: Architecture defined, NOT in current execution path

| Class | Purpose | Parent |
|-------|---------|--------|
| `MicroPrologEngine` | SLD resolution loop, backtracking, budgets | — |
| `MicroPrologKnowledgeBase` | Predicates → clauses, indexing | — |
| `MicroPrologClause` | `head :- body₁,…,bodyₙ` | — |
| `MicroPrologTerm` | Base class for terms | — |
| `Atom` | Atom term | `MicroPrologTerm` |
| `Variable` | Variable term | `MicroPrologTerm` |
| `NumberTerm` | Numeric term | `MicroPrologTerm` |
| `Compound` | Compound term (functor/arity) | `MicroPrologTerm` |
| `ListTerm` | List term (syntactic sugar) | `MicroPrologTerm` |
| `MicroPrologIndex` | Functor/arity + first-arg indexing | — |
| `MicroPrologUnifier` | Unification with trail, occurs-check | — |
| `MicroPrologTrail` | Variable bindings stack | — |
| `MicroPrologChoicePoint` | Backtracking alternatives | — |
| `MicroPrologQuery` | Goal list, options (maxDepth, maxSolutions) | — |
| `MicroPrologProofTree` | Clause applications + bindings | — |
| `MicroPrologBuiltins` | Safe built-ins registry | — |
| `MicroPrologOptions` | Limits (time, steps, sizes) | — |
| `MicroPrologTracer` | Call/exit/fail, solution events | — |

### Utilities / Policies

| Class | Purpose |
|-------|---------|
| `URLCanonicalizer` | URL normalization |
| `DedupSignature` | MinHash/SimHash projections |
| `TrapPatternSet` | Trap detection rules |
| `RobotsPolicy` | robots.txt parsing/compliance |
| `RateLimitProfile` | Per-host rate limits |

---

## Inheritance Diagram

```
PlannerPlugin (abstract)
  ├── GraphReasonerPlugin ✅
  ├── QueryCostEstimatorPlugin ✅
  ├── RuleEnginePlugin ⏳
  ├── HTNPlugin ⏳
  ├── STRIPSPlugin ⏳
  ├── CSPPolitenessPlugin ⏳
  ├── TemporalLogicValidatorPlugin ⏳
  ├── ExplanationPlugin ⏳
  └── MicroPrologPlugin 🔬

ConstraintSolver (abstract)
  └── PolitenessConstraintSolver ⏳

MicroPrologTerm (abstract) 🔬
  ├── Atom
  ├── Variable
  ├── NumberTerm
  ├── Compound
  └── ListTerm

All other classes use composition (not inheritance).
```

**Legend**:
- ✅ MVP Complete
- ⏳ Planned
- 🔬 Design phase (isolated)

---

## Data Flow

### 1. Preview Request (SSE-enabled)

```
User → POST /api/crawl/plan
  ↓
AsyncPlanRunner.startPreview()
  ↓
PlanningSessionManager.createSession()
  ↓
PlannerHost.run() [if usePlannerHost: true]
  ↓
Cooperative ticking loop:
  - GraphReasonerPlugin.tick() → bb.proposedHubs
  - QueryCostEstimatorPlugin.tick() → bb.costEstimates
  - (future: MicroPrologPlugin.tick() → bb.validatedSeeds)
  - (future: RuleEnginePlugin.tick() → bb.derivedFacts)
  ↓
PlanBlueprint assembly
  ↓
SSE: plan-preview event
  ↓
User sees preview UI with rationale
```

### 2. Blackboard State Evolution

```
Init:
  bb = {
    proposedHubs: [],
    costEstimates: {},
    validatedSeeds: [],
    rationale: []
  }

After GraphReasonerPlugin:
  bb.proposedHubs = [
    { url: '/news', source: 'graph-reasoner', confidence: 0.7 }
  ]
  bb.graphHubsReady = true

After QueryCostEstimatorPlugin:
  bb.costEstimates = {
    hubCosts: [{ hubUrl: '/news', estimatedMs: 70 }],
    totalEstimatedMs: 350
  }

After MicroPrologPlugin (future):
  bb.validatedSeeds = [
    { url: '/news', proof: ['robots_allow', 'no_trap'], confidence: 0.9 }
  ]
  bb.rationale.push('Seed /news validated by rule R3, no traps detected')
```

---

## MicroProlog Integration Design (Isolated)

**CRITICAL**: MicroProlog code is **NOT** in current execution path. It's architecture-only for now.

### Knowledge Base Projection

The `MicroPrologPlugin` would project blackboard state to Prolog facts:

```prolog
% From bb.proposedHubs
hub('https://example.com/news').
hub('https://example.com/articles').

% From bb.robotsPolicy
robots_allow('/news').
robots_allow('/articles').

% From bb.trapPatterns
trap_pattern('calendar/\\d{4}').
trap_pattern('archive/page/\\d+').

% From bb.noveltyScores
novelty_score('example.com', 0.75).

% From bb.costEstimates
estimated_cost('https://example.com/news', 70).
```

### Query Examples (Conceptual)

```prolog
% Safe seed: hub + robots + no trap
safe_seed(URL) :-
    hub(URL),
    robots_allow(URL),
    \+ trap_pattern(URL).

% Priority seed: safe + high novelty
priority_seed(URL) :-
    safe_seed(URL),
    novelty_score(Host, Score),
    Score > 0.7.

% Conflict detection
conflict(URL, Reason) :-
    hub(URL),
    trap_pattern(Pattern),
    matches(URL, Pattern),
    Reason = 'Hub matches trap pattern'.
```

### Proof Tree Example

```
Query: safe_seed('https://example.com/news')

Proof:
  ├─ hub('https://example.com/news')           [Fact F1]
  ├─ robots_allow('/news')                     [Fact F2]
  └─ \+ trap_pattern('https://example.com/news')
       └─ (no match found)                     [NAF success]

Result: true
Rationale: "Seed validated by rule R3 (safe_seed), facts F1/F2, no traps"
```

### Safety Constraints

- **No side effects**: Pure queries only
- **Time budget**: ≤ 700ms max
- **Step counter**: Prevents infinite loops
- **Memory ceiling**: 10MB KB max
- **Clause validation**: Reject forbidden functors
- **Cancellation**: Immediate abort on PlannerHost.cancel()

---

## Plugin Interaction Patterns

### 1. Sequential Dependencies

```
GraphReasonerPlugin (priority 80)
  ↓ bb.proposedHubs
QueryCostEstimatorPlugin (priority 70)
  ↓ bb.costEstimates
MicroPrologPlugin (priority 65, future)
  ↓ bb.validatedSeeds
RuleEnginePlugin (priority 60, future)
  ↓ bb.derivedFacts
```

### 2. Parallel Contributions

```
GraphReasonerPlugin → bb.noveltyScores
CSPPolitenessPlugin → bb.scheduleWindows
  ↓ (both available)
MicroPrologPlugin queries over combined facts
```

### 3. Feedback Loops (Future)

```
MicroPrologPlugin detects conflict
  ↓ bb.conflicts
TemporalLogicValidatorPlugin checks violations
  ↓ bb.violations
ExplanationPlugin synthesizes rationale
  ↓ bb.rationale (enriched)
```

---

## Telemetry Events

### Current (MVP)

```javascript
{
  type: 'gofai-trace',
  data: {
    pluginId: 'query-cost-estimator',
    stage: 'tick',
    message: 'Estimated cost for 5 hub(s)',
    data: { totalEstimatedMs: 350 }
  }
}
```

### Future (MicroProlog)

```javascript
{
  type: 'gofai-trace',
  data: {
    pluginId: 'microprolog',
    stage: 'query',
    message: 'Found 12 safe_seed solutions',
    data: {
      query: 'safe_seed(URL)',
      solutions: 12,
      elapsedMs: 450,
      truncated: false
    }
  }
}

{
  type: 'planner-stage',
  data: {
    pluginId: 'microprolog',
    stage: 'proof',
    proofDigest: {
      goal: 'safe_seed("https://example.com/news")',
      facts: ['F1: hub', 'F2: robots_allow'],
      rules: ['R3: safe_seed/1'],
      result: 'validated'
    }
  }
}
```

---

## Testing Strategy

### Unit Tests (Current)

- ✅ `PlannerHost.test.js`: Plugin lifecycle, time budget, priority sorting
- ✅ `QueryCostEstimatorPlugin.test.js`: Cost model building, warnings
- ✅ `queryTelemetry.test.js`: Telemetry recording, aggregation

### Integration Tests (Current)

- ✅ `planning.api.test.js`: End-to-end preview with PlannerHost

### Future Tests (MicroProlog)

```javascript
describe('MicroPrologEngine', () => {
  it('should unify ground terms');
  it('should backtrack on failure');
  it('should build proof trees');
  it('should honor time budget');
  it('should handle occurs-check');
});

describe('MicroPrologPlugin', () => {
  it('should project blackboard to facts');
  it('should query safe_seed/1');
  it('should emit proof digests');
  it('should respect cancellation');
});
```

---

## Performance Targets

| Component | Target | Status |
|-----------|--------|--------|
| PlannerHost total | < 3.5s | ✅ MVP: 100-500ms |
| GraphReasonerPlugin | < 50ms | ✅ MVP: 10-50ms |
| QueryCostEstimatorPlugin | < 200ms | ✅ MVP: 50-200ms |
| MicroPrologPlugin | < 700ms | 🔬 Design target |
| RuleEnginePlugin | < 300ms | ⏳ Planned |
| HTNPlugin | < 500ms | ⏳ Planned |
| CSPPolitenessPlugin | < 400ms | ⏳ Planned |

**Total budget**: 3.5s default (configurable)

---

## Roadmap

### Phase 1: MVP (✅ Complete)
- PlannerHost orchestrator
- GraphReasonerPlugin
- QueryCostEstimatorPlugin
- Query telemetry schema
- AsyncPlanRunner integration

### Phase 2: Rule Engine (⏳ Next)
- RuleEnginePlugin with forward-chaining
- Working memory
- Rule tracer
- Integration with existing plugins

### Phase 3: MicroProlog (🔬 Design)
- Isolated implementation in `src/planner/microprolog/`
- MicroPrologEngine with SLD resolution
- MicroPrologPlugin integration
- Safe built-ins registry
- Proof tree generation

### Phase 4: Planning Extensions
- HTNPlugin (hierarchical tasks)
- STRIPSPlugin (classical planning)
- CSPPolitenessPlugin (scheduling)
- TemporalLogicValidatorPlugin (invariants)

### Phase 5: Explanation & UI
- ExplanationPlugin (rich rationale)
- Proof tree UI rendering
- Interactive "why" queries
- Counterfactual exploration

---

## References

- **AGENTS.md**: AI agent workflow and testing strategy
- **ADVANCED_PLANNING_SUITE.md**: Plugin architecture and telemetry
- **ASYNC_PLANNER_PREVIEW.md**: Basic preview system
- **src/planner/PlannerHost.js**: Core orchestrator
- **src/planner/types.js**: Blackboard and context interfaces
- **src/db/queryTelemetry.js**: Cost estimation data source

---

**Maintainer Notes**:
- Keep MicroProlog isolated until proven stable
- All new plugins must honor time budgets and cancellation
- Test plugins independently before integration
- Document proof formats for UI consumption
- Monitor telemetry overhead (< 5% of budget)
