# Experiment 010 – Nested Controls Bubbling

**Status**: proposed

**Hypothesis**: Deeply nested jsgui3 controls may introduce unexpected bubbling paths due to control chain composition.

**Plan**
- Create a 4–5 level control tree; add delegated and direct listeners at multiple tiers.
- Fire events at leaves and log bubble path and handler order.

**Metrics / Data to Collect**
- Bubble path order across control chain depths.
- Presence of skipped nodes or duplicate firings.

**Check**
- `node src/ui/lab/experiments/010-nested-controls-bubbling/check.js` (stub).
