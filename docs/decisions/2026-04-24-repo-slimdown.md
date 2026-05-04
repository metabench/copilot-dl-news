# ADR — Repo Slim-Down (2026-04-24)

## Context

The repository had grown to:
- ~26 GB of stale `tmp/` artefacts (gitignored but consuming dev-machine disk).
- 206 markdown files at the root of `docs/`, dominated by historical "PHASE_N", "_COMPLETE", and "_SUMMARY" write-ups that obscured the active reference docs.
- ~25 obsolete one-off scripts in `tools/` (one-time migrations, ad-hoc diagnostics, mockups) cluttering tool discovery.
- An empty `AGENT_IMMEDIATE.js` and a one-line `AGENTS_IMMEDIATE.js` SQL prober at the repo root.
- A trivial `deprecated-ui-root/` directory (2 files).

User asked: assess what is needed for crawling, tooling, and AGI; delete obsolete tools; streamline docs; do not delete the production database.

## Options considered

- **A. Soft-delete to a `legacy/` git branch** — preserves history but leaves the working tree cluttered.
- **B. Bulk-delete obsolete files in main** — cleanest, relies on git history for recovery.
- **C. Move everything to `archives/` instead of deleting** — safest for docs, awkward for code.

## Decision

- **Tools and root scratch files: bulk-delete (option B).** Verified via `grep_search` that none are referenced from `package.json`, `src/`, `tests/`, `checks/`, `scripts/`, or `.github/`.
- **Documentation: archive, do not delete (option C).** Moved 53 markdown files into `docs/archives/2026-Q2/` with a README pointing to current entry points.
- **`tmp/`: aggressive deletion.** Gitignored and rebuildable. Reclaimed 24.71 GB.
- **Production DB (`data/news.db`, 23 GB): explicitly preserved** and verified intact before and after every phase.

## What was kept (load-bearing — do not touch)

### Crawling
- `crawl.js` (root), `src/crawl.js`, `npm run crawl`, `npm run crawl:remote`
- `tools/crawl/` (full — `index.js`, `crawl-remote.js`, `intelligent-crawl.js`, profiles, etc.) + `AGENT.md`
- `tools/dev/intelligent-crawl-server.js` (npm `ics:*` scripts)
- `tools/dev/mini-crawl.js`, `tools/dev/crawl-*.js` (live, status, watch, daemon)
- `src/crawler/`, `src/data/db/`, `src/db/sqlite/`
- `data/news.db` (23 GB — production corpus)
- `tools/schema/schema-sync.js` and `npm run schema:*`

### Coding / dev tooling
- `tools/dev/js-scan.js`, `js-edit.js`, `md-scan.js`, `md-edit.js`, `ts-scan.js`, `ts-edit.js`
- `tools/dev/svg-collisions.js`, `svg-overflow.js`, `svg-validate.js`, `svg-recipes/`
- `tools/dev/session-archive.js` (npm `sessions:archive:*`)
- `tools/dev/sql-boundary-check.js` (npm `sql:check-ui`)
- `tools/dev/db-downloads.js`, `task-events.js`
- `tools/agent-backup.js`, `tools/extraction-benchmark.js`, `tools/gazetteer-dedupe.js`
- `tools/benchmarks/run.js`, `tools/mcp/` (MCP servers)
- `AGENTS.md`, `.github/instructions/`, `.github/agents/`, `.kilo/`, `.kilocodemodes`

### Documentation
- `docs/INDEX.md` and the three quick-references at `docs/`
- `docs/agi/`, `docs/agents/`, `docs/workflows/`, `docs/standards/`, `docs/how_tos/`
- `docs/cli/`, `docs/database/`, `docs/decisions/`, `docs/diagrams/`
- All `docs/sessions/`

### Sub-apps (still actively scripted via package.json)
- `crawler-app/` (npm `crawler-app`)
- `z-server/` (npm `z-server`)
- `src/ui/electron/*` (multiple `electron:*` scripts)
- `src/deprecated-ui/` — name is misleading; it is **still imported by `src/api/server.js`, `src/api/routes/analysis.js`, `src/background/`, and `tools/benchmarks/`**. Treat as load-bearing until those imports are migrated.

## What was deleted

### Disk-only (gitignored, ~25 GB total)
- `tmp/news-crawler-db-lab/` (23.0 GB — superseded lab artefact)
- `tmp/hub-test-2026-01-08T*/` × 11 dirs (~1.4 GB — old hub-test batches)
- `tmp/v4-*` × 7 dirs (~290 MB — V4 crawl scratch)
- `tmp/crawl-batch*`, `tmp/hub-test-manual` (~600 MB)
- `tmp/lab-05*`, `tmp/warmup-validation/`, `tmp/notes/`, `tmp/imports/`, `tmp/export-repro/`, `tmp/discovery/`, `tmp/backups/`, plus several empty scratch dirs

### Tracked, verified obsolete (25 items)
Root:
- `AGENT_IMMEDIATE.js` (empty), `AGENTS_IMMEDIATE.js` (one-off SQL prober)
- `deprecated-ui-root/` (2 stub files)

`tools/` one-time migrations (already executed, kept in git history):
- `move-docs-to-docs.js`, `move-scripts-to-tools.js`, `migrate-test-logs.js`, `update-script-references.js`
- `create-enhanced-tables.js`, `run-fts5-migration.js`

`tools/` one-off diagnostics (single-use, kept in git history):
- `count-json-files.js`, `count-testlogs.js`, `find-directories-with-most-files.js`
- `investigate-duplicates.js`, `investigate-duplicates-deep.js`, `review-429-errors.js`
- `scan-lang-tools-patterns.js`, `structure-miner.js`, `test-http-cache-facade.js`, `run-pattern-learning.js`

`tools/dev/` mockups + scratch:
- `crawler-app-mockup.js`, `crawler-ui-mockups.js`, `data-explorer-mockup.js`, `demo-interaction.js`
- `test_write.js`, `results.json`

### Documentation archived (not deleted)
- 53 files moved from `docs/*.md` → `docs/archives/2026-Q2/` (PHASE_*, *_COMPLETE, *_SUMMARY, *_DELIVERY, superseded REFACTOR write-ups, dedupe diagnostics).

## Consequences

### Positive
- ~24.71 GB disk reclaimed (`tmp/` 25.57 GB → 0.87 GB).
- `docs/` root markdown count: 206 → 153 (−26%).
- `tools/` root JS scripts: 25 fewer files, only active tools remain.
- Cognitive surface area materially reduced.

### Risks accepted
- Anyone re-running an old one-off migration script will need to retrieve it from git history (`git log --diff-filter=D --summary -- tools/<name>.js`).
- Archived doc filenames may be linked from external systems; archive README provides redirection guidance.

### Validation
- `node tools/crawl/index.js --help` → loads.
- `node tools/dev/js-scan.js --help` → loads.
- `node tools/dev/js-edit.js --help` → loads.
- `node tools/dev/md-scan.js --help` → loads.
- `data/news.db` size unchanged at 23,066.8 MB before vs. after.

## Not done (deferred — needs user sign-off)

- ~~Sub-app fate~~: **resolved in second pass.** All deleted (see updated tables above): `crawl-widget/` (347 MB), `crawler-app/` (84 MB), `z-server/` (308 MB), `tools/ui/quick-picker/` (256 MB), `tools/deploy-manager/` (279 MB).
- ~~`gazetteer-backup/` (159 MB)~~: **deleted.** Reproducible from `data/news.db` via `tools/export/export-gazetteer.js`.
- Audit of root `checks/` (~250 files, 15 MB) for relocation to feature-local `checks/` per AGENTS.md convention.
- `src/deprecated-ui/` migration (would unblock its eventual deletion).

---

## Second pass — 2026-04-24 (same day)

User instructed: "Delete anything large and unessential to the crawl functionality. Be sure to keep the production db. Make 2 more root directories: solid and wip. wip will be for work in progress. rearrange things effectively."

### Phase E — additional deletions (large + non-crawl, ~1.4 GB tracked + caches)

| Path | Size | Was it referenced? |
|---|---|---|
| `crawl-widget/` | 347 MB | One string ref in `tools/dev/sql-boundary-check.js` (audit target list). Removed. |
| `z-server/` | 308 MB | npm script `z-server` only. Removed script + dir. |
| `tools/deploy-manager/` | 279 MB | None. |
| `tools/ui/quick-picker/` | 256 MB | None. |
| `gazetteer-backup/` | 159 MB | One mention as default output of `tools/export/export-gazetteer.js`. Reproducible. |
| `crawler-app/` | 84 MB | npm script `crawler-app` only. Removed script + dir. |
| `src/native/sigcluster/` | 20 MB | None. |
| `dist/`, `build/`, `screenshots/`, `testlogs/` | ~50 MB | All gitignored / regen. |
| `src/music/` | 7 MB | Stray MP3 file. |
| `migration-export/`, `migration-temp/`, `.playwright-mcp/`, `.jsgui3-server-cache/`, `.cache/` | small | Caches/scratch. |
| `plugins/non-existent-plugin/`, `test-plugins/non-existent/` | trivial | Empty stubs. |

### Phase F/G — `solid/` and `wip/` created; loose roots reorganized

New top-level dirs:
- `solid/` — promotion target for stable artifacts (currently empty + `README.md`).
- `wip/` — experimental zone (`README.md` includes manifest table).

Moved into `wip/`:
- `labs/` → `wip/labs/` — fixed two production imports (`src/core/crawler/multimodal/MultiModalCrawlOrchestrator.js`, `tools/dev/worker-version-check.js`).
- `recipes/`, `sdk/`, `design/`, `plugins/`, `test-plugins/` → `wip/`.
- `CHANGE_PLAN.md`, `failing_tests.md` → `wip/`.
- `downgrade_node.sh`, `fix_node_deps.sh`, `reinstall_deps.sh` → `wip/` (kept `install_node.sh`, `start_server.sh` at root).
- `crawl.js.config.json` was briefly moved to `wip/` then **restored to root** (load-bearing default location for `src/core/crawler/cli/configArgs.js`).

### Phase H — package.json cleanup

Removed dead scripts:
- `"z-server": "..."`
- `"crawler-app": "electron crawler-app"`

### Validation (second pass)

| Check | Result |
|---|---|
| `node tools/crawl/index.js --help` | ✅ |
| `node tools/dev/{js-scan,js-edit,md-scan}.js --help` | ✅ |
| `node tools/dev/worker-version-check.js --help` | ✅ (loads + reaches network) |
| `require('./src/core/crawler/multimodal/MultiModalCrawlOrchestrator')` | ✅ |
| `crawl.js.config.json` at root | ✅ |
| `data/news.db` size | ✅ unchanged at 23,066.8 MB |

### AGENTS.md updated

Added a "Repo layout" header explaining `solid/` vs `wip/` vs `src/` so future agents discover the convention immediately.

### Combined session reclaim

| Phase | Reclaim |
|---|---|
| Phase A — `tmp/` cleanup | 24.71 GB |
| Phase B — obsolete tools | trivial size, big clarity |
| Phase C — docs archival | trivial size, 53 files |
| Phase E — large non-crawl | ~1.43 GB tracked + caches |
| **Total** | **~26 GB** |

## Links

- Plan: [docs/sessions/2026-04-24-repo-slimdown-plan/PLAN.md](../sessions/2026-04-24-repo-slimdown-plan/PLAN.md)
- Working notes: [docs/sessions/2026-04-24-repo-slimdown-plan/WORKING_NOTES.md](../sessions/2026-04-24-repo-slimdown-plan/WORKING_NOTES.md)
- Archive index: [docs/archives/2026-Q2/README.md](../archives/2026-Q2/README.md)
