# Reviews

Durable output from the tech tree's review nodes — `TECH-APPREVIEW`,
`TECH-TREEREVIEW`, `TECH-ARCHREVIEW-TREE`, `TECH-ARCHREVIEW-CRAWLER`.

## Why this directory exists

Those nodes were being *performed* without leaving anything behind. The ledger
records a "second TECH-APPREVIEW run" — so that review happened at least twice,
and its findings went into cycle rows and code changes rather than into a
document anyone could re-read. The review was real; the record was not.

Each review node now carries a `doneWhen` predicate pointing at its file here,
so a review that leaves no artifact does not count as performed.

| node | its record |
|---|---|
| `TECH-APPREVIEW` | `tech-tree-app-review.md` |
| `TECH-TREEREVIEW` | `tree-and-plans-review.md` |
| `TECH-ARCHREVIEW-TREE` | `architecture-tree-app.md` |
| `TECH-ARCHREVIEW-CRAWLER` | `architecture-crawler.md` |

Check with `node tools/agi/tech-state.js`.

## An unresolved design question

**Reviews recur; `done` does not.** A tech node is `available` or
`done`+`researchedOn`, which suits a thing you build once. A review of the
crawler architecture is worth repeating as the architecture changes, so
"done" is the wrong shape for it.

The current predicate means *"this review has been recorded at least once"* —
enough to stop them vanishing, not enough to express staleness. If a review
should expire, the tree needs a recurring node kind, and that is a change to
the model rather than to a predicate. Recorded in
`docs/agi/RECORD_SYSTEM_PLAN.md`.

## What a review should contain

Whatever the node's own `research` text asks for, plus the two things every
record in this repo is expected to carry:

- **measurements, not impressions** — the numbers behind each finding
- **what you could not determine**, stated plainly, rather than rounded up

A review that only finds problems is not calibrated; say what is healthy too.
