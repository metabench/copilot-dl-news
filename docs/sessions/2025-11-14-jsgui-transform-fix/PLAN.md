# Plan: jsgui-transform-fix

Objective: Restore runtime stability by declaring the vendored resize helpers so the esbuild UI bundle no longer throws `each_source_dest_pixels_resized` ReferenceErrors.

Done when:
- `jsgui3-gfx-core/core/ta-math/transform.js` exports the helper bindings explicitly and lints under strict mode.
- `npm run ui:client-build` completes and the generated bundle includes the helpers without runtime errors.
- Session doc captures the fix plus any follow-ups for longer-term vendoring strategy.

Change set: `vendor/jsgui3-client/node_modules/jsgui3-gfx-core/core/ta-math/transform.js`, rebuilt `public/assets/ui-client.js`, `docs/sessions/2025-11-14-jsgui-transform-fix/*`, `docs/sessions/SESSIONS_HUB.md`.

Risks/assumptions: Relying on vendored code may mean future package updates overwrite the fix; esbuild runs everything in strict mode so implicit globals must be avoided.

Tests: `npm run ui:client-build` plus manual browser reload (if feasible) to confirm no ReferenceError surfaces.

Docs to update: This session folder (plan, notes, summary) and `docs/sessions/SESSIONS_HUB.md` entry.
