# Working Notes — 2025-11-19 client control hydration

## Context
- Goal: ensure UrlListingTable, UrlFilterToggle, and PagerButton constructors are present in `context.map_Controls` inside the browser so server-rendered markup hydrates into live controls. Puppeteer test currently fails with repeated "Missing context.map_Controls" logs.
- Environment: Windows, npm scripts (`ui:client-build`, `test:by-path`). jsgui vendor keeps its own `map_Controls` store and `pre_activate` routine.

## Timeline
1. Reran Puppeteer test → still failing, confirming baseline.
2. Added fallback injection logic so `injectControlsIntoContext` writes to `context.map_Controls` even without `update_Controls`.
3. Seeded page contexts with constructors copied from `jsguiClient.map_Controls` and `jsguiClient.controls` before injecting custom ones.
4. Wrapped `jsguiClient.pre_activate` via accessor to force injection even if vendor reassigns the function later.
5. Added temporary browser log `[copilot] context.map_Controls keys` to inspect what gets injected.
6. After each code change: rebuilt bundle (`npm run ui:client-build`) and reran Puppeteer test. Logs still report missing controls, and the debug log never appeared, suggesting `injectControlsIntoContext` is not executing on the real page context.

## Observations
- `jsguiClient.Client_Page_Context` is replaced with subclass that calls `injectControlsIntoContext` in its constructor, but Puppeteer logs do not detect `[copilot] context.map_Controls keys`, implying constructor is either not invoked or runs in a different window scope.
- `jsguiClient.pre_activate` patch fires (log shows "jsgui html-core pre_activate"), yet missing controls persist, meaning the context passed into `pre_activate` probably uses a different `context.map_Controls` object than the one mutated earlier.
- `jsgui.update_standard_Controls` is called before `pre_activate`. Our patch wraps it, but the vendor copies `page_context.update_Controls` entries into `context.map_controls` rather than `map_Controls` (notice casing). Missing constructors may stem from the conversion between `map_controls` and `map_Controls` at parse time.
- Need to inspect vendor `Page_Context` constructor — it initializes both `map_controls` and `map_Controls`. Perhaps we should populate `context.map_controls` instead of `map_Controls`.

## Next steps
- Investigate `context.update_Controls` implementation to determine whether it writes to `map_controls`, `map_Controls`, or both.
- Consider hooking into `jsgui.Client_Page_Context.prototype.update_Controls` to ensure both maps stay synchronized.
- Once injection path is confirmed, remove the temporary `[copilot]` console log.
- Update session summary and SESSIONS_HUB when finished.
