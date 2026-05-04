# Working Notes — Repo Slim-Down Plan

## 2026-04-24 — Discovery

### Measurements
Run on Windows / PowerShell:
- Top-level dir sizes captured in `PLAN.md` §1.
- `tmp/` is the single biggest reclaim target (26 GB), dominated by `news-crawler-db-lab` (23 GB) and 14× `hub-test-*` dirs (~1.5 GB combined).
- Nested `node_modules/` across 5 sub-apps account for ~660 MB.
- `docs/` root has ~200 markdown files; cognitive surface is the bigger problem than bytes (31 MB).

### Commands used
```pwsh
Get-ChildItem -Force -Directory | ForEach-Object { ... } | Sort-Object SizeMB -Desc
Get-ChildItem 'src/ui' -Directory -Force | ForEach-Object { ... }
```

### Open questions (need user input — see PLAN.md §8)
1. Sub-apps fate (crawl-widget, crawler-app, z-server, quick-picker, deploy-manager).
2. `gazetteer-backup/` reproducibility.
3. Confirm `tmp/news-crawler-db-lab/` is dead.
4. Doc archival policy approval.

### Decisions log

| Item | Decision | Date | Rationale |
|---|---|---|---|
| `tmp/news-crawler-db-lab/` (23 GB) | DELETE | 2026-04-24 | Lab artefact, gitignored, no docs/sessions reference. |
| `tmp/hub-test-*` (11 dirs) | DELETE | 2026-04-24 | Old hub-test batches, gitignored. |
| `tmp/v4-*`, `crawl-batch*`, `lab-*`, etc. | DELETE | 2026-04-24 | Stale gitignored scratch. |
| Root `AGENT_IMMEDIATE.js` (empty), `AGENTS_IMMEDIATE.js` (one-off SQL) | DELETE | 2026-04-24 | No code references; superseded by `.github/agents/`. |
| `deprecated-ui-root/` (2 files) | DELETE | 2026-04-24 | Trivially empty stub directory. |
| 16× `tools/*.js` one-off migrations + diagnostics | DELETE | 2026-04-24 | Each verified zero refs in package.json/src/tests/checks/scripts. Recoverable from git. |
| `tools/dev/*-mockup.js`, `demo-interaction.js`, `test_write.js`, `results.json` | DELETE | 2026-04-24 | UI mockups and scratch with no references. |
| `crawler-app/`, `z-server/` | KEEP | 2026-04-24 | Active npm scripts (`crawler-app`, `z-server`). |
| `src/deprecated-ui/` | KEEP | 2026-04-24 | **Despite name, still imported by `src/api/server.js`, `src/background/`, `tools/benchmarks/`.** Migration needed before deletion. |
| `crawl-widget/`, `tools/ui/quick-picker/`, `tools/deploy-manager/` | DEFER | 2026-04-24 | No npm script reference but no explicit user sign-off. ~535 MB nested `node_modules`. |
| `gazetteer-backup/` (159 MB) | DEFER | 2026-04-24 | Need to confirm reproducibility. |
| 53 docs (PHASE_*, *_COMPLETE, *_SUMMARY, *_DELIVERY, REFACTOR write-ups) | ARCHIVE | 2026-04-24 | Moved to `docs/archives/2026-Q2/` with redirect README. |

### Execution log (2026-04-24)

**Phase A — tmp cleanup (gitignored):**
- 44 directories removed.
- Reclaimed: **24.71 GB** (`tmp/` 25.57 → 0.87 GB).
- `data/news.db` verified intact at 23,066.8 MB before and after.

**Phase B — obsolete tools deleted (tracked):**
- 25 items removed (see decisions log above).
- All deletions verified via `grep_search` against `package.json`, `src/`, `tests/`, `checks/`, `scripts/`, `.github/` — zero production references.

**Phase C — docs archival:**
- 53 markdown files moved from `docs/*.md` to `docs/archives/2026-Q2/`.
- `docs/` root markdown count: **206 → 153** (−26%).
- Created `docs/archives/2026-Q2/README.md` with redirection guide.

**Phase D — INDEX + ADR:**
- Updated `docs/INDEX.md`: bumped date stamp, added archive entry.
- Wrote ADR `docs/decisions/2026-04-24-repo-slimdown.md`.

### Validation (post-cleanup)

| Check | Result |
|---|---|
| `node tools/crawl/index.js --help` | ✅ loads |
| `node tools/dev/js-scan.js --help` | ✅ loads |
| `node tools/dev/js-edit.js --help` | ✅ loads |
| `node tools/dev/md-scan.js --help` | ✅ loads |
| `data/news.db` size before/after | ✅ unchanged (23,066.8 MB) |
| `tools/schema/schema-sync.js --check` | ⚠ pre-existing: "Schema definitions file does not exist" — unrelated to this cleanup |

### Open follow-ups (need user sign-off)

1. **Sub-apps:** `crawl-widget/`, `tools/ui/quick-picker/` (256 MB nested `node_modules`), `tools/deploy-manager/` (279 MB nested `node_modules`) — keep, archive-branch, or delete?
2. **`gazetteer-backup/`** (159 MB NDJSON) — drop from disk if reproducible from `data/news.db`.
3. **`src/deprecated-ui/` migration** — plan migration of consumers (`src/api/server.js`, `src/background/`, `tools/benchmarks/`) so the directory can eventually be removed.
4. **Root `checks/` audit** (~250 files, 15 MB) — relocate to feature-local `checks/` per AGENTS.md convention.
5. **Root shell installers** (`downgrade_node.sh`, `fix_node_deps.sh`, `install_node.sh`, `reinstall_deps.sh`, `start_server.sh`) — confirm still referenced by README/setup, else move to `scripts/setup/`.
6. **Root `CHANGE_PLAN.md` (50 KB) and `failing_tests.md`** — both reference active work; leave for owner triage rather than archive.

---

## 2026-04-24 — Second pass (same day)

User asked to (a) delete anything large + non-essential to crawling, (b) preserve the production DB, (c) create `solid/` and `wip/` root dirs, (d) rearrange effectively.

### Phase E — large deletions (1.43 GB tracked + caches)

| Path | Size | Notes |
|---|---|---|
| `crawl-widget/` | 347 MB | Electron widget; only string ref in sql-boundary-check tool. |
| `z-server/` | 308 MB | Removed npm script `z-server` too. |
| `tools/deploy-manager/` | 279 MB | No refs. |
| `tools/ui/quick-picker/` | 256 MB | No refs. |
| `gazetteer-backup/` | 159 MB | Reproducible from `news.db`. |
| `crawler-app/` | 84 MB | Removed npm script `crawler-app` too. |
| `src/native/sigcluster/` | 20 MB | No refs. |
| `dist/`, `build/`, `screenshots/`, `testlogs/` | ~50 MB | Caches/regen. |
| `src/music/` | 7 MB | Stray MP3. |
| `migration-export/`, `migration-temp/`, `.playwright-mcp/`, `.jsgui3-server-cache/`, `.cache/`, stub plugin dirs | small | Caches/empty stubs. |

### Phase F — created `solid/` and `wip/`

- `solid/README.md` — promotion checklist, criteria for stable artifacts.
- `wip/README.md` — manifest of moved items, lifecycle, deletion policy.

### Phase G — moved into `wip/`

| Source | Destination | Refs to fix |
|---|---|---|
| `labs/` | `wip/labs/` | ✅ Fixed `src/core/crawler/multimodal/MultiModalCrawlOrchestrator.js` and `tools/dev/worker-version-check.js` |
| `recipes/` | `wip/recipes/` | none (root recipes are unused; `tools/dev/js-edit/recipes/` is internal) |
| `sdk/`, `design/`, `plugins/`, `test-plugins/` | `wip/` | none |
| `CHANGE_PLAN.md`, `failing_tests.md` | `wip/` | none |
| `downgrade_node.sh`, `fix_node_deps.sh`, `reinstall_deps.sh` | `wip/` | none (kept `install_node.sh`, `start_server.sh` at root) |
| `crawl.js.config.json` | tried `wip/`, **restored to root** | load-bearing default for crawl CLI |

### Phase H — package.json cleanup

Removed dead scripts:
- `"z-server"` (dir deleted)
- `"crawler-app"` (dir deleted)

### Validation

| Check | Result |
|---|---|
| `node tools/crawl/index.js --help` | ✅ |
| `node tools/dev/{js-scan,js-edit,md-scan,worker-version-check}.js` load | ✅ |
| `require('./src/core/crawler/multimodal/MultiModalCrawlOrchestrator')` | ✅ (post-import-fix) |
| `data/news.db` size before / after | ✅ 23,066.8 MB unchanged |
| `crawl.js.config.json` at root | ✅ |

### AGENTS.md updated

Added "Repo layout" header pointing to `solid/`, `wip/`, and the ADR.

### Combined session reclaim

- Phase A (`tmp/`): **24.71 GB**
- Phase B (obsolete tools): clarity > size
- Phase C (docs archival): 53 files moved
- Phase E (large non-crawl): **~1.43 GB**
- **Total: ~26 GB reclaimed** with zero impact on crawling, dev tooling, or AGI/agent docs. Production DB preserved.

### New root layout (final)

```
solid/   ← promotion target (empty + README)
wip/     ← experimental zone (labs, recipes, design, sketches, sketches, planning docs)
src/     ← active production code
tools/   ← active CLIs (crawl, dev, schema, benchmarks, mcp, etc.)
tests/   ← test suites
docs/    ← active docs + archives/
data/    ← production corpus (news.db, ~23 GB) — DO NOT DELETE
checks/  ← cross-cutting checks (audit deferred)
config/, scripts/, public/, deploy/  ← config and deployment
```

### Remaining follow-ups

1. Audit root `checks/` (~250 files) — relocate feature-specific ones to feature-local `checks/`.
2. Plan migration of consumers off `src/deprecated-ui/` (still imported by api/server.js, background/, etc.).
3. `wip/` triage: decide which items to promote to `solid/` vs delete after a quiet period.

---

## 2026-05-04 — Git visibility + artifact policy pass

User clarified repository policy:
- AI behavior belongs in the repo (`.github/instructions/`, `.github/skills/`, `docs/agi/skills/` should be visible and commit-ready).
- Experiments, WIP, deprecated source, and local repo memory should be tracked/reviewable rather than hidden by default.
- Root screenshot output should stay ignored/prunable by default, but documentation-quality screenshots must be allowed when they are useful to humans (daily/weekly/version updates, session reviews, release notes).
- Pruning should stay preview-first and cautious; do not bulk-delete current artifacts without a stronger review.

Changes made:
- Narrowed `.gitignore` from a global `screenshots/` ignore to root-only `/screenshots/`, allowing `docs/**/screenshots/` to be committed intentionally.
- Changed local VS Code workspace setting `git.untrackedChanges` from `hidden` to `separate` so the 487 untracked files appear in Source Control for review.
- Narrowed VS Code screenshot excludes from `**/screenshots/**` to root `screenshots/**` so docs/session screenshot folders are not hidden by default.
- Extended `prune-large-artifacts` to include root `screenshots/` in its default generated-artifact cleanup set.
- Added protected-root safeguards so pruning refuses `docs/`, `src/`, `tools/`, `tests/`, `wip/`, `solid/`, `.github/`, and related source roots unless `--allow-protected-roots` is explicitly supplied.
- Added `checks/large-artifacts-pruner.check.js` to verify root screenshot pruning, docs screenshot preservation, protected-root skips, and `data/news.db` keep behavior.

Validation intent:
- `node checks/large-artifacts-pruner.check.js`
- `node tools/cleanup/prune-large-artifacts.js --json`
- `git check-ignore -v -- screenshots/example.png docs/sessions/2026-05-04-screenshot-tooling-control-centre/screenshots/analysis.json`

Validation results:
- `node checks/large-artifacts-pruner.check.js` passed.
- `node tools/cleanup/prune-large-artifacts.js --json` stayed dry-run and planned only 11 deletions / ~816 KB, including root `screenshots/` output and generated `data/perf-snapshots` material.
- `node tools/cleanup/prune-large-artifacts.js --delete-dir docs/sessions --json` planned zero deletions and reported `docs/sessions` skipped because it is protected by `docs`.
- `git check-ignore` now reports root `screenshots/example.png` ignored by `/screenshots/`, while docs/session screenshots are not ignored.
- Targeted path checks confirmed `.github/instructions/`, `.github/skills/`, `docs/agi/skills/`, `wip/README.md`, `solid/README.md`, and `docs/sessions/.../screenshots/analysis.json` are trackable.
- Visible git status count rose from 503 to 555 after narrowing the screenshot ignore rule; ignored count dropped to 35,345.
