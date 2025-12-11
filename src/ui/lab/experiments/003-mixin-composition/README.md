# Experiment 003 – Mixin Composition

Status: proposed

Purpose: Validate that multiple jsgui3 control mixins can be composed safely (server path, no DOM) and capture guardrails for combining them in production controls.

Covers
- Sequential application of multiple mixins (`dragable`, `resizable`) without DOM availability
- Mixins recorded in `view.data.model.mixins` without duplication
- Baseline render still works after mixins are applied

Run
```
node src/ui/lab/experiments/003-mixin-composition/check.js
```

Expected outcomes
- Applying `dragable` then `resizable` does not throw even when `dom.el` is absent (server render path)
- `view.data.model.mixins` contains a `dragable` entry
- Control still renders HTML after mixins are applied

Notes
- This is a server-path safety check; follow-up client-path tests should add DOM stubs and verify event wiring/handle creation.
