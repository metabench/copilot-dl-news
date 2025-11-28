# Decision Tree Engine — Future Roadmap

## Overview

This document outlines the staged evolution of the Decision Tree Engine from its current state as a page classification system to a comprehensive, ML-enhanced decision framework.

---

## Current State (v1.0) — Foundation

**Status**: ✅ Complete & Production Ready

### Core Capabilities
- JSON-configured boolean decision trees
- 5 condition types: `url_matches`, `text_contains`, `compare`, `compound`, `flag`
- Full audit trail with `PathStep[]` tracking
- Compact storage via `DecisionJustification`
- Sub-millisecond evaluation (~0.5ms per category)

### Active Categories
1. **in-depth** — Long-form analysis detection
2. **breaking** — Breaking news identification  
3. **opinion** — Opinion/editorial classification
4. **hub** — Navigation hub detection
5. **reference** — Reference page identification

### Files
- `src/analysis/decisionTreeEngine.js` (~280 lines)
- `config/decision-trees/page-categories.json`
- `config/decision-trees/decision-tree.schema.json`

---

## Stage 1: Enhanced Conditions (v1.5)

**Timeline**: Q1 2026  
**Theme**: Richer signal extraction

### New Condition Types
| Condition | Purpose | Example |
|-----------|---------|---------|
| `date_proximity` | Time-based relevance | Articles < 24h old |
| `link_density` | Structure analysis | Links per paragraph |
| `semantic_similarity` | Content matching | Cosine similarity to templates |
| `regex_capture` | Pattern extraction | Extract dates, authors |
| `html_structure` | DOM analysis | Has `<article>`, schema.org |

### Weighted Confidence
- Current: Binary match with fixed confidence
- Enhanced: Weighted node contributions
- Formula: `confidence = Σ(node_weight × branch_confidence)`

### Priority
- **HIGH**: `date_proximity`, `link_density`
- **MEDIUM**: `regex_capture`, `html_structure`  
- **LOW**: `semantic_similarity` (requires embeddings)

---

## Stage 2: Multi-Tree Orchestration (v2.0)

**Timeline**: Q2 2026  
**Theme**: Composable classification pipelines

### Tree Chaining
```
URL Input
    ↓
[Pre-filter Tree] → Skip non-article pages early
    ↓
[Content Tree] → Main classification
    ↓
[Confidence Tree] → Adjust scores based on signals
    ↓
Final Result
```

### Parallel Evaluation
- Run independent trees concurrently
- Merge results with conflict resolution
- Priority-based winner selection

### Fallback Chains
- Primary tree fails → Secondary tree
- Secondary fails → Default classification
- All fail → Manual queue

### New API
```javascript
engine.evaluateChain(context, ['pre-filter', 'content', 'boost'])
engine.evaluateParallel(context, ['breaking', 'opinion', 'in-depth'])
engine.evaluateWithFallback(context, 'primary', ['secondary', 'tertiary'])
```

---

## Stage 3: Learning & Adaptation (v2.5)

**Timeline**: Q3 2026  
**Theme**: Self-improving trees

### Feedback Loop Integration
```
Classification → User Correction → Pattern Extraction → Tree Update
```

### A/B Testing Framework
- Shadow evaluation of experimental trees
- Statistical comparison (accuracy, precision, recall)
- Automatic promotion of winning variants

### Pattern Mining
- Identify misclassified pages
- Extract common signals from corrections
- Generate candidate rule suggestions

### Confidence Calibration
- Track predicted vs actual outcomes
- Adjust confidence multipliers per node
- Platt scaling for probability calibration

### Database Tables
| Table | Purpose |
|-------|---------|
| `decision_feedback` | User corrections |
| `decision_experiments` | A/B test configurations |
| `decision_metrics` | Performance tracking |
| `pattern_candidates` | Mined rule suggestions |

---

## Stage 4: ML Hybrid System (v3.0)

**Timeline**: Q4 2026  
**Theme**: Neural augmentation with interpretability

### Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    HYBRID DECISION SYSTEM                    │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ Rule-Based  │    │ Embedding   │    │ Ensemble    │     │
│  │ Decision    │ +  │ Classifier  │ →  │ Combiner    │     │
│  │ Tree        │    │ (Neural)    │    │             │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         ↓                  ↓                  ↓             │
│    Interpretable      High Accuracy      Final Score       │
│    Audit Trail        Soft Signals       + Explanation     │
└─────────────────────────────────────────────────────────────┘
```

### Components

#### Embedding Classifier
- Pre-trained language model (e.g., sentence-transformers)
- Fine-tuned on domain corpus
- Outputs soft category probabilities

#### Ensemble Combiner
- Weighted voting between rule and ML outputs
- Configurable trust levels per source
- Automatic weight adjustment based on accuracy

#### Explanation Generator
- SHAP values for ML contributions
- Rule path for tree contributions
- Natural language summary

### Interpretability Guarantee
- Every decision has human-readable explanation
- ML "black box" contributions capped at configurable %
- Override capability for critical categories

---

## Stage 5: Distributed & Real-Time (v3.5)

**Timeline**: Q1 2027  
**Theme**: Scale and speed

### Edge Deployment
- Compile trees to WebAssembly
- Run classification at edge (CDN workers)
- Sub-10ms latency at global scale

### Streaming Classification
- Real-time article stream processing
- Incremental updates as content changes
- Priority queue integration

### Multi-Tenant Support
- Per-domain tree configurations
- Tenant-specific training data isolation
- Usage-based resource allocation

### Observability
- OpenTelemetry integration
- Decision latency histograms
- Category distribution dashboards
- Drift detection alerts

---

## Stage 6: Autonomous Evolution (v4.0)

**Timeline**: Q2 2027  
**Theme**: Self-maintaining system

### Auto-Tree Generation
- Generate tree candidates from labeled data
- Optimize for accuracy + interpretability
- Human review before deployment

### Concept Drift Detection
- Monitor classification distribution over time
- Alert when patterns shift significantly
- Automatic retraining triggers

### Cross-Domain Transfer
- Share successful patterns across domains
- Domain adaptation for tree rules
- Global pattern library

### Meta-Learning
- Learn which tree structures work best
- Automatic hyperparameter tuning
- Architecture search for new categories

---

## Implementation Priority Matrix

| Stage | Effort | Impact | Dependencies | Priority |
|-------|--------|--------|--------------|----------|
| 1.5 Enhanced Conditions | Medium | High | None | ⭐⭐⭐ |
| 2.0 Multi-Tree | Medium | Medium | Stage 1.5 | ⭐⭐ |
| 2.5 Learning | High | High | Stage 2.0, Feedback UI | ⭐⭐⭐ |
| 3.0 ML Hybrid | Very High | Very High | Stage 2.5, ML infra | ⭐⭐ |
| 3.5 Distributed | High | Medium | Stage 3.0 | ⭐ |
| 4.0 Autonomous | Very High | Very High | All previous | ⭐ |

---

## Success Metrics

### Accuracy Targets
| Stage | Precision | Recall | F1 Score |
|-------|-----------|--------|----------|
| Current (1.0) | 85% | 80% | 82% |
| Stage 1.5 | 88% | 85% | 86% |
| Stage 2.5 | 92% | 90% | 91% |
| Stage 3.0 | 95% | 93% | 94% |
| Stage 4.0 | 97% | 96% | 96% |

### Performance Targets
| Stage | Latency (p99) | Throughput |
|-------|---------------|------------|
| Current | <1ms | 10k/sec |
| Stage 2.0 | <5ms | 8k/sec |
| Stage 3.0 | <20ms | 5k/sec |
| Stage 3.5 | <10ms | 50k/sec |

---

## Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ML model drift | High | Continuous monitoring + auto-rollback |
| Latency regression | Medium | Performance budgets per stage |
| Interpretability loss | High | Cap ML contribution at 40% |
| Training data quality | High | Active learning + human review |
| Complexity explosion | Medium | Modular architecture + clear interfaces |

---

## Related Documents

- `docs/diagrams/decision-tree-engine-deep-dive.svg` — Current architecture
- `docs/ENHANCED_FEATURES.md` — Crawler feature roadmap
- `docs/ROADMAP.md` — Project-wide priorities
- `config/decision-trees/page-categories.json` — Active tree config
