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

## Reviews recur — decided 2026-08-07

A tech node is `available` or `done`+`researchedOn`, which suits a thing you
build once. A review of the crawler architecture is worth repeating as the
architecture changes, so `done` was the wrong shape for it.

**Decision: review nodes are `recurring`, and staleness is DERIVED, not
declared.** Each carries a `reviewOf` predicate naming both its record and the
subject it reviews:

```json
"recurring": true,
"doneWhen": {
  "record":   "docs/agi/reviews/architecture-crawler.md",
  "reviewOf": "src/core/crawler"
}
```

`tools/agi/tech-state.js` then reports one of three things, from git dates:

| state | meaning |
|---|---|
| **never recorded** | the record does not exist — the review has not been done |
| **current** | the record is newer than the last change to its subject |
| **STALE** | the review happened, and the thing it reviewed has moved on since |

Two deliberate choices:

- **Derived, not typed** — per the `docs/agi/BOOT.md` rule. Nobody has to
  remember to mark a review stale; the subject changing does it.
- **Stale is information, not a failure.** The `tech-state-evidence` probe fails
  only on a contradiction between evidence and typed state. A repo under active
  development would otherwise be permanently red, and a guard that is always red
  is a guard nobody reads.

Re-run a review when its subject moves. Overwrite the file; git keeps the
previous one.

## What a review should contain

Whatever the node's own `research` text asks for, plus the two things every
record in this repo is expected to carry:

- **measurements, not impressions** — the numbers behind each finding
- **what you could not determine**, stated plainly, rather than rounded up

A review that only finds problems is not calibrated; say what is healthy too.
