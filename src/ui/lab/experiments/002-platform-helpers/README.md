# Experiment 002 – Platform Helpers

Purpose: Validate jsgui3 platform conveniences (style proxy px coercion, background/size setters, compositional model wiring, control registration, persisted fields) and capture usage patterns before applying to production controls.

Status: active

What this covers
- DOM style proxy auto-coercion (`width/height/left/top` → px) and background propagation
- Compositional model arrays (`comp`) for declarative child wiring and `_ctrl_fields`
- Control registration via `register_this_and_subcontrols()` and context maps
- Persisted fields hydration from `data-jsgui-fields`

How to run
```
node src/ui/lab/experiments/002-platform-helpers/check.js
```

Expected outcomes
- Style proxy emits px units and background color syncs into `dom.attributes.style`
- Compositional model builds children and exposes named controls in `_ctrl_fields`
- Registration populates `context.map_controls`
- Persisted fields are read when an `el` carries `data-jsgui-fields`
