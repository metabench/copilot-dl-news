# Follow Ups: 2025-11-20 UI Home Card CLI

| Status | Item | Owner | Notes |
| --- | --- | --- | --- |
| ⏳ | Fix `js-edit --changes` so dry-run/add-change actually loads batch definitions | Tooling WG | `BatchDryRunner` never receives `changesData`, making Gap 3 workflow unusable; tracked via Improvement 6 in `docs/TOOLING_IMPROVEMENTS_BEYOND_GAP_3.md` |
| ⏳ | Add `--card-limit` flag for `render-url-table.js` | UI WG | Allow agents to preview a subset of home cards when running against tiny datasets or demos |
| ⏳ | Surface loader timing + cache age banner in both CLI + server output | UI Reliability | Shared diagnostics to show when counts are stale or slow |
| ⏳ | Provide CLI screenshot helper for `render-url-table.js` output | UI Reliability | Pipe CLI HTML through Puppeteer-to-PNG for rapid visual diffs in reviews |
