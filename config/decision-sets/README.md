# Decision Config Sets

This directory stores versioned decision-making configurations.

Each `.json` file is a complete `DecisionConfigSet` containing:
- Priority configuration (bonuses, weights, thresholds)
- Decision trees (page classification, URL patterns)
- Feature flags
- Metadata (creation time, parent, change log)

## Usage

```javascript
const { DecisionConfigSet } = require('../../src/crawler/observatory/DecisionConfigSet');

// Save current production as a baseline
const baseline = await DecisionConfigSet.fromProduction('baseline-2025-12');
await baseline.save();

// Clone to create an experimental variant
const experiment = baseline.clone('aggressive-hubs');
experiment.setPriorityBonus('hub-validated', 25);
experiment.setFeature('totalPrioritisation', true);
await experiment.save();

// List all saved sets
const sets = await DecisionConfigSet.list();

// Promote a good config to production
await experiment.promoteToProduction({ backup: true });
```

## File Format

Each set is a single JSON file named `{slug}.json`:

```json
{
  "slug": "baseline-2025-12",
  "name": "Baseline December 2025",
  "description": "Snapshot of production config",
  "parentSlug": null,
  "priorityConfig": { ... },
  "decisionTrees": { ... },
  "features": { ... },
  "metadata": {
    "createdAt": "2025-12-08T...",
    "isProduction": true
  }
}
```

## Workflow

1. **Baseline**: Start by saving current production config
2. **Experiment**: Clone baseline, make changes, save
3. **Compare**: Use `set.diff(other)` to see differences
4. **Test**: Run crawl simulations with different sets
5. **Promote**: When satisfied, `set.promoteToProduction()`
