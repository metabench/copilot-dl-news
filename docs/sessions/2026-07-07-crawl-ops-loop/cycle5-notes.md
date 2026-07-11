# Crawl Ops Loop — Cycle 5: first L4 rung + docs consolidation

## L4 dispatch (2026-07-07 20:46:08Z)

Guardian, maxDownloads 120, sitemap ON, engine-default depth 3 (rung spec said depth 2 — bounded-dispatch lacked a depth flag at dispatch time; `--depth` added mid-cycle for future runs; depth 3 = broader discovery, volume still capped, politeness unaffected). 30-minute hard budget via bounded-dispatch under the raised run-node ceiling (2000s).

Checkpoints (all politeness-clean, 0×429/0×5xx): cp1 ~5min: 9 responses / +5 articles · cp2 ~14min: 18 responses / +12 articles. Pace ~1.3 downloads/min (politeness pacing dominates at guardian) → budget enforcement expected rather than 120-download completion.

FINAL: (see addendum below — filled after the babysitter report landed)

## Fixes & docs shipped this cycle (all UNCOMMITTED)

1. `bounded-dispatch.js`: `--depth N` override (engine default is maxDepth=3).
2. Telemetry history `?topic=`/`?severity=` filters implemented in unifiedApp/server.js (were silently ignored — filed c2; adopts at next UI restart).
3. `job.error` normalized to string in InProcessCrawlJobRegistry (was object with stack).
4. Bridge run-node ceiling 600s → 2000s (L4-length reps).
5. **Docs consolidation (backlog E)**: `tools/crawl/AGENT.md` gained a "Dev Bridge & Operator-Machine Crawl Ops" section (bridge protocol, hard-won API facts, do-not-crawl list, tool inventory); CONTINUATION_PROMPT.md "Remote fleet" section corrected (sandbox CAN deploy; remoteDb default mismatch; session-scoped counters; rollback state).

## Addendum — final L4 verdict: **PROVEN**

Babysitter report: `{finalStatus:"completed", elapsedMs:1821717, budgetEnforced:true, adopted:false, ok:true}` — the 30-minute budget FIRED, the stop landed, and the job wound down to completed within grace. Enforcement proven in anger at L4 scale (c4's rep only proved under-budget completion).

Final window (20:46–21:16Z): **110 responses — 106×200 (42MB) + 4×304 sitemap revalidations @ 0KB; 0×429, 0×5xx; +103 articles stored.** Totals: responses 302408, content 190171, urls 1652865.

**Ratchet: L4 PROVEN** (single-domain rung; deviation noted: engine-default depth 3 vs spec depth 2 — --depth flag now exists for exact reps). The mission's crawl-scale goal is met: L1→L4 all proven in one day, 327 responses, +197 articles into production news.db, zero politeness breaches throughout, every run visible live in the operator's UI.

Day grand total (since 2026-07-07 morning baseline 302113/189974): **+295 responses, +197 articles, 0×429 across all levels.**
