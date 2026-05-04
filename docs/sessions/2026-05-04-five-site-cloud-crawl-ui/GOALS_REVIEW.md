# Goals Review: Five-Site Cloud Crawl UI

## User Goals

- The crawler UI should provide screenshots for agent-led visual inspection and subjective improvement.
- Run five-page crawls on five websites using parallel downloads from the cloud server as efficiently as practical.
- Keep the UI responsive, concise, and basic.
- Preserve existing layouts; add new jsgui3 controls for substantially different simplified layouts and swap usage where architecturally appropriate.
- Avoid proliferating duplicate applications; keep related crawl views within existing applications where that makes sense.

## Project Goals In Scope

- Advance the long-term advanced crawler plus advanced UI objective.
- Keep jsgui3 controls reusable, separately testable, and compatible with server-side render plus client activation.
- Prefer existing crawl orchestration and remote sync paths over bespoke operational scripts.

## Non-Goals

- Replacing all existing crawl dashboards.
- Finalizing jsgui3 layout mode strategy.
- Large-scale crawler architecture rewrites.

## Immediate Work Items

1. Inventory the existing crawl UI app/control mount points and screenshot/test tooling.
2. Add or wire a compact screenshot-capable crawl status control.
3. Validate the control with a focused render/check script.
4. Run or attempt the five-site cloud crawl and sync evidence.
5. Capture screenshots, inspect them, and make at least one focused UI improvement if the screenshot reveals a problem.