# Experiment 013 – Custom Events Bubbling

**Status**: proposed

**Hypothesis**: Custom events dispatched from controls may bubble differently than native events; need clarity on default bubbling and delegation viability.

**Plan**
- Dispatch custom events with `bubbles: true/false` from nested controls.
- Observe delegated handlers at ancestors; compare to native click baseline.

**Metrics / Data to Collect**
- Bubble reach for custom events vs native.
- Handler order and target/currentTarget for custom events.

**Check**
- `node src/ui/lab/experiments/013-custom-events-bubbling/check.js` (stub).
