# Module ecosystem — the multi-repo working model (owner directive, 2026-07-22)

**Status:** ACTIVE directive. This supersedes the narrower "thin coordination point (all
DB-shaped logic in ncdb)" framing: that goal stands, but it is now one instance of a
**general rule** — functionality is implemented and tested in dedicated sibling module
repos with clearly defined APIs, and `copilot-dl-news` *calls* them.

**Owner's words (2026-07-22):** the crawler-as-worker + parallel-compression work (and
by extension future functionality) "should be in one of the new module repos, with the
code moved out of copilot-dl-news, but called from there." Confirmed scope: **all of the
module repos apart from `news-crawler-backend-core` for the moment**.
"`news-crawler-itself` is to be made very important, while the other repos are where
various other pieces of functionality … can be implemented and tested separately, with
more clearly defined APIs to help keep the code clean." Also: "when doing thorough
focused work within a particular module, possibly we would make unexpected
breakthroughs" — focused in-module deep work is an explicit goal, not just hygiene.

---

## 1. Repo roles (all siblings of `copilot-dl-news` under `../`)

| Repo | Role | Status |
|------|------|--------|
| **`news-crawler-itself`** | **THE crawler engine** — the most important module. Home for the latest-generation crawler as a worker: fetch loop, politeness, parallel (worker-thread) compression, remote-worker runtime. Currently an EMPTY placeholder to be bootstrapped. | bootstrap now |
| `news-crawler-db` (ncdb) | Unified DB layer + API (Drizzle/TS). Already wired (`file:../news-crawler-db`). The ncdb-debt ratchet keeps driving DB-shaped logic here. | active, wired |
| `news-db-pure-analysis` | Pure functional business logic, zero IO. Already wired. | active, wired |
| `news-db-analysis` | TS analysis package (stats, coverage, trends). | active |
| `news-crawler-document-intelligence` | Pure HTML/DOM document intelligence. | active |
| `news-crawler-url-intelligence` | URL intelligence (classification, shape). | active |
| `news-crawler-places-intelligence` | Multilingual place detection/matching. | active |
| `news-crawler-general-intelligence` | Fusion layer: combines places/document/URL signals into page verdicts. | active |
| `news-dev-tools` | Cross-repo developer tooling (AST scan/edit, sessions, MCP servers). | active |
| `news-crawler-backend-core` | Shared backend kernel (DI, plugins, API composer). | **EXCLUDED for the moment** (owner) |
| ~~`http-cache-store`~~ | NOT part of this ecosystem (owner: "I have not been using http-cache-store"). | out |

`copilot-dl-news` remains: the Electron/unified-app shell, the coordination point, the
live `data/news.db` custodian, the UI, and the operational tooling — **calling** module
APIs rather than containing their implementations.

## 2. The working rules

1. **New functionality goes in a module repo first.** Implement + test it there against
   its own API surface; `copilot-dl-news` consumes it via `file:../<repo>` (the existing
   ncdb pattern). Ask "which module owns this?" before writing code in copilot-dl-news.
2. **Clearly defined APIs.** Each extraction ships a deliberate public API (exports an
   agent can read in one file), its own tests runnable inside the module, and a short
   README/AGENTS.md stating the contract. The API boundary is the deliverable, not a
   by-product.
3. **Moves are delegations, not copies.** When code moves out of copilot-dl-news, the
   copilot side becomes a thin call-through (diff return shapes first — the
   delegation≠repoint trap from the ncdb migration applies to every module).
4. **Focused in-module deep-work cycles are encouraged.** Spending a cycle entirely
   inside one module (its tests, its API, its performance) is a first-class use of a
   cycle — the owner expects breakthroughs from this mode.
5. **The ncdb-debt ratchet generalizes.** Direction of travel for ALL logic: out of the
   coordinator, into the owning module. Retirements from copilot-dl-news are
   improvements (they also answer the BLOATING verdict honestly).

## 3. First migration: the remote crawler → `news-crawler-itself` — DONE (cycle 73)

**Completed 2026-07-22 (cycle 73).** `deploy/remote-crawler-v2/` no longer exists in
copilot-dl-news; `news-crawler-itself` is a real, independently-tested package (45
tests, `npm test` green standalone), deployed to Oracle and DB-evidence-verified
with a live 5-site crawl (490 pages fetched+compressed since baseline, ~83-87%
compression ratios, 1s-floor politeness intact). Full record + lessons:
`docs/agents/FUTURE_AGENT_PLAYBOOK.md` §3, `docs/agi/IMPROVEMENT_LEDGER.md` cycle 73.

The in-flight task (crawler-as-worker + deploy + 5×10 crawl + batch-of-5 delivery +
multithreaded compression) was the **first extraction**:

- Move the Gen2 remote-crawler engine out of `copilot-dl-news/deploy/remote-crawler-v2/`
  into `news-crawler-itself`: `run-worker.js` (fetch loop), `remote-politeness.js`,
  `polite-fetch.js`, `host-match.js`, schema, and the multi-domain server core.
- The current `lib/vendor/{limiter,RobotsCache,utils}.js` byte-copies become *real*
  module code in `news-crawler-itself` (vendoring was a workaround for the package
  boundary; a proper module dissolves it).
- **NEW capability, built in-module:** a worker-thread gzip pool (`worker_threads`) so
  multiple documents compress in parallel off the fetch loop — replacing the inline
  synchronous `zlib.gzipSync(buffer, {level:6})` at the old `run-worker.js:323`. The
  compressed blobs are cached in content storage and served compressed by the server
  (export already sends `Content-Encoding: gzip`).
- `copilot-dl-news` keeps: the deploy tool (`tools/crawl/deploy-remote-server.js`,
  packaging `news-crawler-itself` instead of `deploy/`), `crawl-remote.js` (the driver),
  sync/ledger, and the fleet-partition guard — all *callers*.
- Acceptance stays DB-evidence: politeness deltas from the remote DB, batch delivery
  latency, compression throughput measured, local `news.db` growth.

## 4. Documentation topology for the new model

- This file is the anchor; linked from `docs/agi/BOOT.md` (orient path) and `AGENTS.md`.
- Each module repo carries its own `AGENTS.md` (contract, API, test commands) —
  `news-crawler-itself` gets one at bootstrap; several modules already have theirs.
- `docs/agents/modules-reference.md` is the per-module consumption guide — extend it as
  modules are wired.
- Cross-repo facts that agents need at orient stay in BOOT.md one-hop form; module
  internals live in the module's own docs (don't mirror them into copilot-dl-news).

## 5. Risks / discipline carried over

- **file: deps need `npm install` after module changes** (and the electron restart rule
  still applies for main-process consumers). TS modules need their build step (`tsc`)
  before the consumer sees changes — the ncdb habit.
- **Deploy packaging must follow the code**: the deploy tool stages
  `deploy/remote-crawler-v2/**` today; when the engine moves, staging must package the
  module (the cycle-70 MODULE_NOT_FOUND lesson — a cross-package require that passes
  every local check and crashes on the box).
- **Windows spawn quirks** (shell:true mangling, tar --force-local) live in the deploy
  tool and stay there — see memory `remote-deploy-shell-mangling-and-dead-require`.
