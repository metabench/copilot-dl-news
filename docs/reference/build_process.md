---
status: canonical
source: AGENTS.md
last_migrated: 2025-11-04
owner: ui-platform
---

# Build Process Reference

## Auto-Build on Server Start

The server checks component timestamps at startup and triggers an esbuild rebuild when sources are newer than outputs. Rebuilds typically complete within 100–300 ms.

Implementation: `src/ui/express/auto-build-components.js`.

## Manual Builds

```powershell
npm run components:build
npm run sass:build
```

Manual builds are rarely necessary because the server performs incremental rebuilds automatically.
