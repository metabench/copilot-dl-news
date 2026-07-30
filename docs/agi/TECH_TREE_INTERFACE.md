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

## Surface map

| Route | What it is | Render model |
| --- | --- | --- |
| `/` | status hub: branch cards, progress picture, pending-signal ⚡ lines | publish-once SSR + client refresh-on-activate (the c128.5 fix — see AGENTS.md) |
| `/tech/agi` `/tech/tree` `/tech/crawler` `/tech/factory` | the four branch pages: drawn tree SVG, node cards, request buttons; factory adds TOOL FACTORY + SIGNAL LOG | **per request** — cannot go stale |
| `/tech/node?id=<ID>` | per-tech datalinks page: everything the modal shows + LEDGER TRAIL + walkable BUILT FROM / UNLOCKS links (no-JS friendly) | per request; new nodes need **no route registration** |
| `/api/status` | live JSON the hub client reads | live |
| `/api/research-signal` (POST) | the owner's click lands here | append-only queue |
| `/progress.svg` | the committed progress picture | read from disk per request |

Run it: workspace launch entry `project-status` (port 3184). Wait for readiness
(curl-loop the URL to 200) before navigating a browser at it — the server takes
~15s to boot (c147 lesson).

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
