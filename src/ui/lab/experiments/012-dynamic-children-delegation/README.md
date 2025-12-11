# Experiment 012 – Dynamic Children Delegation

**Status**: proposed

**Hypothesis**: Adding/removing children after activation affects delegated handlers differently than direct listeners; need concrete lifecycle traces.

**Plan**
- Add and remove child controls post-activation while delegation is attached at parent.
- Fire events before/after removal and log hits.

**Metrics / Data to Collect**
- Delegation coverage for newly added vs removed nodes.
- Whether removed nodes still trigger handlers (leaks) or newly added nodes require rebind.

**Check**
- `node src/ui/lab/experiments/012-dynamic-children-delegation/check.js` (stub).
