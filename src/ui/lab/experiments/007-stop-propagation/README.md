# Experiment 007 – stopPropagation()

**Status**: proposed

**Hypothesis**: stopPropagation at different depths changes delegated handler coverage; need concrete traces for nested controls.

**Plan**
- Fire clicks on nested controls with stopPropagation at leaf vs mid-level.
- Compare delegation hits vs direct listeners.
- Validate client/server paths for safe logging.

**Metrics / Data to Collect**
- Which handlers fire when stopPropagation is invoked at various depths.
- Order of handlers relative to stopPropagation call.
- Differences between capture and bubble when stopPropagation is used.

**Check**
- `node src/ui/lab/experiments/007-stop-propagation/check.js` (stub).
