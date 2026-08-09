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
| — | Decisions as data; board shows all open ones. | `copilot-dl-news/tools/agi/decisions.js`, `copilot-dl-news/src/ui/server/projectStatus/statusData.js` |

### Next — in this order

**4. Derive TECH state from evidence** *(the one everything visual depends on)*

23 curated nodes in `copilot-dl-news/config/tech-tree.json` carry a hand-typed
`state`; 3 RB-backed nodes derive theirs live and "cannot disagree". The typed
ones rotted — `TECH-ENGINESPLIT` reads *available* beside its own note saying
five of seven clusters are already home, and `asOf` is stale.

Add a predicate per node and compute state:

```json
"doneWhen": { "probe": "crawl-console-live" }
"doneWhen": { "ratchet": "ncdb-debt", "atMost": 140 }
"doneWhen": { "exists": "tools/dev/checks/gate-declaration.check.js" }
```

*Acceptance test, non-negotiable:* run it against the **six nodes already marked
`done`** — it must agree on all six before it is trusted on the other seventeen.
This is `TECH-PROMOTE`'s own research, so it is a node the tree has been
offering all along, not new scope.

Touches: `copilot-dl-news/config/tech-tree.json`,
`copilot-dl-news/src/ui/server/projectStatus/statusData.js` (`buildTechTree`).
Note that builder throws on a bad record by design — keep that.

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
