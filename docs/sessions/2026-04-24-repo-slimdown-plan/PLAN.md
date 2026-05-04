# Plan: Repo Slim-Down & Streamline

**Objective:** Reduce repository size, file count, and cognitive surface area while preserving all tooling required for (a) crawling news sites and (b) day-to-day coding/agent workflows.

**Done when:**
- On-disk footprint of ignored working directories (`tmp/`, nested `node_modules/`) is documented and a one-shot cleanup script exists.
- Tracked surface area (docs + source) has a written deprecation list with owners/decisions, and all "PHASE_N_COMPLETE" / one-off summary docs are archived under `docs/archives/`.
- Dead/legacy code roots (`deprecated-ui-root/`, `src/deprecated-ui/`, unused Electron sub-apps) are either removed or moved to an `archive/` branch with a README pointer.
- Core crawl tooling (`tools/crawl/`, `tools/dev/`, `src/crawler/*`, `crawl.js`, `npm run crawl`) and DB/agent docs (`AGENTS.md`, `tools/crawl/AGENT.md`, `tools/dev/AGENT.md`, `docs/INDEX.md`, top-level quick-references) are explicitly verified as **kept**.
- A short ADR records what was kept, what was dropped, and the reasoning.

**Non-goals:**
- Not refactoring any retained source.
- Not deleting `data/` (user crawl corpus, 78 GB, already gitignored).
- Not changing dependencies or `package.json` scripts in this pass.

---

## 1. Current state (measured 2026-04-24)

### 1a. Working-directory weight (gitignored, disk-only)

| Path | Size | Notes |
|---|---|---|
| `data/` | **78.8 GB** | User crawl corpus. Gitignored. Leave. |
| `tmp/news-crawler-db-lab/` | **23.0 GB** | Lab artefact, 21 files. |
| `tmp/` (rest, excl. lab) | ~3.1 GB | 14× `hub-test-*` dirs (~123–181 MB each), `crawl-batch*`, `v4-*-fleet/crawl/test`, `lab-05*`, etc. |
| Nested `node_modules/` | ~660 MB | `tools/deploy-manager` 279 MB, `tools/ui/quick-picker` 256 MB, `z-server` ~?, `crawl-widget` ~?, `crawler-app` ~?. |
| `gazetteer-backup/` | 159 MB | 8 NDJSON files. Gitignored. |
| `testlogs/` | 27 MB | Gitignored. |
| `screenshots/`, `dist/`, `build/`, `.playwright-mcp/`, `.jsgui3-server-cache/`, `migration-temp/`, `migration-export/` | <70 MB combined | All gitignored. |

### 1b. Tracked surface area

| Path | Size | Files | Status |
|---|---|---|---|
| `src/` | 604 MB | 4,274 | Mostly active, but contains `src/deprecated-ui/` (16.9 MB, 391 files), `src/native/sigcluster/` (20 MB, 1,298 files), `src/music/` (7 MB, 1 file). |
| `tools/` | 550 MB | 3,322 | Heavy due to nested `node_modules`; tracked source ~10 MB. Many one-off scripts at root. |
| `docs/` | 31.5 MB | 2,573 | ~200 root-level `.md` files; lots of `PHASE_N_*`, `*_COMPLETE`, `*_SUMMARY`, duplicated planning docs. |
| `crawl-widget/`, `crawler-app/`, `z-server/`, `tools/ui/quick-picker/` | — | — | Electron / experimental sub-apps each with own `node_modules`. Need keep/drop decision. |
| `deprecated-ui-root/` | 4 KB | 2 | Trivially removable. |
| Root-level | — | — | `AGENT_IMMEDIATE.js`, `AGENTS_IMMEDIATE.js`, `CHANGE_PLAN.md`, `failing_tests.md`, 5× `*.sh` install scripts, `crawl.js.config.json`. |
| `checks/` (root) | 15 MB | ~250 | Convention per AGENTS.md is **co-located** `checks/` per feature. Audit which are still referenced. |

---

## 2. Must-keep (crawling + coding tooling)

These are the load-bearing pieces. Any cleanup must not touch them without an explicit decision note.

### Crawling
- `crawl.js` (root entrypoint), `npm run crawl`, `npm run crawl:remote`
- `tools/crawl/` — full directory, including `AGENT.md`
- `tools/crawl/crawl-remote.js`, `tools/crawl/agent-go.js`
- `src/crawler/`, `src/data/db/`, `src/db/sqlite/v1/schema-definitions.js`
- `tools/schema-sync.js` and `npm run schema:*` scripts
- `data/news.db` (production DB) and `.env`

### Coding / agent workflow
- `AGENTS.md`, `.github/instructions/`, `.github/agents/`
- `tools/dev/` (`js-scan.js`, `js-edit.js`, `md-scan.js`, `AGENT.md`)
- `docs/INDEX.md`
- `docs/COMMAND_EXECUTION_GUIDE.md`, `docs/TESTING_QUICK_REFERENCE.md`, `docs/DATABASE_QUICK_REFERENCE.md`
- `docs/AGENT_REFACTORING_PLAYBOOK.md`, `docs/agi/`, `docs/workflows/`, `docs/agents/`
- `docs/sessions/` (memory layer — keep all)
- `tests/`, `checks/` referenced by tests, `package.json`, `jsconfig.json`
- `.kilo/`, `.kilocodemodes` (Kilo agent integration)

---

## 3. Slim-down phases

### Phase A — Disk-only cleanup (zero risk, reversible by re-running tools)

These touch only gitignored paths. Recommended as a single PowerShell script `tools/maintenance/slim-disk.ps1` (with `-WhatIf` default).

| Action | Saves | Notes |
|---|---|---|
| Delete `tmp/news-crawler-db-lab/` | ~23 GB | Confirm not actively used by any open session; nothing references it in `docs/sessions/`. |
| Delete `tmp/hub-test-2026-01-08T*/` (8 dirs) | ~1.0 GB | All from Jan 8 batch; superseded. |
| Delete `tmp/v4-*` (`v4-fresh-crawl`, `v4-100-page-test`, `v4-200-crawl`, `v4-20x50-fleet`, `v4-supervisor-bundle`, `v4-remote-snapshot`) | ~470 MB | V4 crawl scratch artefacts. |
| Delete `tmp/crawl-batch*`, `tmp/hub-test-manual` | ~550 MB | Old batch outputs. |
| Delete `tmp/backups/`, `tmp/lab-050*`, `tmp/lab-051-smooth/`, `tmp/warmup-validation/`, `tmp/notes/`, `tmp/imports/` | ~60 MB | Stale labs/snapshots. |
| Prune nested `node_modules/` in `crawl-widget/`, `crawler-app/`, `z-server/`, `tools/ui/quick-picker/`, `tools/deploy-manager/` (only if those sub-apps are confirmed obsolete in Phase B/C) | ~660 MB | Otherwise leave. |
| Truncate/rotate `testlogs/` to last 7 days | ~25 MB | Gitignored; safe. |
| Clear `.playwright-mcp/`, `.jsgui3-server-cache/`, `dist/`, `build/analysis-charts/` | ~25 MB | All regenerated on demand. |

**Estimated reclaim: ~25 GB immediately, ~660 MB more after Phase B.**

### Phase B — Decide fate of sub-apps & deprecated trees

For each, write a one-line decision in `WORKING_NOTES.md` (KEEP / ARCHIVE-BRANCH / DELETE):

- `crawl-widget/` — Electron crawl widget. Used by anyone? If not: archive branch.
- `crawler-app/` — Electron crawler app. Same question.
- `z-server/` — appears to be an experimental server. Same question.
- `tools/ui/quick-picker/` — quick-picker Electron tool. Same question.
- `tools/deploy-manager/` — deploy management UI. Same question.
- `deprecated-ui-root/` — 2 files; **delete**.
- `src/deprecated-ui/` — 391 files, 16.9 MB, name is self-explanatory; **propose delete** (verify zero `require/import` from live src first via `node tools/dev/js-scan.js --what-imports src/deprecated-ui/index.js --json`).
- `src/native/sigcluster/` — 1,298 files, 20 MB. Confirm if still consumed; if not, archive.
- `src/music/` — single 7 MB file, looks like a test fixture or stray asset. Check and remove if unused.
- `gazetteer-backup/` — 159 MB NDJSON. If reproducible from `data/news.db`, delete from disk (already gitignored).
- `migration-export/`, `migration-temp/` — gitignored; safe to delete on disk.
- `labs/` — 1.6 MB, 192 files. Likely scratch; review, archive.

Discovery commands per candidate:
```pwsh
node tools/dev/js-scan.js --what-imports <entry> --json
node tools/dev/md-scan.js --dir docs --search <name> --json
git log --oneline -- <path> | Select-Object -First 10
```

### Phase C — Documentation triage

`docs/` has ~200 root-level `.md` files. Goal: collapse to a navigable set.

1. **Move to `docs/archives/<yyyy-quarter>/`:**
   - All `PHASE_N_*` (10+ files), `*_COMPLETE.md` (15+), `*_SUMMARY.md` not referenced by `docs/INDEX.md`, `*_DELIVERY*`, `*_DELIVERABLES*`.
   - Multiple competing `CRAWLER_*REFACTOR*`, `CLI_REFACTORING_*`, `DATABASE_MIGRATION_*` write-ups — keep one canonical, archive the rest with cross-links.
2. **Consolidate duplicates:**
   - Multiple `GAZETTEER_*` docs → single index page in `docs/gazetteer/INDEX.md`.
   - Multiple `GEOGRAPHY_*`, `INTELLIGENT_CRAWL_*`, `JS_TOOLS_*`, `HUB_*` clusters → fold under topic indexes.
3. **Verify `docs/INDEX.md` covers everything kept at root.** Anything not indexed is a candidate for archival.
4. **Delete trivial residue:** `tmp_delete_test.md`, `dedupe_conflicts*.md` (regenerate-on-demand artefacts).

Discovery:
```pwsh
node tools/dev/md-scan.js --dir docs --search "PHASE_" --json
node tools/dev/md-scan.js --dir docs --search "_COMPLETE" --json
```

### Phase D — Root-level cleanup

Move/delete:
- `AGENT_IMMEDIATE.js`, `AGENTS_IMMEDIATE.js` → confirm superseded by `.github/agents/`; delete or archive.
- `CHANGE_PLAN.md`, `failing_tests.md` → move into a session folder under `docs/sessions/archives/`.
- `downgrade_node.sh`, `fix_node_deps.sh`, `install_node.sh`, `reinstall_deps.sh`, `start_server.sh` → move to `scripts/setup/` and document in `README.md`.
- `crawl.js.config.json` → if only used by a removed flow, delete; else move to `config/`.

### Phase E — `checks/` audit

`checks/` at the root has ~250 files (15 MB). AGENTS.md says checks should be **co-located** with their feature (`src/.../checks/<name>.check.js`). Audit:
1. List every `checks/*.check.js` and grep for the feature it tests.
2. For each check whose feature owner is identifiable, move it to that feature's local `checks/` dir.
3. Stale checks (feature deleted) → delete.
4. Genuinely cross-cutting checks → keep at root with an `INDEX.md`.

---

## 4. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Deleting a `tmp/` dir that an in-flight session depends on | Grep `docs/sessions/**/*.md` for the dir name before delete. |
| Removing a sub-app someone still ships | Phase B uses an explicit KEEP/ARCHIVE/DELETE decision per app, recorded in WORKING_NOTES. |
| Archived doc is still linked from a kept doc | After moving, run `node tools/dev/md-scan.js --search "<old-filename>" --json` and patch links. |
| Breaking `npm run` scripts by moving setup `.sh` files | Update `README.md` and `package.json` references in same commit. |
| Losing institutional memory by deleting "_COMPLETE" docs | Move to `docs/archives/`, never delete. Tag with date prefix. |

---

## 5. Test / validation plan

After each phase:
- `npm run schema:check` — schema definitions still in sync.
- `npm run test:by-path tests/tools/__tests__/js-scan.test.js` — discovery tooling intact.
- `npm run test:by-path tests/tools/__tests__/js-edit.test.js` — edit tooling intact.
- `node tools/crawl/crawl-remote.js --help` — crawl CLI still loads.
- `node crawl.js --help` — root crawl still loads.
- Manual: open `docs/INDEX.md` and walk the top section links.

---

## 6. Sequencing & estimated reclaim

| Phase | Risk | Reclaim | Order |
|---|---|---|---|
| A — disk-only | zero | ~25 GB | first |
| D — root-level files | low | trivial | second |
| C — docs triage | low (moves only) | trivial size, big cognitive | third |
| E — checks audit | medium | ~10 MB + clarity | fourth |
| B — sub-apps | medium-high (deletions) | ~660 MB + ~17 MB src | last, with explicit user sign-off |

---

## 7. Deliverables of this plan

- This `PLAN.md` (done).
- `WORKING_NOTES.md` — to be appended during execution with KEEP/ARCHIVE/DELETE decisions per sub-app.
- `tools/maintenance/slim-disk.ps1` — Phase A executor with `-WhatIf` default. (Future task.)
- `docs/decisions/2026-04-24-repo-slimdown.md` — ADR-lite recording final decisions. (Future task.)

---

## 8. Confirmation needed before execution

User decisions required before any deletion:

1. **Sub-apps (Phase B):** Are `crawl-widget/`, `crawler-app/`, `z-server/`, `tools/ui/quick-picker/`, `tools/deploy-manager/` still in use? Default proposal: archive to a `legacy/sub-apps` git branch and remove from `main`.
2. **`gazetteer-backup/`:** Reproducible? Safe to drop from disk?
3. **`tmp/news-crawler-db-lab/` (23 GB):** Confirm safe to delete.
4. **Doc archival policy:** OK to bulk-move `PHASE_N_*` / `*_COMPLETE.md` / `*_SUMMARY.md` under `docs/archives/2026-Q2/` with cross-link stubs?

Once confirmed, execution proceeds Phase A → D → C → E → B.
