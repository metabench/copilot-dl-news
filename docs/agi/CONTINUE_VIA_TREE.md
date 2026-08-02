# CONTINUE — take your task from the tech tree

Paste this file as the prompt, or say "follow docs/agi/CONTINUE_VIA_TREE.md".
Start in `C:\Users\james\Documents\repos\copilot-dl-news`.

---

## The board decides, not this prompt

Your interface is the planning UI at **http://localhost:3184**. This prompt tells
you how to read it and how to write back to it. It deliberately does **not** tell
you what to work on — the tree does that. If you find yourself picking work
because this document implied it, you have misread the instruction.

Start the app if it is not up (it is a `.claude/launch.json` entry called
`project-status`; the bundle publishes at boot, so give it ~40s). Open the page
to see what the owner sees, but treat **`/api/status`** as the source of truth —
it carries the whole payload the board renders.

## Read in this order. Stop at the first thing that has content.

**1. Pending owner signals — these outrank everything.**
```bash
node tools/agi/ack-signal.js          # lists pending
node tools/dev/run-probes.js          # agi-signal RED = the owner is talking
```
A ⚡ pending record in `data/agi-signals.jsonl` is the owner having clicked BEGIN
RESEARCH on a node. That is a direct instruction. Take it up, then:
```bash
node tools/agi/ack-signal.js <id> "<what you actually did>"
```
If you fire a click yourself while testing, **ack it as a test click** so it can
never burn a real request.

**2. AWAITING OWNER DECISION** in the WORK panel (`playerInput` in the payload).
If something is genuinely blocked on the owner, surface it and stop — do not
route around it.

**3. The board.** Available nodes are the gold-bordered ones. For any candidate:
```bash
curl -s "http://localhost:3184/api/node?id=<TECH-ID>"   # record + ledger trail
```
The detail panel's fields — RESEARCH MEANS, BUILT FROM, DETAIL, PRELIMINARY DATA,
LEDGER TRAIL — are what you are choosing from.

**4. PATH AHEAD.** The NOW card is the declared current block.

## The tree is drifted. Repairing it IS legitimate work.

Measured 2026-08-02, so check rather than trust:

- **The first available node in reading order is `RB-001`** — 117 cycles old, a
  one-line remainder, and three statements in its own detail are false. Taking it
  at face value produces stale work.
- **44 of 46 prerequisite edges point at permanent roots**, so they are decorative;
  only two encode a real dependency, and one of those is offered for research
  before its prerequisite exists.
- **76% of the nodes are the loop's own machinery**, not the news product. The
  board will steer you toward improving the board.
- **The NOW card is 26 cycles stale** (`config/roadmap.json` is `asOf 2026-07-27`).
- A `grown` node can still advertise an artifact that was later deleted —
  `TECH-DATALINKS` is the known case.

**So: before adopting a node, verify its claims against `git log` and the ledger.
If it is stale, wrong or already done, fixing or retiring that node is the
cycle's work.** Say so in the ledger row. A board the owner can trust is worth
more than one more feature rendered on an untrustworthy board.

**Bias toward the `crawler` branch** when the tree offers a genuine choice.
Product output collapsed to 26 pages across 40 cycles while the loop reported
healthy, which is why `cycle-metrics` now carries a git-derived product term and
currently reads **BLOATING**. If the board genuinely offers nothing but machinery
work, that is itself the finding — report it rather than manufacturing a task.

## Write back to the UI while you work

The owner watches :3184 live. Report at phase boundaries only — 4–6 per cycle,
records under 20s apart are dropped:
```bash
node tools/agi/report-progress.js orient    "what the board is showing me" --cycle N
node tools/agi/report-progress.js building  "..." --cycle N
node tools/agi/report-progress.js verifying "..." --cycle N
node tools/agi/report-progress.js closing   "..." --cycle N
```
Updates reach the open page in ~100ms over SSE. It never fails a cycle.

## Close the loop back into the tree

A cycle is not done when the code works — it is done when the board says so.

1. **Promote the node.** RB-* techs read their state live from the state column in
   `docs/agi/RESEARCH_BACKLOG.md`; curated `TECH-*` nodes carry `state` in
   `config/tech-tree.json`. An unknown state throws rather than defaulting to
   actionable, so this is checked.
2. Ledger row + `<!-- cycle:{...} -->` stanza — including what did not work. Book a
   post-ship defect against the cycle that **shipped** it, not the one that found it.
3. `node tools/agi/repo-activity.js && node tools/agi/progress-svg.js`
4. `npx jest tools/agi src/ui/server/projectStatus && node tools/dev/run-probes.js`
   — `tech-tree-schema` validates the spec you just edited.
5. Commit, push, then `node tools/agi/next-prompt.js`.

## Gates — these bind, and probes check most of them

Live `news.db` writes are owner-gated · both ~30 GB backups must keep existing ·
Defender exclusions are owner-only · never weaken politeness or 429 backoff ·
crawler concurrency default ≤ 3 · installing skills or hooks needs approval, and
`config/gated-surfaces.json` must record it (the scan covers `.claude/skills` and
`~/.claude/skills`).

## Verify by measuring

The `jsgui3-verify` and `loop-audit` skills load automatically; use them.

Measure the runtime, never infer it from source — three confident source-read
claims were measured false in a single session. Read content rather than counting
it: a check that counted 2 chips passed while every chip was blank for two
cycles. Read command output before quoting a number — "21/21 probes" reached six
ledger rows while the real run was 19 pass / 1 fail / 1 skip.

## Known-red, not your bug

`bridge-health` and `frontier-api` are red whenever Electron is down; the crawl
server on :3170 needs it. The Oracle box at `141.144.193.218:3300` is separate
and was up on 2026-08-02.
