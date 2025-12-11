# Experiment 006 – Capture vs Bubble

**Status**: proposed

**Hypothesis**: Comparing capture-phase listeners to bubble-phase delegation will show measurable differences in handler order and duplicates when both are present on nested controls.

**Plan**
- Attach capture listeners at document/root and bubble listeners on container/children.
- Emit clicks and record sequence with timestamps/ids.
- Observe server safety (no DOM dependency before activation).

**Metrics / Data to Collect**
- Ordered log of handlers (capture first? overlaps?).
- Presence of duplicate invocations when both capture and bubble on same node.
- Any jsgui3-specific quirks in control chaining.

**Check**
- `node src/ui/lab/experiments/006-capture-vs-bubble/check.js` (stub).
