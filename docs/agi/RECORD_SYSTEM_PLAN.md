# Record system — plan and status

How findings become records, records become decisions, and decisions become
work — and what still needs building. Started 2026-08-07.

**Paths in this document are relative to the repos directory**, so they begin
with the repo name. There are five sibling repos and a bare `src/db/index.ts`
is ambiguous.

## The problem this addresses

Records were produced by an agent *remembering* to produce them and validated
after the fact. Thirty probes checked records; **nothing wrote one**. All 192
cycle stanzas came from throwaway hand-written scripts that re-derived the same
boundary checks each time.

The measured cost is in the ledger. Cycle 128's audit found **77 of 84 stanzas
landed a day or more after their ledger date** — the closing steps were deferred
invisibly for seventy-five cycles until the owner noticed. Separately, twelve
decision documents existed that nothing parsed, and the improvement loop stalled
for **four consecutive cycles** on decisions the status board never displayed.

## The design rule

**Derived by default.** A record whose state is computed from evidence
self-heals; one typed by hand rots, and rots invisibly. Recorded in
`copilot-dl-news/docs/agi/BOOT.md`. When adding a record type, ask what evidence
decides its state and compute it; if it must be typed, give it a probe that can
contradict it.

## Status

### Done

| # | Item | Where |
|---|---|---|
| 1 | **Cycle records are written by a tool**, not a hand-rolled script. Appends row + stanza, regenerates `repo-activity` and `progress.svg`, runs `stanza-schema`. Deliberately does NOT commit — the message is judgement. | `copilot-dl-news/tools/agi/close-cycle.js` |
| 2 | **Decision scaffold** — `--new "question"` writes a correctly-formed doc. The correct form is now the easiest form. | `copilot-dl-news/tools/agi/decisions.js` |
| 3 | **Registration is enforced.** Every doc in `docs/decisions/` must declare itself; `status: record` covers deliberate history so the list can reach zero. Probe fails on an unregistered OR malformed doc. | `copilot-dl-news/tools/dev/checks/decision-registration.check.js` |
| 5 | **Design rule written down** — derived by default, with the evidence for why. | `copilot-dl-news/docs/agi/BOOT.md` |
| 7 | **Lessons are visible.** 639 learned, 409 re-applied, 90 carried into more than one cycle. `--applied` answers the audit skill's question about which judgement actually sticks. | `copilot-dl-news/tools/agi/lessons.js` |
| 4 | **Tech state derived from evidence.** Optional `doneWhen` predicate per node (probe registered / exists / contains / ratchet); a disagreement with the typed state fails the `tech-state-evidence` probe. Acceptance test passed: 4 verified done, 1 verified pending, **0 contradictions**. | `copilot-dl-news/tools/agi/tech-state.js` |
| — | Decisions as data; board shows all open ones. | `copilot-dl-news/tools/agi/decisions.js`, `copilot-dl-news/src/ui/server/projectStatus/statusData.js` |

### Next — in this order

**4a. Drive the UNVERIFIED count down** *(now 2 of 23 — was 18)*

Twenty-one nodes carry predicates: **5 verified done, 16 verified pending, 0
contradictions.** Only `TECH-HEADLINE2` and `TECH-P5AUTO` remain unverified, both
deliberately — see below. **Item 4a is complete as far as it honestly goes.** The mechanism earned its keep immediately — **`TECH-CSLIVE`
was mislabelled `available` while its own deliverable
(`news-crawler-ui/checks/console.live.check.js`, the live harness for the
crawler UI) had shipped on 2026-08-03.** The predicate contradicted the typed
state, the file was read to confirm, and the node was promoted. Frontier went
6 grown/18 available → 7/17.

**Still unverified (7):** TECH-WORKORDERS, TECH-PRODUCTS, TECH-L3PROOF,
TECH-P5AUTO, TECH-HEADLINE2, TECH-PAGESLIVE, TECH-OWNERGUIDE.

Two are known-hard; record the reason rather than forcing a predicate:

- **TECH-HEADLINE2** — completed as a measured crawl outcome. No file proves it.
  Leave it.
- **TECH-P5AUTO** — typed `done`; the artifact was not found. Guessing risks a
  FALSE contradiction, worse than none. Needs ledger archaeology to find what it
  actually shipped.

The other five (WORKORDERS, PRODUCTS, L3PROOF, PAGESLIVE, OWNERGUIDE) each
describe a concrete artifact and should be checkable — read the node's
`research` text, find or name the artifact, add a `doneWhen`.

### A design question this surfaced

**Reviews recur; `done` does not.** The four review nodes now point at files in
`copilot-dl-news/docs/agi/reviews/`, which stops them vanishing — the ledger
shows a "second TECH-APPREVIEW run" that left no artifact at all. But the
predicate only means *"recorded at least once"*. A review of the crawler
architecture is worth repeating as the architecture changes, and the model has
no way to say a `done` node has gone stale.

Expressing that needs a recurring node kind — a change to the tree's model, not
to a predicate. Worth deciding before adding more review nodes. See
`copilot-dl-news/docs/agi/reviews/README.md`.

For each remaining node, read its `research` text and ask what artifact would
prove it — then add a `doneWhen`. Two rules:

- **Never invent a predicate to clear the count.** `TECH-HEADLINE2` completed as
  a measured crawl outcome and has no file-shaped evidence; leaving it unverified
  is the honest answer. A fabricated predicate reads exactly like a real one.
- **Expect contradictions and welcome them.** `TECH-CSLIVE` and
  `TECH-ENGINESPLIT` are both suspected mislabelled; a predicate that says so
  fails the probe until someone resolves it, which is the point.

The tree renderer in
`copilot-dl-news/src/ui/server/projectStatus/statusData.js` (`buildTechTree`)
still reads the typed `state`. Once the unverified count is low, switch it to the
derived verdict — that is the actual "derived by default" finish line.

**6. Triage `copilot-dl-news/docs/plans/`** — ✅ **done 2026-08-07**

*My earlier description of this was wrong on two counts, and the correction is
the useful part.* I wrote "twelve documents, mostly July, several superseded,
nothing reads them". Measured: **fifteen** documents, and `docs/plans/INDEX.md`
already existed and already declared per-plan status. Most are cited elsewhere
(the coordination-point migration plan has 33 references). "Nothing reads them"
was simply false — I had not looked.

What was actually wrong was subtler and worth more: **the index had rotted in
the same way the tech nodes had.** Its header said *Last Updated: 2026-03-08*
while the table described July plans; Completed and Archived were both empty
rows; and `2026-07-db-driven-crawling` was listed as active with "P5 next" while
`RESEARCH_BACKLOG.md` had recorded RB-012 as **Delivered, P1–P6 all shipped** —
for eighteen days. Two records, one fact, opposite answers.

Fixed: date corrected, the delivered plan moved to Completed citing RB-012 as
its authority, and the three genuinely orphaned documents (zero references, all
predating 2026-03) moved to Archived. Files stay — a dated plan is a record of
what was believed at the time, and cycle 208 settled that destroying such a
record to tidy the present is a bad trade.

Plan status is not mechanically derivable, so this index stays typed. The
obligation that comes with that is written into its header: move a row the day
its work lands, and cite the authoritative record rather than restating
progress from memory.

**8. Decisions as first-class UI**, not a text list. Each with its options
rendered as choices, a link to its document, and what it blocks. Needs no new
data — `decisions.js` already emits `options`, `blocks` and `doc`.

**9. Show *why* a node is locked.** The tree renders gated nodes but cannot yet
say "waiting on `DEC-ORPHANED-CONTENT`". Needs item 4 first, and needs `blocks:`
to point at real nodes — all four current decisions point at `CR-DB`, which is
honest but uninformative.

**10. Show the pipeline, not just state.** Finding → record → decision → work →
ledger. Every segment exists; nothing displays it as a flow, so "where does a
finding get stuck?" is unanswerable. This is the most speculative item.

## Where to stop

Items 8–10 are where record-keeping becomes app-building. The loop's own audit
skill warns about exactly this: what fraction of cycles improve the product
versus the loop's own instrumentation? Two-thirds of cycles 202–235 were
instrument work.

**If you find yourself doing item 10 before the crawler has run again, stop.**
The crawler is idle; that is the actual product.

## What none of this does

It does not answer a decision. Four remain open — run
`node tools/agi/decisions.js` from `copilot-dl-news/`. Making them visible,
well-formed and hard to lose is not the same as answering them, and answering
them is still what unblocks real work.
