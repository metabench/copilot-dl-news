# Experiment 011 – Delegated Selector Matching

**Status**: proposed

**Hypothesis**: Selector-based delegation on mixed control types surfaces matching edge cases (e.g., text controls, detached nodes).

**Plan**
- Attach delegated listener with selector filters; trigger events on matching and non-matching nodes.
- Include text controls and dynamically assigned classes.

**Metrics / Data to Collect**
- Selector hit/miss matrix vs control type and attributes.
- False positives/negatives for delegation filters.

**Check**
- `node src/ui/lab/experiments/011-delegated-selector-matching/check.js` (stub).
