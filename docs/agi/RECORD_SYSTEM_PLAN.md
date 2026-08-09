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

**4a. Drive the UNVERIFIED count down** *(now 13 of 23 — was 18)*

Ten nodes carry predicates: 5 verified done, 5 verified pending, 0
contradictions. The mechanism has already earned its keep — **`TECH-CSLIVE` was
mislabelled `available` while its own deliverable
(`news-crawler-ui/checks/console.live.check.js`, the live harness for the
crawler UI) had shipped on 2026-08-03.** The predicate contradicted the typed
state, the file was read to confirm, and the node was promoted. That is the
derived-state loop working end to end.

**Still unverified (13):** TECH-WORKORDERS, TECH-PRODUCTS, TECH-SUGGEST,
TECH-APPREVIEW, TECH-TREEREVIEW, TECH-L3PROOF, TECH-P5AUTO, TECH-HEADLINE2,
TECH-ENGINESPLIT, TECH-PAGESLIVE, TECH-OWNERGUIDE, TECH-ARCHREVIEW-TREE,
TECH-ARCHREVIEW-CRAWLER.

Three of those are known-hard and the reason should be recorded rather than
forced:

- **TECH-HEADLINE2** — completed as a measured crawl outcome. No file proves it.
  Leave it.
- **TECH-P5AUTO** — typed `done`; I could not find the artifact. Guessing a
  predicate risks a FALSE contradiction, which is worse than none. Needs ledger
  archaeology to find what it actually shipped.
- **TECH-ENGINESPLIT** — partial by nature (five of seven clusters home), and a
  boolean predicate cannot express that. The `engine-debt-ratchet` probe carries
  no `--max`, so a ratchet predicate has nothing to read; giving it one would
  make this checkable.

The five review/analysis nodes (APPREVIEW, TREEREVIEW, ARCHREVIEW-*, SUGGEST)
produce documents or item lists, so an `exists` predicate on their output is
probably right once someone decides where that output lives.

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

**6. Triage `copilot-dl-news/docs/plans/`**

Twelve documents, mostly July 2026, several superseded (RB-012's plan is
delivered end to end), nothing reads them. They are the next `docs/decisions/`
if left alone. Either give them front-matter with a status, or move the dead
ones to an archive directory. Decide per document; do not bulk-delete.

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
