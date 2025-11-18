# Roadmap — 2025-11-15 URL Filter Debug

## In Progress
1. ✅ Identify why `each_source_dest_pixels_resized_limited_further_info` is undefined in the ui-client bundle runtime despite inline definition (scoped declarations shipped).
2. ⚠️ Monitor the client toggle lifecycle in a real browser once MCP/Playwright harness exists to confirm `/api/urls` responses mutate DOM appropriately.

## Next
- Rebuild `ui-client.js` once fixes land and confirm in-browser behavior.
- Capture manual verification steps or lightweight checks to replay later.

## Later / Follow Ups
- Stand up Playwright MCP config so `/urls` interactions can be automated.
- Evaluate long-term plan for vendored transform helpers (dedupe vs. aligning with upstream jsgui3).
