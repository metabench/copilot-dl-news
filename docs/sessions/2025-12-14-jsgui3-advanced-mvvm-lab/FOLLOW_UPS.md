# Follow Ups – jsgui3 advanced MVVM lab

- Consider adding a small utility in lab codebase for normalizing `Data_Object` string values (JSON-quoted strings) so future experiments don’t reimplement it.
- Investigate whether `ModelBinder` should prefer `targetModel.set(...)` / `sourceModel.set(...)` when available to preserve `change` events on `Data_Object`.
- Reduce console noise in activation (“Missing context.map_Controls…”, “&&& no corresponding control”) with either a targeted registration fix or a log-level gate for labs.

- _Add actionable follow-ups here._
