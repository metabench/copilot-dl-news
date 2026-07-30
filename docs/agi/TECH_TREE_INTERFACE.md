# TECH TREE INTERFACE — the owner⇄AI contract for the project-status app

**Owner directive 2026-07-29 (cycle 152):** the tech-tree app is a FIRST-CLASS
interface. It is where the owner views project progress, where the owner views
and makes choices, and where AI proposes next steps. This document is the
protocol: read it before touching the app, before answering a signal, and
before proposing work. Code-level conventions live one hop away in
[../../src/ui/server/projectStatus/AGENTS.md](../../src/ui/server/projectStatus/AGENTS.md).

## The three roles, in one loop

1. **The owner views progress.** Grown nodes (done + dated), absorbed roots,
   per-node LEDGER TRAILS, and the committed progress picture — all derived
   from the record, never hand-maintained.
2. **The owner views choices and chooses.** Every available tech carries a
   *💡 request this research* button. **A click is an instruction** — it is the
   owner talking, with the same authority as a chat message.
3. **AI proposes next steps.** A proposal is a *named available tech* on the
   tree: promoted out of the fog with ≤2 named foundations and honest
   Preliminary Data. The owner chooses by clicking. Ranked recommendations go
   in ledger `Next:` lines and ack notes, and the current top recommendation
   should be readable in that tech's own prelim.

The loop that binds them (proven end-to-end across cycles 147–151):

```
owner clicks a node's request button
  → POST /api/research-signal → append to data/agi-signals.jsonl (gitignored)
  → agi-signal orient probe goes RED ("red = the OWNER TALKING")
  → ⚡ OWNER SIGNAL line renders ABOVE the ▶ selection in the generated prompt
  → the agent ties up loose ends, then executes the requested research
  → node tools/agi/ack-signal.js <id> "<what was done>"
  → the factory page's SIGNAL LOG shows the click AND its answer
  → if the work completes the tech: promote it (state "done" + researchedOn)
```

**Non-negotiables of the loop:** never leave a signal unacked (orient cannot
pass); always ack your own test clicks *as test clicks*; the ack note is
owner-facing prose — say what was done and what was deliberately not done.

## Surface map (one jsgui3 app since cycle 161)

Everything renders in ONE activated jsgui3 application — `Server({Ctrl})` SSR
+ bundled client + activation (`controls.js`). The old per-page URLs 302 into
hash routes, so bookmarks and recorded links keep working.

| Route | What it is |
| --- | --- |
| `/` | THE APP: hub, live strip (SSE), research-tree board (SVG-as-controls, selectable-mixin nodes), side detail panel + BEGIN RESEARCH, signal log, settings |
| `/#node=<ID>` | deep link: selects that node (panel + trail + requests follow); selection also WRITES this hash |
| `/#branch=<key>` | deep link: scrolls the board to that branch band |
| `/tech/{agi,tree,crawler,factory}` | 302 → `/#branch=<key>` (retired string pages) |
| `/tech/node?id=<ID>` | 302 → `/#node=<ID>` (retired string pages) |
| `/api/status` | full app payload (incl. techTree, signalHistory, agentActivity) |
| `/api/node?id=<ID>` | per-node ledger trail (mined per request) |
| `/api/events` | SSE: 'activity' patches the strip; 'cards' re-applies data (self-refresh only when the node SET changed) |
| `/api/research-signal` (POST) | the owner's click lands here |
| `/progress.svg` | the committed progress picture (read from disk per request) |

Design consequences and deliberate deviations are recorded in
[JSGUI3_MIGRATION_REPORT.md](JSGUI3_MIGRATION_REPORT.md) — read it before
re-introducing any second render model.

## Data: one fact, one place (derive, don't bake)

| Fact | Its ONE home |
| --- | --- |
| Tree structure: branches, roots, techs, edges (= prereqs), fog | [../../config/tech-tree.json](../../config/tech-tree.json) |
| Curated tech state (`available` / `done`+`researchedOn`) | same file |
| RB-item state (drives RB-node availability/locks LIVE) | [RESEARCH_BACKLOG.md](RESEARCH_BACKLOG.md) state column |
| Roots cutoff / current block | `config/roadmap.json` |
| History, trails, revision record | [IMPROVEMENT_LEDGER.md](IMPROVEMENT_LEDGER.md) — `ledgerMentions(nodeId)` derives each node's trail from row prose + stanzas, zero extra bookkeeping |
| Pending/answered owner signals | `data/agi-signals.jsonl` (append-only; gitignored) |
| Tool inventory count | counted live per request, never written down |

**The rule behind the table:** anything derivable must be derived. Counts and
dates baked into prose rot — the 2026-07-29 audit found three different stale
probe counts for one rig in one file. Point at the live register instead
(e.g. "see tools/dev/probes.json") or compute at render time.

**Trails write themselves:** mention a node's ID in the ledger row of any cycle
that touches it, and its datalinks page gains that cycle automatically. This is
the cheapest documentation you will ever write — do it every time.

## State model and promotion

| State | Meaning | Who sets it |
| --- | --- | --- |
| `available` | researchable now; carries a request button | curated: the JSON; RB refs: backlog state |
| `done` + `researchedOn` | GROWN — visible progress | the delivering agent, **with the date**; a dateless `done` THROWS ("promotion is never dateless") |
| blocked/gated | rendered as a GATED lock — owner-gated work is never offered as clickable research | backlog state |
| absorbed | pre-tree research folded into the roots | roadmap cutoff |
| fog | "Future Technology" — unrevealed slots, edgeless by design (SMAC) | fogPerBranch |

**The tree does not round up.** A tech is promoted when its own definition is
true in the world, not when the code exists: TECH-DASH2B's code shipped in
cycle 149 but "served from the remote worker" only became true when the box
served it (cycle 150) — promotion waited, and that discipline is why grown
nodes are trustworthy. Review-style techs (TECH-TREEREVIEW, TECH-APPREVIEW)
are RE-RUNNABLE operations and deliberately stay `available` forever — their
REVIEW LOG prelim records each run instead.

## How AI proposes next steps (the quality bar)

A proposal is a named tech. To make one:

1. **Name ≤2 foundations** (the SMAC rule; the builder throws on a third).
   A node that cannot name its two foundations is not ready to leave the fog.
2. **Write honest Preliminary Data**: why now, the smallest honest slice, what
   it unlocks, and what was considered and declined (with reasons). Declines
   recorded in prelim are proposals too — they save the next reviewer a cycle.
3. **Never inflate.** The anti-inflation rule outranks completeness: a thin
   frontier of real options beats a bushy tree of wishes. Prefer enriching an
   existing tech's prelim over minting a near-duplicate (the audit found the
   TR-PROBES/TF-PROBES split — don't repeat it).
4. **Big decisions still go to chat.** A proposal the owner must approve
   *before* implementation (migrations, gated surfaces, spending) is presented
   in conversation (AskUserQuestion) — the tree offers work, it does not
   pre-authorize it. The standing GATES (live news.db writes, backups,
   Defender, politeness, concurrency, hooks/skills) always bind.
5. **After any tech-tree.json edit** run
   `node tools/dev/checks/tech-tree-schema.check.js` — the builder's throws
   (phantom edge, third prereq, unknown branch, dateless done) are the schema.

## Reporting progress (owner directive 2026-07-30) — DO THIS

The owner watches these pages while you work. Two channels now run in opposite
directions: the owner clicks research requests **to** you, and you report
progress **to** the owner.

```bash
node tools/agi/report-progress.js <phase> "<one-line note>" [--cycle N]
```

**Call it at PHASE BOUNDARIES — four to six times in a cycle, never per tool
call.** The house phases:

| Phase | When | Example note |
| --- | --- | --- |
| `orient` | after probes, once you know what you're doing | "21 probes green; taking up TECH-PAGESLIVE" |
| `building` | when implementation starts | "live strip + fingerprint poll" |
| `verifying` | tests/browser/live checks | "42/42 page tests; browser next" |
| `closing` | ledger + ritual | "ledger row + push" |

**The flow-protection rule is enforced, not trusted:** records arriving within
20s of the previous one are DROPPED by the store (`activity.js`), so
over-reporting degrades to a no-op instead of a flood. Reporting is
fire-and-forget — the CLI exits 0 whatever happens, writes straight to the log
when the app is down, and must never be a reason a cycle stops or an agent
pauses to think.

**What the owner sees:** a LIVE strip at the top of every tech page (phase, note,
age, grown/available counts) and an `⚙ AGENT WORKING` line on the hub. Both go
plainly **idle** when the newest report is over 45 minutes old — a stale phase
presented as current is the zombie-state failure again (cycle 150).

**Why the pages notice at all (event-driven since cycle 158 — owner: "I don't
want 45s delays"):** the server `fs.watch`es the directories holding every
input a cycle touches (tree spec, backlog, roadmap, ledger, progress.svg, both
queues — enumerated in `FINGERPRINT_INPUTS`) and PUSHES over SSE (`/api/events`)
the instant the fingerprint genuinely changes — measured ~100ms from a CLI
write to the event on the wire. There is no polling anywhere; a slow backstop
sweep exists only because fs.watch is best-effort, and it is not the delivery
path. The event type carries the cycle-157 semantics: `activity` patches the
strip in place and never reloads anything; `cards` means the page is now
showing something false, so it re-renders itself (scroll preserved; held while
a dialog is open and applied on close). A server restart is detected via the
post-reconnect hello and is cards-grade (new code cannot arrive via live
data). If you add a new record type a cycle writes, add it to
`FINGERPRINT_INPUTS` or the pages will silently stop noticing that class of
progress — the watch and the fingerprint share that one list.

## The convergence contract — no busy work (owner directive 2026-07-30)

The always-available architectural-review nodes (TECH-ARCHREVIEW-TREE,
TECH-ARCHREVIEW-CRAWLER) — and ANY improvement work an agent proposes — bind to
these rules. The system must in principle be able to reach a fully-improved
state; a loop that oscillates is doing busy work, and busy work is a defect.

1. **Monotonic axes only.** A suggestion names a MEASURED axis and a direction
   the number can only move one way (the ncdb-debt ratchet is the model).
   Preference-shaped changes ("rename", "restructure as") are inadmissible
   without a measured axis — preferences are exactly what flips back.
2. **Reversal check.** Before proposing, search the ledger for the same
   surface. A prior move in the opposite direction means the suggestion is
   REJECTED as oscillation — unless the prior direction is shown to have been
   measured wrong, which is a CORRECTION and must be labelled as one.
3. **The fixed point is a valid answer.** "No improvements above the bar" is
   the fully-improved state for now. Record it in the REVIEW LOG as a
   convergence datum. A review obliged to always produce suggestions will
   produce busy work by construction.
4. **Busy-work self-check.** Before executing an accepted suggestion: run
   churn-scan on the targets (a file that keeps being "improved" is a red
   flag); check the workflow scorecard's cost-to-catch; and if the last two
   runs produced work whose measured axes did not move, SAY the loop is idling
   and switch to a materially different lane — a gated decision to surface, a
   measurement to build, or honestly nothing.
5. **Declined is recorded.** Every rejected suggestion goes in the REVIEW LOG
   with its reason, so no future run re-derives or re-proposes it.

## Honesty duties (what "first-class" means in practice)

- **States match reality.** A tech whose substance already shipped but still
  reads `available` invites the owner to re-request done work — that is a HIGH
  defect, not cosmetics (cycle-150 audit class).
- **Signal-bearing nodes carry substance.** Every request button is an offer
  to the owner; a node offered with zero prelim/detail makes the owner choose
  blind. Seed at least the why-now and smallest-slice before surfacing one.
- **Answer where the question was asked.** The click came from a page; the
  answer must be readable on that page (SIGNAL LOG entry via the ack note, and
  the node's own detail/prelim updated by the delivering cycle).
- **Verify like a user.** In-process string checks are blind to the c128.5
  class by construction. After UI changes: real browser, live server, DOM
  measurement (`project-status-live` check, c135 five-point pattern; geometry
  over screenshots when the pane isn't compositing). Leave the browser clean.

## Session checklist for this interface

- Orient: probes red? `agi-signal` red = owner clicked — that outranks the ▶
  selection (tie up loose ends first, then do the requested research).
- Before demoing to the owner: server up via launch entry, readiness-wait,
  then navigate.
- Cycle close for any change here: page suites
  (`npx jest src/ui/server/projectStatus`), tech-tree-schema probe, ledger row
  mentioning every touched node ID, the standard close ritual.
