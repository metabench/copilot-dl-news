# Experiment 009 – target vs currentTarget

**Status**: proposed

**Hypothesis**: Delegated handlers on parent controls expose specific patterns in `event.target` vs `event.currentTarget` across dynamic trees.

**Plan**
- Build nested controls, fire events at leaves, log target/currentTarget pairs for capture and bubble.
- Include delegated handlers at multiple depths.

**Metrics / Data to Collect**
- target/currentTarget combinations per depth.
- Cases where target is reassigned or differs under delegation.

**Check**
- `node src/ui/lab/experiments/009-target-vs-current-target/check.js` (stub).
