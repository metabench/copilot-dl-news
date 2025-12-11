# Experiment 004 – Theme Mixin

Status: proposed

Purpose: Prototype a simple theme mixin that can be composed with other mixins and remains safe on the server path (no dom.el required). Capture guardrails for creating custom mixins.

Covers
- Applying a custom theme mixin that adds theme class + data attribute
- Recording mixin metadata in `view.data.model.mixins`
- Ensuring render still works when mixin is applied before activation (server path)

Run
```
node src/ui/lab/experiments/004-theme-mixin/check.js
```

Expected outcomes
- Applying `theme_mixin` does not throw when `dom.el` is absent
- Control gains class `theme-<name>` and `data-theme` attribute
- `view.data.model.mixins` contains a `theme` record
- Control renders HTML after mixin is applied

Follow-ups
- Test client-path behavior (with dom.el) and mixin composition with dragable/resizable.
