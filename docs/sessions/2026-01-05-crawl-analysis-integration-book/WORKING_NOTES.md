# Working Notes – Crawl & Analysis Integration Book

- 2026-01-05 — Session created via CLI. Add incremental notes here.

## Session 2 — Unified Workflow & Place Coherence Implementation

### Work Done

1. **Created `src/pipelines/` module** — NEW DIRECTORY
   - `PipelineOrchestrator.js` — Core EventEmitter-based orchestrator
   - `UnifiedPipeline.js` — Simplified facade with static methods
   - `index.js` — Module exports
   - Stages: init → crawl → analyze → disambiguate → report → complete

2. **Created `src/analysis/place-coherence.js`** — NEW FILE
   - `PlaceCoherence` class for multi-mention coherence scoring
   - `haversineDistance()` function for geographic distance
   - `distanceToCoherence()` mapping with thresholds
   - Thresholds: 50km (same city), 200km (same region), 1000km (same country)

3. **Created `tools/dev/unified-pipeline.js`** — CLI TOOL
   - Console progress bar with ETA
   - SIGINT graceful stop support
   - JSON output for AI agents

4. **Created check scripts**
   - `checks/place-coherence.check.js` — ✅ All passing
   - `checks/unified-pipeline.check.js` — ✅ All passing

5. **Updated book chapters**
   - Chapter 10: Updated status, added coherence module reference
   - Chapter 11: Changed ❌ → ✅, added codebase quick reference

### Next Steps

- [ ] Wire `PlaceCoherence` into `place-extraction.js` analysis pipeline
- [ ] Implement `publisherPriorScore()` using hub matrix data
- [ ] Create `/explain` API endpoint for disambiguation decisions
- [ ] Add multi-language aliases to schema
