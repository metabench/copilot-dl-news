# Experiment 014 – Delegation Performance Batch

**Status**: proposed

**Hypothesis**: Delegating to a single parent scales better than per-node listeners; need batch timing and handler-count data.

**Plan**
- Compare delegated listener vs individual listeners across 100–1000 child controls.
- Measure handler registration cost and event dispatch time.

**Metrics / Data to Collect**
- Setup time (listener registration) and dispatch latency per event.
- Memory/handler count estimates.

**Check**
- `node src/ui/lab/experiments/014-delegation-performance-batch/check.js` (stub).
