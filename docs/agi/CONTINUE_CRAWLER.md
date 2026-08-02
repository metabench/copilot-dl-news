# CONTINUE — the news crawler (session starter)

Paste this whole file as the prompt, or say "follow docs/agi/CONTINUE_CRAWLER.md".
Start the session in `C:\Users\james\Documents\repos\copilot-dl-news`.

---

## Your task: work on the CRAWLER — the product, not the machinery

This is a deliberate pivot, and the reason is measured, not editorial.

An audit on 2026-08-02 found that product output had collapsed while the loop
kept reporting healthy. Pages crawled per 20-cycle bin: **430 / 1,446 / 9,038 /
5,942 / 0 / 26.** Zero lines changed in the crawler engine between cycles 127 and
163. Over that stretch the loop added 114 scaffold items, retired 23, and rewrote
the tech-tree UI three times.

It could not see this about itself: `deriveVerdict` had three inputs and all
three were fields the agent typed into its own stanza. That is now fixed — a
git-derived `productOutcome` term vetoes COMPOUNDING when nothing ships. **Run
`node tools/agi/cycle-metrics.js` first. It currently says BLOATING**
(scaffold 372:89, 4.2:1). Your job is to move that honestly, by shipping crawler
work — not by pruning until the number looks better.

## Orient (do this before deciding anything)

```bash
node tools/dev/run-probes.js          # 21 probes; expect bridge-health red while Electron is down
node tools/agi/cycle-metrics.js       # the verdict, now with a product term
node tools/agi/next-prompt.js         # the loop's own suggested selection
```

Read `docs/agi/BOOT.md`. Then check reality rather than assuming it:

- **The crawl server on :3170 is DOWN** (Electron is not running). Nothing can
  crawl until it is up. `bridge-health` and `frontier-api` are red for that
  reason alone and are not defects.
- **The Oracle box IS up** — `http://141.144.193.218:3300` returned 200.
- Last real crawler-engine commit: **2026-07-29** (anti-zombie worker liveness).

## What is actually open on the crawler

Three available nodes in the `crawler` branch of the tech tree:

| Node | What it is |
| --- | --- |
| `TECH-HEADLINE2` | Frontier Headline Quality II — the product lever: are crawls yielding real headlines rather than section hubs |
| `TECH-CSLIVE` | Crawl-Status Live Checks |
| `TECH-ARCHREVIEW-CRAWLER` | Architectural improvements — crawler |

Also open, from the standing directive: **run a real crawl and report the
headlines.** That is the one activity that moves `pages_crawled` off zero, and it
has not happened meaningfully in 40 cycles.

Prefer `TECH-HEADLINE2` or a real crawl over the review node. A review of the
crawler produces findings; the audit already showed this loop is better at
generating findings than at shipping. Ship something that fetches pages.

## Standing gates — these bind, and a probe checks most of them

- **Live `news.db` writes** are owner-gated. The crawler writes; the agent does not.
- **The two ~30 GB backups must continue to exist.**
- **Defender exclusions are owner-only** — agents must not modify security settings.
- **Politeness is never weakened** — do not touch 429 backoff escalation, and do
  not shrink per-host crawl delays. A slow host with a regular gap is robots
  compliance working, not dead time.
- **Crawler concurrency default stays ≤ 3.**
- **Installing skills or hooks needs owner approval**, and the baseline in
  `config/gated-surfaces.json` must be updated with the approval when it is given.
  The scan covers both `.claude/skills` and `~/.claude/skills`.

## How to verify — this project has paid for these rules

Two skills load automatically; use them.

- **`jsgui3-verify`** — if you touch anything under `src/ui/server/*/controls/`.
- **`loop-audit`** — if asked how the tree, ledger or loop is doing.

Rules that were learned the expensive way:

1. **Measure the runtime; do not infer it from the source.** Three confident
   claims made by reading code were all later measured false in one session.
2. **Read content, do not count it.** A check that counted 2 chips passed while
   every chip was blank for two cycles.
3. **Read the output before quoting it.** "21/21 probes" was written into six
   ledger rows and two commits while the real run was 19 pass / 1 fail / 1 skip.
4. **A silent `catch` is how a dead feature survives.** Log the swallow.
5. **Crawl throughput is bounded by the event loop and by politeness**, not by
   the bandwidth cap. Before running a perf trial, check the resource you are
   varying is actually the binding one.
6. **Never probe slow queries inline against the live `news.db`** — use
   `tools/db/timed-probe.js`, which has an external-kill watchdog.

## Close the cycle (every turn, no exceptions)

- Ledger row + `<!-- cycle:{...} -->` stanza in `docs/agi/IMPROVEMENT_LEDGER.md`,
  including anything that did not work. Book a post-ship defect against the cycle
  that **shipped** it, not the cycle that found it.
- `node tools/agi/repo-activity.js && node tools/agi/progress-svg.js`
- `npx jest tools/agi src/ui/server/projectStatus` and `node tools/dev/run-probes.js`
- commit + push, then `node tools/agi/next-prompt.js`

## The honesty condition

If a cycle ships no product change, say so in the row rather than counting the
instrumentation as an improvement. The verdict will now catch it anyway —
`SELF-REFERENTIAL` fires when product churn is zero — so the only thing a
flattering write-up costs you is the record's credibility.

If the right answer is "this needs an owner decision", stop and ask. The loop
escaped a documented 30-cycle busy-work block (cycles 95–124) exactly once, and
it escaped by asking.
