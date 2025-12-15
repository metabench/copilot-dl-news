# Decisions – Activation debugging with mixed controls

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-12-15 | Activation failures can be silent; always-on logs are too noisy and brittle (esp. with `npm link`). | Prefer structured activation diagnostics (window report + DOM markers) with gated debug logs. | Deterministic checks can assert activation correctness; manual deep-dive logs stay opt-in. |
| 2025-12-15 | Activation issues often come from registry mismatches (constructor vs instance). | Diagnose both constructor registries (`controls[type]`, `context.map_Controls[type]`) and instance registry (`context.map_controls[id]`). | Faster triage: distinguishes bundle/registration problems from DOM-linking/instance issues. |
