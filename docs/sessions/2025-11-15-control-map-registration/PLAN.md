# Plan: control-map-registration

Objective: Document and align the client control registration flow so custom controls populate `context.map_Controls` the same way as upstream jsgui3.

Done when:
- We understand and describe how `update_standard_Controls` plus `page_context.update_Controls` fill `map_Controls`.
- `src/ui/client/index.js` has a clear strategy (code or TODO) for seeding the correct map before activation.
- Session docs capture the registration path and outstanding risks for Puppeteer tests.

Change set:
- `docs/sessions/2025-11-15-control-map-registration/*`
- Potentially `src/ui/client/index.js` (pending analysis)

Risks / assumptions:
- Vendor code drift between `vendor/jsgui3-client` and bundled runtime may hide additional registration steps.
- Puppeteer tests may still fail until the bundle is rebuilt even if documentation is ready.

Tests / verification:
- Rebuild `ui-client.js` if we touch bundle code (pending decision).
- Puppeteer toggle test (`npm run test:by-path tests/puppeteer/url-filter.test.js`) once fixes land.

Docs to update:
- Session docs in this folder.
- `docs/sessions/SESSIONS_HUB.md` entry for the new session.
