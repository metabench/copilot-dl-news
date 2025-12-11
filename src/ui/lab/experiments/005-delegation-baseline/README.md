# Experiment 005 – Delegation Baseline

**Status**: proposed

**Hypothesis**: Establish baseline behavior for delegated click handlers on a container versus direct listeners to quantify propagation order and handler counts.

**Plan**
- Build a jsgui3 container with multiple child controls emitting click events.
- Attach a delegated listener at the container and direct listeners on children; record call order and targets.
- Capture event log for both server-path safety and client activation.

**Metrics / Data to Collect**
- Invocation order (capture vs bubble) and `event.target`/`currentTarget` pairs.
- Handler count difference between delegated vs direct wiring.
- Whether server-path code remains safe (no DOM access before activation).

**Check**
- `node src/ui/lab/experiments/005-delegation-baseline/check.js` (stub; to be implemented).
