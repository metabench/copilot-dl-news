# Decisions — 2025-11-15 URL Filter Debug

| Date | Context | Decision | Consequences |
| --- | --- | --- | --- |
| 2025-11-15 | UI bundle crashed because `each_source_dest_pixels_resized_limited_further_info` was assigned without declaration inside vendored jsgui3 gfx helpers. | Patched both installed copies of `ta-math/transform.js` (under `node_modules/jsgui3-client` and `node_modules/jsgui3-html`) to use scoped `const` bindings, then rebuilt the bundle. | Bundle no longer throws ReferenceErrors and the client toggle can activate; need a long-term plan to bake these fixes into vendored sources or upstream packages. |
