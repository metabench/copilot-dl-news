# Working Notes — 2025-11-15 URL Filter Debug

## 00:58 — Session bootstrap
- Created session folder + baseline docs (INDEX, PLAN, WORKING_NOTES, ROADMAP, FOLLOW_UPS, SESSION_SUMMARY, DECISIONS) to track toggle/transform fixes.
- Updated `docs/sessions/SESSIONS_HUB.md` with the new session entry.

## 01:15 — Transform helper patch
- Used `node tools/dev/js-scan.js --search each_source_dest_pixels_resized_limited_further_info --json` (0 matches) then fell back to inspecting vendor deps; located offending assignments inside `node_modules/jsgui3-client/node_modules/jsgui3-gfx-core/...` and `node_modules/jsgui3-html/node_modules/jsgui3-gfx-core/...`.
- Declared `const each_source_dest_pixels_resized[_limited_further_info]` in both copies so esbuild emits scoped vars instead of implicit globals.
- Ran `npm run ui:client-build` twice to refresh `public/assets/ui-client.js`; verified both bundle copies now emit `var each_source_dest_pixels_resized_limited_further_info = ...`.
- Rationale: the runtime ReferenceError prevented the binding plugin from activating, which in turn left the filter toggle inoperative. With the bundle loading cleanly, the toggle's fetch + DOM update path can now run.

