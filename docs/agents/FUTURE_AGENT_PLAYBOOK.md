# Future-agent playbook — detailed instructions

**Who this is for:** any future agent working in this ecosystem. It assumes you are
capable but do NOT assume you will re-derive judgment calls: follow the steps literally,
verify after every step, and use the STOP conditions. Written 2026-07-22 by the agent
that deployed D2a, built the D4 dashboard core, and integrated the module-ecosystem
directive — every rule here was paid for by a real incident.

**How to use this document:**
1. Do the Session Start Ritual (§0) at the beginning of EVERY session. No exceptions.
2. Before any task, find its section here. If a section exists, follow it exactly.
3. After EVERY step marked `VERIFY:`, actually run the verification. If it fails, do
   not continue — go to Troubleshooting (§8) or STOP conditions (§10).
4. Never skip a verification because you are confident. Confidence is not evidence.

---

## 0. Session start ritual (do this every session, in order)

1. Your memory index loads automatically. Then READ `docs/agi/BOOT.md` (in
   `copilot-dl-news`). It is the one-hop map to everything.
2. Run the knowledge probes:
   ```
   node tools/dev/run-probes.js
   ```
   EXPECT: `N passed, 0 failed` (N ≥ 10). A FAILED probe means a previously-true fact
   is now false — investigate it BEFORE new work. (Server-dependent probes SKIP, not
   fail, when the app is down; that is normal.)
3. Read the loop verdict:
   ```
   node tools/agi/cycle-metrics.js
   node tools/dev/workflow-scorecard.js
   ```
   If the verdict says BLOATING, your next cycle should retire/remove something, not
   only add.
4. Check whether the local app is up:
   ```
   node -e "require('http').get('http://127.0.0.1:3170/api/v1/crawl/dashboard-model?limit=1',r=>console.log('HTTP',r.statusCode)).on('error',e=>console.log('DOWN:',e.message))"
   ```
   EXPECT `HTTP 200`. If DOWN and you need the app, restart it via the bridge (§6.1).
5. Read the current plan anchors:
   - `docs/plans/2026-07-22-module-ecosystem.md` — THE working model (owner directive).
   - `docs/plans/2026-07-distributed-crawl-unification.md` — the distributed-crawl phases.

---

## 1. The working model — where does code go?

**Owner directive (2026-07-22):** functionality is implemented and tested in sibling
module repos with clearly defined APIs; `copilot-dl-news` is the COORDINATOR that calls
them. Before writing new code, answer: **"which module owns this?"**

| If the code is… | It belongs in… |
|---|---|
| Crawler engine: fetch loop, politeness, compression, remote worker/server runtime | `../news-crawler-itself` (**the most important module**) |
| SQL / DB access / schema / DB-shaped queries | `../news-crawler-db` (ncdb) |
| Pure business logic, zero IO | `../news-db-pure-analysis` |
| DB statistics / coverage / trends | `../news-db-analysis` |
| HTML/DOM document analysis | `../news-crawler-document-intelligence` |
| URL classification / shape | `../news-crawler-url-intelligence` |
| Place-name detection / gazetteer matching | `../news-crawler-places-intelligence` |
| Fusing intelligence signals into page verdicts | `../news-crawler-general-intelligence` |
| Cross-repo dev tooling | `../news-dev-tools` |
| UI, Electron shell, operational glue, deploy/drive tooling | `copilot-dl-news` (the coordinator keeps these) |

**Do NOT use:** `news-crawler-backend-core` (owner: excluded for the moment) and
`http-cache-store` (owner: not part of this ecosystem).

**Wiring a module into copilot-dl-news:**
1. In the module: proper `package.json` with `name`, `main`, exports in `index.js`,
   and its OWN tests (`npm test`) that pass with no reference to copilot-dl-news paths.
2. In copilot-dl-news `package.json` dependencies: `"<name>": "file:../<repo>"`.
3. Run `npm install` in copilot-dl-news after ANY module change (file: deps are copied,
   not linked live, unless npm chose a symlink — verify, don't assume).
4. TypeScript modules (ncdb etc.) need their build (`npm run build` / `tsc`) BEFORE the
   consumer sees changes.
5. Main-process consumers (Electron server) need an app restart (§6.1) to pick up
   changes. Crawler worker code is forked fresh per crawl — no restart needed for it.

**Moving existing code OUT of copilot-dl-news (a delegation):**
1. FIRST diff the shapes: what columns/fields does the copilot call site actually
   consume vs what the module function returns? If they differ, you must rewrite the
   consumer — a naive repoint ships silent breakage. (This trap has bitten repeatedly;
   it is called delegation≠repoint.)
2. Move code + its tests into the module; make module tests pass STANDALONE.
3. Replace the copilot code with a thin call-through.
4. Run the copilot-side tests + `npm run sql:check-ui` (if DB-related) + the probes.
5. A `require('../../..')` path that escapes a package boundary will pass every local
   check and then crash `MODULE_NOT_FOUND` on the deployed box (cycle-70 incident).
   NEVER require across repo boundaries except via package deps.

---

## 2. Golden rules (never break these)

- **G1 — Politeness never falls back to zero.** The remote worker's crawl-delay floor
  is 1s minimum, even when robots.txt is missing/unreachable. Every failure mode must
  collapse to UNDER-crawl. Never "fix" throughput by shrinking politeness gaps — a
  host's large regular gap (e.g. Guardian ~33s) is a working throttle, not a bug.
- **G2 — The remote SQLite is a spool, never truth.** Crawl success is measured ONLY in
  the local `data/news.db` (per-host `http_status=200` counts from a baseline
  timestamp). Never trust remote counters or the UI alone.
- **G3 — Never run ad-hoc slow queries inline against the live `data/news.db`** (30 GB;
  an uninterruptible better-sqlite3 call once pinned an 870 MB WAL). Use
  `node tools/db/timed-probe.js` (external-kill watchdog + LIMIT guard) for any
  exploratory query.
- **G4 — Destructive operations need explicit owner approval IN CHAT.** Standing items
  under this gate: the 25,267-duplicate-group dedup in live news.db; any remote prune;
  any data deletion. "The plan says so" is not approval.
- **G5 — A changed buildId does NOT prove a deploy worked.** Deploy verification =
  buildId changed AND pm2 process online with 0 restarts AND a seeded test crawl whose
  per-fetch `request_started_at` deltas honor the crawl delay (§4).
- **G6 — jsgui `String_Control` renders text RAW.** It escapes ATTRIBUTES but NOT text
  nodes. Any untrusted value (host names, crawled titles) must go through
  `escapeHtml` (in `src/ui/shared/crawl-dash-core/crawlDashboardCore.js`) before a
  String_Control, or be rendered with DOM `textContent`. Crawled `<title>` text is
  attacker-authored — treat it as hostile.
- **G7 — Per-second rate displays sum ACTIVE jobs only** (status running/pending/created
  AND no finishedAt), and the producer zeroes rates on terminal jobs. Both halves are
  load-bearing (cycle-69 owner-reported bug). Never sum rates across finished jobs.
- **G8 — You may improve your own skills/memory/docs; you may NOT edit the owner's hard
  rules, safety invariants, verification gates, or approval requirements.**
- **G9 — Report honestly.** A failed test is reported as failed, with output. A skipped
  step is reported as skipped. Never claim "deployed/verified/done" without the
  evidence in hand. If you wrote "should work", you have not verified it.
- **G10 — Windows shell traps in spawned commands:** GNU tar needs `--force-local` for
  `C:\` paths; never pass a multi-line script as an ssh argv under `shell:true`
  (cmd.exe mangles it — pipe it to `bash -s` via stdin); `~` does not expand under
  cmd.exe (use absolute forward-slash paths, e.g. the SSH key).

---

## 3. The extraction mission — DONE (cycle 73, 2026-07-22)

**DONE.** The crawler engine is fully extracted into `news-crawler-itself`, the
worker-thread compression pool is built and deployed, and the owner's 5-site crawl
ran and was DB-evidence-verified. Kept here as the RECORD of how it was done — the
same shape applies to the next module extraction (per the module-ecosystem
directive, `docs/plans/2026-07-22-module-ecosystem.md`).

### Phase A — make `news-crawler-itself` a real package
1. `package.json` (name `news-crawler-itself`, main `index.js`, `test` script via
   jest — a plain `node --test` rewrite was considered and rejected: the existing
   tests use jest's `describe/it/jest.mock`, and rewriting working, passing tests to
   save one `npm install` was not worth the risk).
2. **MOVE (not copy)** from `copilot-dl-news/deploy/remote-crawler-v2/` — the
   playbook's original file list here was INCOMPLETE; the real set, found by tracing
   `multi-domain-server.js`'s and `run-worker.js`'s actual `require()` graphs, was:
   `multi-domain-server.js`; `lib/{run-worker,remote-politeness,polite-fetch,
   host-match,schema,server-config,hash-manifest,resource-shield,intelligence-pool,
   export-retention,orchestrator-utils}.js`; the `crawl-domains.*.json` +
   `remote-guardian-*.json` config files (they sit at the same root the deploy tool
   stages, and the on-box `--config` path is relative to that root); `lib/__tests__/
   {polite-fetch,remote-politeness}.test.js`. **Always trace the require graph
   yourself before trusting a file list — 5 of 12 files here were missed by
   reasoning from the directory listing alone.**
3. The `lib/vendor/{limiter,RobotsCache,utils}.js` byte-copies became REAL module
   code at `lib/politeness/` (sibling internal require `./utils` needed no edit —
   both files moved together). `vendor-sync.test.js` was deleted (no external
   original left to drift-check once the files are the module's own).
4. `run-worker.js` and `multi-domain-server.js` both required
   `../../[../]src/db/openNewsCrawlerDb` — that file is used by HUNDREDS of other
   call sites across copilot-dl-news's main app and could not move. Resolution: a
   fresh, minimal `lib/db.js` inside news-crawler-itself doing the same
   `createDbAdapter(...)` call against the module's OWN `news-crawler-db` dependency
   — not a copy of shared logic, just this module's own dependency-wiring glue.
5. VERIFIED: `npm test` inside news-crawler-itself green (45/45 by the end, incl. 3
   test files split/moved from copilot-dl-news along the module boundary — see §3
   note below); `node --check` on every moved file; no cross-repo requires (grep
   clean).

### Phase B — the parallel compression pool (built IN the module)
Design (follow this; do not improvise):
1. File `src/compression/gzip-pool.js`: a `GzipPool` class over `worker_threads`.
   - Pool size: `Math.max(1, Math.min(require('os').cpus().length - 1, 4))` — cap at 4
     so the crawler/server never starve (the Oracle box is small).
   - Worker script receives `{id, buffer, level}`, posts back `{id, compressed}` or
     `{id, error}`. Transfer ArrayBuffers (zero-copy) where possible.
   - API: `await pool.gzip(buffer, {level: 6}) -> Buffer`; `pool.stats()`;
     `await pool.close()` (drains in-flight work, terminates workers).
   - A crashed worker rejects its in-flight jobs and is respawned once; repeated
     crashes surface loudly (no silent degradation).
2. Integration in the worker fetch loop: replace the synchronous
   `zlib.gzipSync(result.buffer, {level:6})` (old run-worker.js:323). The fetch loop
   stays strictly sequential (politeness!) — compression is what becomes parallel:
   fire `pool.gzip(...)` and continue fetching; a bounded in-flight window (max 8
   pending compress+store chains) prevents memory blowup; the DB INSERT stays on the
   MAIN thread (better-sqlite3 is main-thread-only); the run's end AWAITS all pending
   stores before finishing.
3. VERIFY (tests inside the module):
   - Round-trip: `zlib.gunzipSync(await pool.gzip(buf))` equals the original buffer.
   - The stored sha256 is of the UNCOMPRESSED buffer (matches existing schema
     semantics — check `insertRemoteCrawlerCompressedContent` fields).
   - Parallel speedup: compressing 20 × ~200KB buffers through the pool is measurably
     faster than serial `gzipSync` (assert wall-clock ratio, generous margin).
   - `close()` drains; worker-crash path rejects and respawns.
4. The server already serves exports compressed (`Content-Encoding: gzip`) and the
   content store keeps compressed blobs — do not change those contracts.

### Phase C — rewire copilot-dl-news as a caller
1. Add `"news-crawler-itself": "file:../news-crawler-itself"` to copilot-dl-news
   `package.json`; `npm install`.
2. Update the deploy tool (`tools/crawl/deploy-remote-server.js`): the staging step
   currently copies `deploy/remote-crawler-v2/**` — it must now package the module
   (its files land where the PM2 start path + install script expect, or adjust both
   consistently: `createRemoteInstallScript` + `pm2 start` app entry + `rm -rf` list).
   Node modules of the module itself must be installable on the box
   (`npm install --omit=dev` there).
3. VERIFY: `node --check` the deploy tool; run it WITHOUT `--apply` (dry-run) and read
   its plan output; then a full `--apply` per §4.

### Phase D — deploy (§4 has the full procedure with all traps)

### Phase E — the owner's crawl (5 sites × 10 pages, batches of 5)
1. Pick 5 modest hosts already in the remote config (e.g. from:
   bbc.com, theguardian.com, apnews.com, npr.org, cnn.com — check
   `crawl-domains.news-10x1000.json` for the live list).
2. Populate the partition so seeding is allowed — edit
   `tools/crawl/fleet-partition.json` `remoteHosts` to exactly those 5 hosts.
3. Seed + start each domain with a 10-page cap. `crawl-remote.js start` may not carry
   maxPages — if not, POST directly:
   ```
   node -e "const http=require('http');const b=JSON.stringify({domain:'bbc.com',maxPages:10});const r=http.request({host:'141.144.193.218',port:3200,path:'/api/start',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(b)}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>console.log(res.statusCode,s));});r.write(b);r.end();"
   ```
   (repeat per domain, or use `node tools/crawl/crawl-remote.js seed/start` if it
   supports the cap — read its `--help` first).
4. Deliver in small batches. **`--sync-mode streaming --sync-batch-size 5` are real
   flags but they are wired into the `collect` command's SSE-push path ONLY — the
   plain `sync` subcommand silently ignores them and stays in interval/window
   polling mode** (cycle 73 finding: passing them to `sync` produced no error, no
   "Mode: streaming" in the log, and a 500-URL/5s window — not batches of 5). Two
   working options: (a) drive the whole crawl through `collect` from the start,
   which DOES honor these flags; or (b) if you're composing `seed`+`start`+`sync`
   manually (as this playbook's step 3 does), tune the plain sync's own window
   instead: `node tools/crawl/crawl-remote.js sync --window 2 --interval 3` — a
   small time window naturally yields small, frequent batches (at ~1 page/s/domain
   politeness pacing, a 2s window across 5 domains ≈ 5-10 new items per round),
   achieving the same practical effect without needing SSE. Verified live: 61
   rounds, most landing 4-10 new content items each.
5. VERIFY (all DB-evidence):
   - Local growth: `npm run db:downloads:recent` and `npm run db:downloads:stats`
     show the 5 hosts gaining ~10 pages each from your baseline timestamp.
   - Politeness: per-host `request_started_at` deltas ≥ ~1s (compute from the remote
     DB over ssh with better-sqlite3 readonly, `ORDER BY rowid DESC LIMIT 100` —
     NEVER an unbounded scan; there is no sqlite3 CLI on the box).
   - Compression: recent rows in the remote content store have
     `compressedSize < uncompressedSize`, valid sha256, and the pool's stats counted
     them (log or stats endpoint).
   - Batches: the sync log shows flushes of ~5 pages per batch.
6. CLEANUP: stop the 5 domains; revert `fleet-partition.json` `remoteHosts` to `[]`;
   verify pm2 shows the server online and no crash-looping workers.

---

## 4. Deploy procedure (Oracle remote — exact)

Target: `ubuntu@141.144.193.218`, PM2 service `crawl-server-v4`, port 3200, live DB
`data/news-simple.db` (2.6 GB — the tool's default `data/news.db` is WRONG for this
box; always pass the override). SSH key: `C:/Users/james/.ssh/ssh-key-2025-11-11.key`
(absolute path — `~` does not expand under cmd.exe).

1. PRE-CHECK — the server must be idle:
   ```
   node tools/crawl/crawl-remote.js status
   ```
   If any domain is `running`, stop it: `node tools/crawl/crawl-remote.js stop --domain <d>`.
   If a `crawl-worker-<host>` is crash-looping in pm2, delete it over ssh:
   `pm2 delete crawl-worker-<host>`.
2. RECORD the current buildId:
   ```
   node -e "require('http').get({host:'141.144.193.218',port:3200,path:'/api/health'},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>console.log(JSON.parse(b).build.buildId))})"
   ```
3. DEPLOY:
   ```
   node tools/crawl/deploy-remote-server.js --apply --force-build --ssh-key "C:/Users/james/.ssh/ssh-key-2025-11-11.key" --remote-db data/news-simple.db
   ```
   The tool refuses if the remote is busy (good — do step 1). The install script
   preserves `data/` — never "clean" that directory.
4. VERIFY the deploy — ALL of these, in order:
   a. buildId CHANGED (repeat step 2; compare).
   b. `pm2 list` over ssh: `crawl-server-v4` online, **0 restarts**, fresh uptime.
   c. Start ONE domain briefly and check the worker: `pm2 list` shows
      `crawl-worker-<host>` **online, and the FIRST start after your deploy has 0
      restarts** (a genuine crash-loop = a MODULE_NOT_FOUND or similar — read
      `pm2 logs <name> --nostream`; note the log ring buffer holds STALE lines from
      previous runs — check pids/timestamps, not just message text).
      **IMPORTANT (cycle 73 finding): `run-worker.js` is a ONE-SHOT script that
      crawls up to `--max-pages` then exits cleanly** — it is not a long-running
      service. PM2's `fork_mode` with default `autorestart:true` restarts it EVERY
      time it exits, INCLUDING a clean, successful completion. Over a multi-minute
      crawl this means the restart COUNTER climbs into the dozens even when
      everything is working correctly (each restart = another successful
      up-to-max-pages run). **Restart count alone is therefore NOT a crash signal
      for `crawl-worker-*` processes once a crawl has been running a while** — only
      check it as "0 restarts" on the FIRST start right after a fresh deploy (before
      it has had a chance to complete-and-restart even once). To tell a genuine
      crash-loop from healthy one-shot-cycling at ANY point, read the OUT log
      (`pm2 logs <name> --nostream --out`, filtered to exclude the harmless
      `newsSourcesSeeder` bootstrap warning) for `Crawl v2 finished (completed)`
      lines — their presence means the process is exiting on purpose, not crashing.
   d. Politeness acceptance: after ~60s of crawling, per-fetch deltas from the remote
      DB (join `http_responses`⋈`urls`, last ~100 rows by rowid) have median ≥ 1s.
   e. Stop the test domain.
5. If the tool reports success but nothing changed (buildId same, files' mtimes old):
   the install script was mangled in transit. The tool pipes it via ssh stdin to
   `bash -s` precisely to prevent this — if it recurs, ssh in and read what actually
   ran; do NOT trust the tool's success line over the box's own state.

---

## 5. Crawling — local (the standing directive)

Every improvement-loop turn crawls real news and reports headlines + archive growth.

1. Launch a bounded multi-host crawl (dispatch-and-return; 202 + batchId):
   ```
   node -e "const http=require('http');const b=JSON.stringify({maxHosts:5,perHostLimit:12,waitCapMs:180000});const r=http.request({host:'127.0.0.1',port:3170,path:'/api/v1/crawl/frontier/run-multi',method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(b)}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>console.log(res.statusCode,s));});r.write(b);r.end();"
   ```
2. Poll `GET /api/v1/crawl/frontier/run-multi/<batchId>` until `status:"done"`.
3. Report headlines from the unified endpoint:
   `GET /api/v1/crawl/dashboard-model?limit=10` → `headlines.items`.
4. "0 pages" on a frontier fill is usually a due/timing artifact, not a fault.
   Guardian being slow is politeness (G1), not a bug.

---

## 6. Operational how-tos

### 6.1 Restart the Electron app (needed after main-process/server code changes)
The dev-bridge daemon watches `tools/dev-bridge/inbox/`:
```
echo '{"action":"restart-electron","params":{}}' > tools/dev-bridge/inbox/<unique-name>.json
```
Poll `tools/dev-bridge/outbox/<unique-name>.result.json` (every 2s, up to 60s).
EXPECT `"ok": true, "httpOk": true`. If the bridge is dead (no result), check
`tools/dev-bridge/state/bridge.pid` is a live process; the probes surface a dead
bridge at orient.

### 6.2 Safe DB exploration
Live `data/news.db` (30 GB): only via `node tools/db/timed-probe.js` (G3). Remote box:
no sqlite3 CLI — use `node -e` with better-sqlite3 `{readonly:true}` and ALWAYS a
LIMIT / rowid-bounded query.

### 6.3 UI verification
SSR checks first (`node src/ui/server/checks/<x>.check.js`), browser second. For the
crawl-status page: the client script is emitted from a TEMPLATE LITERAL — regex
backslashes get eaten (use string ops), and "code present in emitted text" does NOT
mean "code runs" — confirm fetches actually fire (network tab / logs). Any element
with a hardcoded dark background MUST set an explicit light text color.

---

## 7. jsgui3 UI rules (when building controls)

1. Author DIRECT-style: `class X extends jsgui.Control`, `super({...spec, tagName,
   __type_name})`, read options off `spec`, `if (!spec.el) this.compose()`.
2. `compose()` is NEVER auto-invoked; client activation needs `__type_name` +
   registration in `controlManifest.js`.
3. Text via `String_Control` — which renders RAW: escape untrusted text (G6).
4. `activate()` guards with `this.__active`; any timer it starts MUST be cleared in an
   overridden `remove()` — and that override must guard `this.parent` before calling
   `super.remove()` (the base derefs `this.parent.content`; unmounted teardown crashes
   without the guard).
5. Test with the render harness:
   `require('src/ui/controls/checks/renderCheckHarness')`, assert on
   `all_html_render()` output; keep a `.check.js` script alongside.
6. Shared dashboard logic lives in `src/ui/shared/crawl-dash-core/` — use
   `crawlDashboardCore` + `DashboardDataAdapter`; do NOT re-implement throughput math
   (G7). A parity test locks the core to the legacy client; the ONE intentional
   divergence (queue clamps non-finite to 0) is documented + tested — don't "fix" it.

---

## 8. Troubleshooting (symptom → cause → action)

| Symptom | Likely cause | Action |
|---|---|---|
| Deploy "complete" but buildId unchanged | install script mangled (Windows shell) or wrong target | ssh in; check file mtimes + pm2 uptime; see §4.5 |
| pm2 worker crash-looping, `MODULE_NOT_FOUND ../../..` | a require escapes the deployed package | fix the packaging/require; never hand-patch on the box only |
| Port 3170 refuses but process alive | event-loop wedge (sync DB work starving accept) | the watchdog should respawn; do not pile on more crawls; check supervisor logs |
| "Saved docs/s" nonzero while idle | phantom rates regression | re-check G7 both halves; run the terminal-rates + client render tests |
| Host crawls "too slow", big regular gaps | politeness throttle working (G1) | do nothing; throughput lever is MORE hosts, not smaller gaps |
| Frontier fill returns 0 pages | due/timing artifact | drive hydrate→run-multi directly and poll the batch before calling it a fault |
| Headlines look like section titles (Opinion, Sport) | hub-domination in selection | hubFraction cap + isArticleShapedUrl preference exist in ncdb selectDueFrontier — check they're enabled |
| A jest suite fails on paths under `tmp/` | stale build-stage copy being scanned | delete the stale `tmp/**/stage` tree |
| better-sqlite3 query hangs the session | G3 violated | kill via the timed-probe watchdog pattern; never inline again |
| UI text invisible in light theme | hardcoded dark bg without explicit fg | pair bg+fg always; check computed styles in BOTH themes |

---

## 9. Bookkeeping (per improvement cycle)

1. Append a row to `docs/agi/IMPROVEMENT_LEDGER.md` + the machine stanza
   `<!-- cycle:{...} -->` (schema: WORKFLOW_MEASUREMENT.md). Validate:
   `node tools/agi/cycle-metrics.js --check`.
2. Every multi-agent workflow run gets a row in `docs/agi/WORKFLOW_LEDGER.jsonl`
   (fields: date, cycle, workflow, shape, task_type, cost_turns, verdict,
   validation_method, validation_outcome, issues_flagged, escaped, evidence,
   confidence). VALIDATE the workflow's verdict yourself with evidence before
   recording CONFIRMED — workflows can be wrong (label refuted_kind on REFUTED runs).
3. Add a SELF_MODEL.md calibration row when you learn something durable about how to
   work (or on a model swap — run the calibration in the singularity skill).
4. Bank non-obvious, durable facts as memory files (one fact per file, frontmatter,
   indexed in MEMORY.md). The repo corpus is the database; memory is a cache.
5. Honest accounting: a no-delta cycle is written down as such; retirements count as
   improvements.

---

## 10. STOP conditions — halt and ask the owner

- Anything DESTRUCTIVE on live data: the news.db dedup (25,267 groups), remote prune,
  dropping/rewriting tables, deleting files you did not create.
- Deploying when the remote is mid-crawl for someone else's purpose.
- Any action that would relax a safety gate, politeness floor, or verification gate.
- A probe failure you cannot explain after investigation.
- Evidence contradicts the task's premise (e.g. asked to "fix" something that is
  working as intended — like politeness gaps): surface the evidence instead of
  "fixing".
- You are about to copy code between repos because the proper wiring is unclear —
  stop and re-read §1; copies rot.

---

*Keep this playbook current: when an instruction here proves wrong or incomplete,
fix it in the same session you discover it, and note the change in the ledger.*
