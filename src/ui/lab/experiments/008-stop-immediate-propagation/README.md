# Experiment 008 – stopImmediatePropagation()

**Status**: proposed

**Hypothesis**: stopImmediatePropagation on delegated handlers alters sibling listener execution; need concrete ordering data.

**Plan**
- Register multiple handlers on same node (delegated + direct) then invoke stopImmediatePropagation in one.
- Record which handlers are skipped and how bubbling proceeds.

**Metrics / Data to Collect**
- Handler execution order when stopImmediatePropagation is called.
- Whether upstream delegation still fires after immediate stop.
- Differences versus stopPropagation baseline.

**Check**
- `node src/ui/lab/experiments/008-stop-immediate-propagation/check.js` (stub).
