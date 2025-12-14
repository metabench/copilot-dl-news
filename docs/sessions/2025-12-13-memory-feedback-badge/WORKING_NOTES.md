# Working Notes – Memory Feedback Badge Format

- 2025-12-13 — Session created via CLI. Add incremental notes here.

## Changes

- Standardized user-visible memory-load badge format to `🧠 MEMORY — ...`.
- Added anti-spam guidance (emit only once per distinct retrieval).

## Evidence

- Verified (via repo search tooling) that no legacy `Memory:` badge instances remain.
- `node tools/dev/md-scan.js --dir . --search "docs-memory: unavailable" --json`
