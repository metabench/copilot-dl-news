# Follow Ups — 2025-11-15 URL Filter Debug

| Status | Item | Notes |
| --- | --- | --- |
| 🔄 | Automate `/urls` Playwright MCP scenario | Blocked earlier by missing config; capture requirements once runtime/toggle is stable. |
| 🔄 | Decide on long-term fix for vendored transform helpers | Determine whether to vendor stable copy or patch bundler plugin; current fix edits installed dependencies directly. |
| ⚠️ | Add lint/check for implicit globals in vendor bundles | Simple static scan during `ui:client-build` would prevent regressions of the `each_source_dest_pixels_resized*` failure. |
