# Decisions

Records of choices — both the ones already made and, importantly, **the ones
still waiting on the owner**.

A document here is not just a note. Files in this folder that carry front-matter
are read by `tools/agi/decisions.js` and projected onto the project-status board
at `:3184` under **PLAYER INPUT REQUIRED**. An open decision recorded here
reaches the owner; one recorded anywhere else does not.

## Why that matters

Before cycle 236 this folder held twelve documents that nothing parsed. The
board showed exactly one hardcoded item. Five real decisions sat invisible, and
the improvement loop stalled for **four consecutive cycles** waiting on
decisions that were never displayed. Front-matter is what closed that.

## The format

Put a front-matter block at the very top of the file, before the `#` heading:

```markdown
---
decision: DEC-ORPHANED-CONTENT
status: open
question: What happens to 15,061 orphaned content_storage rows?
options: [leave, re-link, delete-content-and-analysis]
blocks: [CR-DB]
---

# Your normal heading and prose follow
```

| field | required | meaning |
|---|---|---|
| `decision` | yes | stable id, `DEC-` prefix by convention |
| `status` | yes | `open` · `answered` · `closed` — nothing else parses |
| `question` | yes | one sentence, phrased as the choice the owner faces |
| `options` | no | `[a, b, c]` — the choices, rendered beside the question |
| `blocks` | no | tech/root ids this decision gates (e.g. `[CR-DB]`) |
| `answered` | no | for settled records: what was decided, and when |

**`status` is DECLARED, never inferred from prose.** Cycle 154 proved why: two
backlog rows carried the same real gate, one rendered clickable and one rendered
locked, purely because of which word the author typed. A decision's openness is
the same kind of fact.

## The three states

- **`open`** — the owner has to choose. Appears on the board and in the
  generated next-prompt. This is the only state that demands anything.
- **`answered`** — decided; work may still be outstanding. Keep the record so
  the decision is not re-litigated, and put the ruling in `answered:`.
- **`closed`** — no longer needs deciding, including when the question
  *dissolved*. `DEC-DEDUP-SCORING` is closed because after two identity guards
  there were no duplicates left to score.

**Answered ≠ delivered.** Wiring `decisionTreeEngine` was answered but not
built; that belongs in the backlog or tech tree as *work*, not here as a
pending decision. This folder tracks choices, not tasks.

## Working with it

```bash
node tools/agi/decisions.js          # what is open, and what is settled
node tools/agi/decisions.js --json   # same, for tooling
```

The CLI also lists any document here **without** front-matter. Those are
invisible to the board, and it says so loudly rather than skipping them — for
months `AGENTS.md` described a prose-only ADR format that predates this
convention, so a diligent agent could write a decision nobody would ever see.

Prose-only records are still perfectly legitimate for pure history (see
`2026-04-24-repo-slimdown.md`). The rule is simple: **if it needs an answer,
give it front-matter.**

## For agents

When you hit a choice only the owner can make — a live-database write, a
policy that affects third parties, a trade-off with no technically correct
answer — do not bury it in a cycle summary. Write a document here with
`status: open`, and it will reach them.
