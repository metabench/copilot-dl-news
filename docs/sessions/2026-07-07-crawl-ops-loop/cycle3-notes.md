# Crawl Ops Loop — Cycle 3: L3 PROVEN (scale + politeness); bounds need one more rep

## Campaign (2026-07-07 20:21–20:29Z, guardian + apnews, 25pp each, sitemap ON, into data/news.db)

Both jobs **completed** (guardian 20:27:51, apnews 20:28:45). Window: **88 responses — apnews 58×200 (1.2MB), guardian 27×200 (10MB) + 3×304 @ 0KB** — the cycle-15 conditional sitemap fetch REVALIDATING LIVE in production (repeat domain → 304s, zero re-download). Politeness: **0×429, 0×5xx**. contentAdded 25; urls +5,240 (sitemap discovery); totals: responses 302266, content 190046.

**Ratchet verdict: L3 PROVEN for scale + politeness.** Wall-clock enforcement NOT yet proven (below) — L4 stays blocked until one clean bounded rep.

## Tools shipped

- `domain-preflight.js` (read-only, 2 requests/host): immediately caught **Reuters = bot-challenge (401 + captcha marker)** — would have burned the slot exactly like NPR in c2. bbc/apnews/cbsnews = ok. Preflight is now mandatory before any new-domain dispatch.
- `bounded-dispatch.js`: dispatch + poll + /stop at budget. v1 defect found: 15s API timeouts die under load → **in-process crawls starve the UI server's event loop** (both babysitters aborted; jobs orphaned). Fixed to 60s; needs an adopt-orphan mode (look up job by startUrl/createdAt when the dispatch POST times out but the job was created).
- `recent-errors.js` truncation fixed (shrinks row sets, never cuts mid-string). Bridge `run-node` now takes `timeoutMs` (≤600s) with watchdog auto-extension.

## Findings

1. **In-process crawl jobs degrade the UI server's API** (stalls >15-20s under 2 concurrent crawls). Long-term: worker-process mode or event-loop relief; short-term: 60s client timeouts + patient polling.
2. Job routes require FULL UUIDs (prefix → 404 — cost one confused stop round).
3. Stop semantics: jobs may also self-complete at maxDownloads while stops are in flight; terminal state can lag stop by ~1 min (graceful wind-down).
4. Reuters joins NPR on the do-not-crawl list (bot-challenged 2026-07-07).

## Next-rep requirement for L4 eligibility

One L3-scale run where bounded-dispatch (60s timeouts + adopt-orphan) demonstrably enforces its budget (budgetEnforced:true in its report, or clean completion under budget). Then L4 (120pp depth2, bounds mandatory, single domain first).
