---
decision: DEC-UI-DEBT-METRIC
status: answered
question: Redefine ui-debt so by-reference extraction counts, retire it to a floor, or leave it?
answered: Redefined as "files not yet sourced FROM news-crawler-ui" and shipped in cycle 235.
---

# ui-debt audit: of 351 files, 5 are dead — the number is not measuring debt

**Date:** 2026-08-07 (cycle 227)
**Status:** audit complete; **the ratchet's definition needs an owner decision**
**Owner instruction:** "If possible, use references to keep the monorepo code
functional, though express it elsewhere. Do a detailed review of what is
actually still debt."

## What the 351 actually contains

The ratchet counts git-tracked files under `src/ui/` excluding
`server/projectStatus`. It has never been broken down. Measured this cycle:

### By wiring

| bucket | files | dirs |
|---|---:|---:|
| **wired** — named in a `package.json` script, or required from outside `src/ui` | **249** | 32 |
| touched since 2026-07-01 but not externally wired | 12 | 8 |
| neither | 90 | 61 |

That first pass understates how live it is, because a control used only by
another `src/ui` file counts as unwired — exactly the mistake that
misclassified `hubGuessing` in cycle 173. Re-run with **repo-wide** basename
references, including inside `src/ui`, only **63** of 351 files are referenced
nowhere.

### What those 63 are

| kind | count | dead? |
|---|---:|---|
| `*.check.js` / `*.test.js` | 36 | **No** — entry points invoked BY PATH. Cycles 209/211 established this; deleting them on basename evidence is the known error. |
| screenshots and other assets | 21 | No — check artifacts |
| docs / css | 1 | No |
| **code referenced nowhere** | **5** | **the actual candidates** |

The five:

```
src/ui/server/docsViewer/plugins/svg-editor/svg-editor.e2e.playwright.js
src/ui/server/shared/isomorphic/controls/interactive/ConnectorControl.js
src/ui/server/utils/sassCompiler.js
src/ui/test/pager-button-state.js
src/ui/utils/listenerBag.js
```

Three of them last changed in December 2025 and have no dynamic reference
either. (`svg-editor.e2e.playwright.js` is arguably a sixth entry point rather
than dead code — playwright specs are run by path.)

## The conclusion

**`ui_debt: 351` is not a debt measure.** Roughly 1.4% of what it counts is
dead. The rest is live, maintained, operational UI — plus its own test and
check surface. Nine cycles of treating it as a backlog to burn down were
treating a healthy surface as rot.

What the number actually measures is *how much UI lives in the monorepo*, which
is a fine thing to track — but it is a **migration progress** metric, not a
debt metric, and the difference matters because it changes what counts as a
win.

## The contradiction that now needs resolving

The check's own header states the two legal ways down:

> - a UI moves to news-crawler-ui and the monorepo copy is **DELETED**
>   (a migration is done when the old thing is gone — cycle 161), or
> - a stale UI dir is **RETIRED in place**

The owner's instruction is to extract **by reference**, keeping the monorepo
functional. Under the current definition that produces **no movement at all**:
if the monorepo keeps depending on the extracted package, the file count under
`src/ui` does not fall, so a successful by-reference extraction registers as
zero progress. And the second route — retire stale dirs — has at most 5 files
left to give.

So the ratchet as defined cannot be satisfied by the strategy the owner has
chosen. That is why it has not moved in nine cycles, and it will not move
again.

## Options for the owner

1. **Redefine the metric as "UI files not yet sourced from news-crawler-ui"** —
   a file counts as extracted once the monorepo consumes it from the package,
   whether or not a local copy remains during transition. This makes
   by-reference extraction visible as progress, which is what the instruction
   requires.
2. **Retire the ratchet, keep a no-growth floor.** Freeze the ceiling at 351 as
   a tripwire against new operational UI being added to the monorepo, and stop
   treating the number as work.
3. **Leave it.** Accept that it will read 351 indefinitely and stop listing it
   as a queue item.

Recommendation: (1) if the extraction is genuinely going to happen, (2) if it
is not. What should not continue is carrying it as a backlog item, since the
audit shows there is no backlog — there are five files.

## Also worth doing regardless

The five candidates above are worth a verdict, but they total five files and
will not move a number. They should be handled as ordinary cleanup, not as
"ui-debt progress".
